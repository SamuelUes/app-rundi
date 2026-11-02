package middleware

import (
	"net/http"
	"strings"

	"google.golang.org/api/idtoken"

	"github.com/rundi/functions-v2/internal/apperr"
)

// RequireTasksOIDC — verificación OIDC real de Cloud Tasks.
// El task firma Authorization: Bearer <JWT Google> emitido para el SA de la
// cola; aud = la audiencia configurada (default: URL del target). Se valida
// firma+iss+exp vía JWKS de Google, y que email/email_verified == SA esperado.
// Es la única autorización del endpoint (no va tras middleware Auth).
func RequireTasksOIDC(saEmail, audience string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			tok := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
			if tok == r.Header.Get("Authorization") || tok == "" {
				apperr.Write(w, apperr.New(401, "missing oidc token"))
				return
			}
			payload, err := idtoken.Validate(r.Context(), tok, audience)
			if err != nil {
				apperr.Write(w, apperr.New(401, "invalid oidc token"))
				return
			}
			email, _ := payload.Claims["email"].(string)
			verified, _ := payload.Claims["email_verified"].(bool)
			if saEmail == "" || !verified ||
				!strings.EqualFold(email, saEmail) {
				apperr.Write(w, apperr.New(403, "oidc principal not allowed"))
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}
