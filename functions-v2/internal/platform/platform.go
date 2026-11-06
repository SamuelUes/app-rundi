// Package platform — misceláneos de plataforma: analytics events, log de
// autenticación biométrica, códigos SMS, disponibilidad de región,
// preflight/terms y tokens de compartir viaje (público).
package platform

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"

	firestore "cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/geo"
)

const termsVersion = "2024-01" // versión de términos preflight vigente

type Service struct {
	pool     *pgxpool.Pool
	fs       *firestore.Client
	shareKey []byte // secreto HMAC para tokens de share
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client, shareSecret string) *Service {
	return &Service{pool: pool, fs: fsClient, shareKey: []byte(shareSecret)}
}

// ---------- analytics_events ----------

// TrackEvent — inserta evento de analytics (append-only).
func (s *Service) TrackEvent(ctx context.Context, uid, eventType string, data map[string]any, ip, ua, platform, appVersion string) error {
	if eventType == "" || len(eventType) > 50 {
		return apperr.New(400, "eventType inválido")
	}
	raw, _ := json.Marshal(data)
	_, err := s.pool.Exec(ctx, `
		INSERT INTO public.analytics_events
			(user_id, event_type, event_data, ip_address, user_agent, platform, app_version)
		VALUES ($1, $2, $3, NULLIF($4,''), NULLIF($5,''), NULLIF($6,''), NULLIF($7,''))`,
		uid, eventType, raw, ip, ua, platform, appVersion)
	return err
}

// ---------- biometric_authentications ----------

// LogBiometric — registra un intento biométrico (éxito o fallo).
func (s *Service) LogBiometric(ctx context.Context, uid, userType, bioType, bioContext string, success bool, attempt int, errMsg, rideID string) error {
	if userType == "" || bioType == "" {
		return apperr.New(400, "userType y biometricType requeridos")
	}
	switch bioType {
	case "fingerprint", "face_id", "biometric", "NOT_SUPPORTED":
	default:
		// El cliente reporta también métodos no biométricos (p.ej.
		// 'apple_signin'); el enum solo admite tipos de biometría.
		bioType = "biometric"
	}
	if attempt <= 0 {
		attempt = 1
	}
	var ride any
	if rideID != "" {
		ride = rideID
	}
	var em *string
	if errMsg != "" {
		em = &errMsg
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO public.biometric_authentications
			(ride_id, user_id, user_type, biometric_type, context, success, attempt_number, error_message)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
		ride, uid, userType, bioType, bioContext, success, attempt, em)
	return err
}

// ---------- sms_verification_codes ----------

