// Package users — perfil operativo Firestore-first (DATA-MAIN_users) con
// registro histórico/admin en public.users (decisión §10 del doc).
// Orden de escritura: Firestore (autoridad operativa) → TX SQL (histórico +
// outbox user.upserted para consumidores downstream). El consumer re-proyecta
// por idempotencia si la escritura directa quedó atrás.
package users

import (
	"context"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/claims"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/outbox"
)

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
	app  *firebase.App
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client, app *firebase.App) *Service {
	return &Service{pool: pool, fs: fsClient, app: app}
}

// Campos editables por el dueño — espejo del whitelist de firestore.rules.
var editableFields = map[string]bool{
	"name": true, "phone": true, "email": true, "birthDate": true,
	"profilePhoto": true, "authProvider": true, "notificationsEnabled": true,
}

type BootstrapRequest struct {
	Name            string `json:"name"`
	Email           string `json:"email,omitempty"`
	Phone           string `json:"phone,omitempty"`
	AuthProvider    string `json:"authProvider,omitempty"` // phone|google|apple
	BirthDate       string `json:"birthDate,omitempty"`    // YYYY-MM-DD
	NotificationsOn *bool  `json:"notificationsEnabled,omitempty"`
}

// Bootstrap — post sign-in de Firebase Auth. Crea el doc operativo si no
// existe (rol forzado 'client'; NUNCA pisa un role existente: un driver o
// admin que re-bootstrappea conserva su rol) y registra en SQL histórico.
func (s *Service) Bootstrap(ctx context.Context, uid string, req BootstrapRequest, requestID string) error {
	if req.Name == "" {
		return apperr.New(400, "name is required")
	}
	if uid == "" {
		return apperr.New(401, "missing uid")
	}

	ref := s.fs.Collection(fs.ColUsers).Doc(uid)
	snap, err := ref.Get(ctx)
	exists := err == nil && snap.Exists()
	if err != nil && status.Code(err) != codes.NotFound {
		return fmt.Errorf("users get: %w", err)
	}

	data := map[string]any{
		"id":         uid,
		"name":       req.Name,
		"updatedAt":  firestore.ServerTimestamp,
		"lastSeenAt": firestore.ServerTimestamp,
	}
	if req.Email != "" {
		data["email"] = req.Email
	}
	if req.Phone != "" {
		data["phone"] = req.Phone
	}
	if req.AuthProvider != "" {
		data["authProvider"] = req.AuthProvider
	}
	if req.BirthDate != "" {
		data["birthDate"] = req.BirthDate
	}
	if req.NotificationsOn != nil {
		data["notificationsEnabled"] = *req.NotificationsOn
	}
	if !exists {
		data["role"] = "client" // solo en create — regla y decisión de autoridad
		data["createdAt"] = firestore.ServerTimestamp
	}
	// 1) Firestore primero (autoridad operativa).
	if _, err := ref.Set(ctx, data, firestore.MergeAll); err != nil {
		return fmt.Errorf("users firestore: %w", err)
	}

	// 2) Histórico SQL + outbox en la misma TX.
	notificationsOn := true
	if req.NotificationsOn != nil {
		notificationsOn = *req.NotificationsOn
	}
	if err := s.upsertHistory(ctx, uid, map[string]any{
		"email":                 nilIfEmpty(req.Email),
		"phone":                 nilIfEmpty(req.Phone),
		"name":                  req.Name,
		"auth_provider":         nilIfEmpty(req.AuthProvider),
		"birth_date":            nilIfEmpty(req.BirthDate),
		"notifications_enabled": notificationsOn,
	}, requestID); err != nil {
		return err
	}

	// 3) Custom claims self-heal: el token recién emitido no trae role — si el
	// usuario ya tiene rol (driver/admin) el claim se resincroniza aquí para
	// que el siguiente refresh del cliente lo recoja.
	role := "client"
	if exists {
		if r, _ := snap.Data()["role"].(string); r != "" {
			role = r
		}
	}
	claims.Ensure(ctx, s.app, uid, role)
	return nil
}

// PatchMe — update de campos permitidos por el dueño (mismo set que reglas).
func (s *Service) PatchMe(ctx context.Context, uid string, fields map[string]any, requestID string) error {
	clean := map[string]any{}
	for k, v := range fields {
		if editableFields[k] {
			clean[k] = v
		}
	}
	if len(clean) == 0 {
		return apperr.New(400, "no editable fields")
	}

	// 1) Firestore (autoridad).
	fsData := map[string]any{"updatedAt": firestore.ServerTimestamp}
	for k, v := range clean {
		fsData[k] = v
	}
	if _, err := s.fs.Collection(fs.ColUsers).Doc(uid).Set(ctx, fsData, firestore.MergeAll); err != nil {
		return fmt.Errorf("users firestore: %w", err)
	}

	// 2) Histórico SQL (mapeo camelCase → snake_case) + outbox.
	snake := map[string]any{}
	for k, v := range clean {
		switch k {
		case "profilePhoto":
			snake["profile_photo"] = v
		case "authProvider":
			snake["auth_provider"] = v
		case "birthDate":
			snake["birth_date"] = v
		case "notificationsEnabled":
			snake["notifications_enabled"] = v
		default:
			snake[k] = v // name, phone, email
		}
	}
	return s.upsertHistory(ctx, uid, snake, requestID)
}

// upsertHistory — INSERT/UPDATE parcial en public.users + outbox user.upserted.
func (s *Service) upsertHistory(ctx context.Context, uid string, fields map[string]any, requestID string) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	// INSERT con todos los campos; UPDATE solo los provistos.
	cols := []string{"id"}
	vals := []any{uid}
	sets := []string{}
	i := 2
	for _, col := range []string{"email", "phone", "name", "auth_provider", "birth_date", "profile_photo", "notifications_enabled"} {
		if v, ok := fields[col]; ok {
			cols = append(cols, col)
			vals = append(vals, v)
			sets = append(sets, fmt.Sprintf("%s = $%d", col, i))
			i++
		}
	}
	sets = append(sets, "last_seen_at = NOW()")

	q := fmt.Sprintf(`INSERT INTO public.users (%s) VALUES (%s)
		ON CONFLICT (id) DO UPDATE SET %s`,
		joinList(cols), placeholders(1, len(cols)), joinList(sets))
	if _, err := tx.Exec(ctx, q, vals...); err != nil {
		return fmt.Errorf("users upsert: %w", err)
	}

	payload := map[string]any{"version": float64(time.Now().UnixMilli())}
	for k, v := range fields {
		payload[k] = v
	}
	// Camelize para el consumidor de Firestore.
	payload["uid"] = uid
	if v, ok := fields["profile_photo"]; ok {
		payload["profilePhoto"] = v
	}
	if v, ok := fields["auth_provider"]; ok {
		payload["authProvider"] = v
	}
	if v, ok := fields["birth_date"]; ok {
		payload["birthDate"] = v
	}
	if v, ok := fields["notifications_enabled"]; ok {
		payload["notificationsEnabled"] = v
	}

	if err := outbox.Insert(ctx, tx, outbox.Event{
		Type:          "user.upserted",
		AggregateType: "user",
		AggregateID:   uid,
		Payload:       payload,
		RequestID:     requestID,
	}); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func nilIfEmpty(s string) any {
	if s == "" {
		return nil
	}
	return s
}

func joinList(xs []string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += ", "
		}
		out += x
	}
	return out
}

func placeholders(start, n int) string {
	out := ""
	for i := start; i <= n; i++ {
		if i > start {
			out += ", "
		}
		out += fmt.Sprintf("$%d", i)
	}
	return out
}
