// Package middleware — cadena común: Firebase ID token, claims/permisos,
// App Check (monitor/enforce), validación y trazabilidad (doc FASE 3).
package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"strings"

	firebase "firebase.google.com/go/v4"
	"github.com/google/uuid"
)

type ctxKey string

const (
	CtxUID       ctxKey = "uid"
	CtxRole      ctxKey = "role"
	CtxRequestID ctxKey = "request_id"
)

func Role(token map[string]any) string {
	if r, ok := token["role"].(string); ok && r != "" {
		return r
	}
	return "client"
}

// Auth verifica el ID token de Firebase en cada endpoint protegido.
func Auth(app *firebase.App) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			header := r.Header.Get("Authorization")
			idToken := strings.TrimPrefix(header, "Bearer ")
			if idToken == header || idToken == "" {
				http.Error(w, `{"error":"missing bearer token"}`, http.StatusUnauthorized)
				return
			}
			client, err := app.Auth(r.Context())
			if err != nil {
				http.Error(w, `{"error":"auth unavailable"}`, http.StatusInternalServerError)
				return
			}
			tok, err := client.VerifyIDToken(r.Context(), idToken)
			if err != nil {
				http.Error(w, `{"error":"invalid token"}`, http.StatusUnauthorized)
				return
			}
			ctx := context.WithValue(r.Context(), CtxUID, tok.UID)
			ctx = context.WithValue(ctx, CtxRole, Role(tok.Claims))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// RequireRole exige uno de los roles dados (RBAC granular por endpoint).
func RequireRole(roles ...string) func(http.Handler) http.Handler {
	allowed := make(map[string]bool, len(roles))
	for _, r := range roles {
		allowed[r] = true
	}
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			role, _ := r.Context().Value(CtxRole).(string)
			if !allowed[role] {
				http.Error(w, `{"error":"forbidden"}`, http.StatusForbidden)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

// RequestID propaga/genera X-Request-ID para logs estructurados.
func RequestID(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		id := r.Header.Get("X-Request-ID")
		if id == "" {
			id = uuid.NewString()
		}
		w.Header().Set("X-Request-ID", id)
		ctx := context.WithValue(r.Context(), CtxRequestID, id)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// AppCheck — enforcement gradual: "off" | "monitor" | "enforce".
// En monitor solo registra; la verificación de ID token sigue siendo obligatoria.
func AppCheck(mode string, verify func(context.Context, string) error) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := r.Header.Get("X-Firebase-AppCheck")
			switch mode {
			case "enforce":
				if token == "" {
					http.Error(w, `{"error":"missing app check token"}`, http.StatusUnauthorized)
					return
				}
				if verify == nil || verify(r.Context(), token) != nil {
					http.Error(w, `{"error":"invalid app check token"}`, http.StatusUnauthorized)
					return
				}
			case "monitor":
				if token == "" {
					slog.WarnContext(r.Context(), "appcheck.missing", "path", r.URL.Path)
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}