// LogSMSCode — logSmsVerificationCode v1: guarda hash del código (nunca en claro).
func (s *Service) LogSMSCode(ctx context.Context, uid, phone, email, code, smsContext, rideID string) error {
	if code == "" || (phone == "" && email == "") {
		return apperr.New(400, "code y phone o email requeridos")
	}
	sum := sha256.Sum256([]byte(code))
	var ride any
	if rideID != "" {
		ride = rideID
	}
	var ph, em *string
	if phone != "" {
		ph = &phone
	}
	if email != "" {
		em = &email
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO public.sms_verification_codes
			(ride_id, user_id, phone_number, email, is_email, code, code_hash, context)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, $7, $8)`,
		ride, uid, ph, em, email != "", code, fmt.Sprintf("%x", sum), smsContext)
	return err
}

// VerifySMSCode — verifica código: existe, no expirado, no verificado, hash match.
func (s *Service) VerifySMSCode(ctx context.Context, uid, code string) error {
	sum := sha256.Sum256([]byte(code))
	tag, err := s.pool.Exec(ctx, `
		UPDATE public.sms_verification_codes
		SET verified = TRUE, verified_at = NOW()
		WHERE user_id = $1 AND code_hash = $2 AND verified = FALSE
		  AND expires_at > NOW() AND attempt_count < max_attempts`,
		uid, fmt.Sprintf("%x", sum))
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		// cuenta el intento sobre el código más reciente del usuario
		_, _ = s.pool.Exec(ctx, `
			UPDATE public.sms_verification_codes SET attempt_count = attempt_count + 1
			WHERE id = (SELECT id FROM public.sms_verification_codes
			            WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1)`, uid)
		return apperr.New(400, "código inválido o expirado")
	}
	return nil
}

// ---------- region availability ----------

type serviceArea struct {
	ID        string
	Name      string
	CenterLa  float64
	CenterLn  float64
	HasCenter bool
	RadiusKm  float64
	Points    [][2]float64
}

// RegionAvailability — checkRegionAvailability v1: punto dentro de algún
// service area activo (DATA-MAIN_service_areas). Polígono primero, círculo
// como fallback; bounds estáticos de Managua como último recurso.
func (s *Service) RegionAvailability(ctx context.Context, lat, lng float64) (map[string]any, error) {
	snaps, err := s.fs.Collection(fs.ColServiceAreas).Where("active", "==", true).Documents(ctx).GetAll()
	if err != nil {
		return nil, err
	}
	for _, snap := range snaps {
		d := snap.Data()
		a := serviceArea{ID: snap.Ref.ID}
		a.Name, _ = d["name"].(string)
		a.Points = geo.ExtractPolygon(d["points"])
		// Centro tolerante: GeoPoint `center` o campos numéricos centerLat/centerLng.
		if cLat, cLng, ok := geo.ExtractLatLng(d["center"]); ok {
			a.CenterLa, a.CenterLn, a.HasCenter = cLat, cLng, true
		} else {
			a.CenterLa, _ = d["centerLat"].(float64)
			a.CenterLn, _ = d["centerLng"].(float64)
			a.HasCenter = a.CenterLa != 0 || a.CenterLn != 0
		}
		a.RadiusKm, _ = d["radiusKm"].(float64)
		if a.RadiusKm <= 0 {
			a.RadiusKm = 30
		}
		if len(a.Points) >= 3 {
			if geo.PointInPolygon(lat, lng, a.Points) {
				return map[string]any{"available": true, "areaId": a.ID, "areaName": a.Name}, nil
			}
			continue
		}
		if a.HasCenter && geo.HaversineKm(lat, lng, a.CenterLa, a.CenterLn) <= a.RadiusKm {
			return map[string]any{"available": true, "areaId": a.ID, "areaName": a.Name}, nil
		}
	}
	// Fallback estático v1: bounds de Managua cuando ninguna área coincide.
	if lat >= 12.05 && lat <= 12.20 && lng >= -86.35 && lng <= -86.15 {
		return map[string]any{
			"available": true, "areaId": "ni-managua-default",
			"areaName": "Managua", "isFallback": true,
		}, nil
	}
	return map[string]any{"available": false}, nil
}

// ---------- preflight ----------

// PreflightData — getPreflightData v1 (config mínima del arranque del app).
// La versión de términos aceptada vive en el perfil Firestore (DATA-MAIN_users).
func (s *Service) PreflightData(ctx context.Context, uid string) (map[string]any, error) {
	var acceptedVersion string
	if snap, err := s.fs.Collection("DATA-MAIN_users").Doc(uid).Get(ctx); err == nil {
		acceptedVersion, _ = snap.Data()["termsAcceptedVersion"].(string)
	} else if status.Code(err) != codes.NotFound {
		return nil, err
	}
	return map[string]any{
		"termsVersion":    termsVersion,
		"needsTerms":      acceptedVersion != termsVersion,
		"acceptedVersion": acceptedVersion,
	}, nil
}

// AcceptTerms — acceptPreflightTerms v1: marca versión aceptada en el perfil.
func (s *Service) AcceptTerms(ctx context.Context, uid string) error {
	_, err := s.fs.Collection("DATA-MAIN_users").Doc(uid).Set(ctx, map[string]any{
		"termsAcceptedVersion": termsVersion,
		"termsAcceptedAt":      firestore.ServerTimestamp,
	}, firestore.MergeAll)
	return err
}

// ---------- ride share tokens (público, stateless HMAC) ----------

// CreateShareToken — createRideShareToken v1: token firmado rideId|exp|sig.
func (s *Service) CreateShareToken(ctx context.Context, uid, rideID string, ttlHours int) (map[string]any, error) {
	if len(s.shareKey) == 0 {
		return nil, apperr.New(503, "share tokens no configurados")
	}
	// Solo participante del viaje puede compartirlo.
	var ok bool
	if err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.rides WHERE id = $1::uuid
			AND (client_id = $2 OR driver_id = $2 OR follower_driver_id = $2))`,
		rideID, uid).Scan(&ok); err != nil || !ok {
		return nil, apperr.ErrForbidden
	}
	if ttlHours <= 0 || ttlHours > 168 {
		ttlHours = 24
	}
	exp := time.Now().Add(time.Duration(ttlHours) * time.Hour).Unix()
	body := fmt.Sprintf("%s|%d", rideID, exp)
	mac := hmac.New(sha256.New, s.shareKey)
	mac.Write([]byte(body))
	token := base64.RawURLEncoding.EncodeToString([]byte(body)) + "." +
		base64.RawURLEncoding.EncodeToString(mac.Sum(nil))
	return map[string]any{"token": token, "expiresAt": exp}, nil
}

