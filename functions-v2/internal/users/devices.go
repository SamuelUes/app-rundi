package users

// devices.go — reconocimiento de dispositivo post-reinstall (login directo).
//
// El deviceId es estable entre instalaciones: UUID en iOS Keychain (sobrevive
// uninstall) o ANDROID_ID en Android. El secret lo genera el cliente y solo
// vive en almacenamiento seguro del SO — el servidor guarda sha256(secret)
// (generado con aleatoriedad criptográfica). Si el secret no sobrevivió la
// reinstalación, se requiere iniciar sesión manualmente.
//
// Sin outbox: tabla interna de credenciales — no hay proyección Firestore ni
// consumidores downstream (mismo criterio que driver_sessions/rate limits).

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/middleware"
)

type deviceRegisterRequest struct {
	DeviceID   string `json:"deviceId"`
	Secret     string `json:"deviceSecret"`
	Platform   string `json:"platform,omitempty"`
	AppVersion string `json:"appVersion,omitempty"`
}

type deviceAuthRequest struct {
	DeviceID string `json:"deviceId"`
	Secret   string `json:"deviceSecret"`
}

type recognizeResponse struct {
	Recognized   bool    `json:"recognized"`
	Name         *string `json:"name,omitempty"`
	ProfilePhoto *string `json:"profilePhoto,omitempty"`
}

func deviceSecretHash(secret string) string {
	sum := sha256.Sum256([]byte(secret))
	return hex.EncodeToString(sum[:])
}

func validDeviceID(id string) bool {
	l := len(strings.TrimSpace(id))
	return l >= 8 && l <= 128
}

// RegisterDevice — POST /v1/users/me/devices (autenticado). Upsert del par
// (device_id, user_id), revocando los demás vínculos de la cuenta y dispositivo.
func (s *Service) RegisterDevice(ctx context.Context, uid string, req deviceRegisterRequest) error {
	if uid == "" {
		return apperr.New(401, "missing uid")
	}
	if !validDeviceID(req.DeviceID) {
		return apperr.New(400, "invalid deviceId")
	}
	if l := len(req.Secret); l < 16 || l > 256 {
		return apperr.New(400, "invalid deviceSecret")
	}
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	// Serializa registros simultáneos que pueden compartir cuenta o dispositivo.
	if _, err = tx.Exec(ctx, `SELECT pg_advisory_xact_lock(721861901)`); err != nil {
		return err
	}
	if _, err = tx.Exec(ctx, `
		UPDATE public.user_devices SET revoked_at = NOW()
		WHERE revoked_at IS NULL AND (device_id = $1 OR user_id = $2)
		  AND NOT (device_id = $1 AND user_id = $2)`, req.DeviceID, uid); err != nil {
		return err
	}
	_, err = tx.Exec(ctx, `
		INSERT INTO public.user_devices (device_id, user_id, secret_hash, platform, app_version)
		VALUES ($1, $2, $3, NULLIF($4, ''), NULLIF($5, ''))
		ON CONFLICT (device_id, user_id) DO UPDATE SET
		  secret_hash = EXCLUDED.secret_hash,
		  platform = EXCLUDED.platform,
		  app_version = EXCLUDED.app_version,
		  last_seen_at = NOW(),
		  revoked_at = NULL`,
		req.DeviceID, uid, deviceSecretHash(req.Secret), req.Platform, req.AppVersion)
	if err != nil {
		return err
	}
	return tx.Commit(ctx)
}

