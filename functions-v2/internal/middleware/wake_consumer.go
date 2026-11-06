package middleware

import (
	"context"
	"log/slog"
	"net/http"
	"time"

	chimw "github.com/go-chi/chi/v5/middleware"
)

// WakeConsumerOnMutation — tras una mutación (POST/PUT/PATCH/DELETE) exitosa
// (<400) dispara el wake best-effort del consumer de outbox. Cubre a todos los
// handlers que emiten outbox sin cablear SetConsumerWakeup uno por uno; el
// task deduplicado por ventana evita ráfagas bajo carga.
func WakeConsumerOnMutation(wake func(context.Context) error) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if wake == nil || r.Method == http.MethodGet || r.Method == http.MethodHead {
				next.ServeHTTP(w, r)
				return
			}
			ww := chimw.NewWrapResponseWriter(w, r.ProtoMajor)
			next.ServeHTTP(ww, r)
			if ww.Status() >= 400 {
				return
			}
			go func() {
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				if err := wake(ctx); err != nil {
					slog.Warn("consumer wake-up failed; scheduled sweep will retry",
						"path", r.URL.Path, "err", err)
				}
			}()
		})
	}
}