// PublicTracking — getPublicRideTracking v1: valida token y devuelve la
// proyección viva del viaje (REALTIME_trips_live).
func (s *Service) PublicTracking(ctx context.Context, token string) (map[string]any, error) {
	rideID, err := s.verifyShareToken(token)
	if err != nil {
		return nil, err
	}
	snap, err := s.fs.Collection("REALTIME_trips_live").Doc(rideID).Get(ctx)
	if err != nil {
		return nil, apperr.New(404, "ride not found")
	}
	d := snap.Data()
	return map[string]any{
		"rideId":    rideID,
		"status":    d["status"],
		"driver":    d["driver"],
		"location":  d["driverLocation"],
		"updatedAt": d["updatedAt"],
	}, nil
}

func (s *Service) verifyShareToken(token string) (string, error) {
	if len(s.shareKey) == 0 {
		return "", apperr.New(503, "share tokens no configurados")
	}
	parts := strings.Split(token, ".")
	if len(parts) != 2 {
		return "", apperr.New(400, "token inválido")
	}
	body, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil {
		return "", apperr.New(400, "token inválido")
	}
	mac := hmac.New(sha256.New, s.shareKey)
	mac.Write(body)
	expected, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || !hmac.Equal(expected, mac.Sum(nil)) {
		return "", apperr.New(403, "token inválido")
	}
	bits := strings.Split(string(body), "|")
	if len(bits) != 2 {
		return "", apperr.New(400, "token inválido")
	}
	exp, err := strconv.ParseInt(bits[1], 10, 64)
	if err != nil || time.Now().Unix() > exp {
		return "", apperr.New(403, "token expirado")
	}
	return bits[0], nil
}

var _ = errors.Is
var _ = pgx.ErrNoRows
var _ = time.Now

// HasVerifiedPhone — hasVerifiedRegisterPhoneLog v1: ¿existe código
// 'register_phone' verificado para este teléfono o usuario?
func (s *Service) HasVerifiedPhone(ctx context.Context, uid, phone string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS(SELECT 1 FROM public.sms_verification_codes
			WHERE context = 'register_phone' AND verified = TRUE
			  AND (phone_number = $1 OR user_id = $2))`,
		phone, uid).Scan(&ok)
	return ok, err
}

// ListMine — getUserBiometricAuthsSeq/getUserSmsCodesSeq/
// getUserAnalyticsEventsSeq v1: historial propio del actor.
func (s *Service) ListMine(ctx context.Context, uid, entity string, limit int) ([]map[string]any, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	var q string
	switch entity {
	case "biometric":
		q = `SELECT id::text, ride_id::text, biometric_type, context, success,
		     attempt_number, attempted_at::text
		     FROM public.biometric_authentications WHERE user_id = $1
		     ORDER BY attempted_at DESC LIMIT $2`
	case "sms":
		q = `SELECT id::text, phone_number, email, context, verified,
		     sent_at::text, verified_at::text
		     FROM public.sms_verification_codes WHERE user_id = $1
		     ORDER BY created_at DESC LIMIT $2`
	case "analytics":
		q = `SELECT id::text, event_type, event_data::text, platform,
		     app_version, created_at::text
		     FROM public.analytics_events WHERE user_id = $1
		     ORDER BY created_at DESC LIMIT $2`
	default:
		return nil, apperr.New(400, "entity inválida")
	}
	rows, err := s.pool.Query(ctx, q, uid, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols := []string{}
	for _, f := range rows.FieldDescriptions() {
		cols = append(cols, string(f.Name))
	}
	out := []map[string]any{}
	for rows.Next() {
		vals, err := rows.Values()
		if err != nil {
			return nil, err
		}
		m := map[string]any{}
		for i, c := range cols {
			m[c] = vals[i]
		}
		out = append(out, m)
	}
	return out, rows.Err()
}