// RecognizeDevice — POST /v1/auth/devices/recognize (público, App Check +
// rate limit). Solo revela datos si el dispositivo posee la credencial.
func (s *Service) RecognizeDevice(ctx context.Context, deviceID, secret string) (*recognizeResponse, error) {
	if !validDeviceID(deviceID) || len(secret) < 16 || len(secret) > 256 {
		return &recognizeResponse{Recognized: false}, nil
	}
	var name, photo *string
	err := s.pool.QueryRow(ctx, `
		SELECT u.name, u.profile_photo
		FROM public.user_devices d
		JOIN public.users u ON u.id = d.user_id
		WHERE d.device_id = $1
		  AND d.secret_hash = $2
		  AND d.revoked_at IS NULL
		  AND u.is_active
		  AND u.deleted_at IS NULL
		ORDER BY d.last_seen_at DESC
		LIMIT 1`, deviceID, deviceSecretHash(secret)).Scan(&name, &photo)
	if err == pgx.ErrNoRows {
		return &recognizeResponse{Recognized: false}, nil
	}
	if err != nil {
		return nil, err
	}
	// recognize corre pre-auth: el cliente no puede hacer getDownloadURL de un
	// bucket privado — se devuelve URL firmada lista para <img>/<Image>.
	if photo != nil && *photo != "" && s.signer != nil && !strings.HasPrefix(*photo, "http") {
		if signed, signErr := s.signer.SignURL(*photo, 15*time.Minute); signErr == nil && signed != "" {
			photo = &signed
		} else {
			photo = nil
			// Sin roles/iam.serviceAccountTokenCreator en el propio SA el
			// signBlob sale 403 — avisar para no depurar a ciegas.
			slog.Warn("devices: no se pudo firmar profile photo", "err", signErr)
		}
	} else if photo != nil && *photo != "" && !strings.HasPrefix(*photo, "http") {
		photo = nil
	}
	return &recognizeResponse{Recognized: true, Name: name, ProfilePhoto: photo}, nil
}

// DeviceToken — POST /v1/auth/devices/token (público). Verifica
// deviceId+secret y mintea un custom token de Firebase Auth. Los custom
// claims (role/isDriver) son a nivel de cuenta y ya viajan en el token.
func (s *Service) DeviceToken(ctx context.Context, deviceID, secret string) (string, error) {
	if !validDeviceID(deviceID) || len(secret) == 0 {
		return "", apperr.New(400, "invalid credentials")
	}
	var uid string
	err := s.pool.QueryRow(ctx, `
		SELECT d.user_id
		FROM public.user_devices d
		JOIN public.users u ON u.id = d.user_id
		WHERE d.device_id = $1
		  AND d.secret_hash = $2
		  AND d.revoked_at IS NULL
		  AND u.is_active
		  AND u.deleted_at IS NULL
		ORDER BY d.last_seen_at DESC
		LIMIT 1`, deviceID, deviceSecretHash(secret)).Scan(&uid)
	if err == pgx.ErrNoRows {
		return "", apperr.New(401, "device not authorized")
	}
	if err != nil {
		return "", err
	}

	client, err := s.app.Auth(ctx)
	if err != nil {
		return "", err
	}
	token, err := client.CustomToken(ctx, uid)
	if err != nil {
		return "", err
	}
	// Marca actividad del par para el desempate de recognize (teléfono
	// compartido). Best-effort: el token ya está emitido.
	_, _ = s.pool.Exec(ctx,
		`UPDATE public.user_devices SET last_seen_at = NOW() WHERE device_id = $1 AND user_id = $2`,
		deviceID, uid)
	return token, nil
}

func (h *Handler) registerDevice(w http.ResponseWriter, r *http.Request) {
	var body deviceRegisterRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	if err := h.svc.RegisterDevice(r.Context(), uid, body); err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// RecognizeDevice — handler público montado fuera del grupo Auth.
func (h *Handler) RecognizeDevice(w http.ResponseWriter, r *http.Request) {
	var body deviceAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	out, err := h.svc.RecognizeDevice(r.Context(), body.DeviceID, body.Secret)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, out)
}

// DeviceToken — handler público: deviceId+secret → Firebase custom token.
func (h *Handler) DeviceToken(w http.ResponseWriter, r *http.Request) {
	var body deviceAuthRequest
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		apperr.Write(w, apperr.New(400, "invalid body: "+err.Error()))
		return
	}
	token, err := h.svc.DeviceToken(r.Context(), body.DeviceID, body.Secret)
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"customToken": token})
}
