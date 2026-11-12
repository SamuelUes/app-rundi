package middleware

import (
	"context"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/rundi/functions-v2/internal/apperr"
)

type RateStore interface {
	Allow(context.Context, string, string, int, time.Duration) (bool, time.Duration, error)
}

func RateLimit(store RateStore, mode string, public bool, limits map[string]int) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if mode == "off" {
				next.ServeHTTP(w, r)
				return
			}
			subject, _ := r.Context().Value(CtxUID).(string)
			policy, capacity := ratePolicy(r)
			if public {
				subject, policy, capacity = "global", "availability", 300
			}
			if configured := limits[policy]; configured > 0 {
				capacity = configured
			}
			if subject == "" {
				apperr.Write(w, apperr.New(http.StatusUnauthorized, "missing identity"))
				return
			}
			ctx, cancel := context.WithTimeout(r.Context(), time.Second)
			started := time.Now()
			allowed, retry, err := store.Allow(ctx, policy, subject, capacity, time.Minute)
			recordRateLimit(policy, allowed, err, time.Since(started))
			cancel()
			if err != nil {
				if mode == "enforce" && policy != "emergency" {
					apperr.Write(w, apperr.New(http.StatusServiceUnavailable, "rate limit unavailable"))
					return
				}
			} else if !allowed {
				if mode == "enforce" {
					w.Header().Set("Retry-After", strconv.Itoa(max(1, int(math.Ceil(retry.Seconds())))))
					apperr.Write(w, apperr.New(http.StatusTooManyRequests, "rate limit exceeded"))
					return
				}
			}
			next.ServeHTTP(w, r)
		})
	}
}

func ratePolicy(r *http.Request) (string, int) {
	path := r.URL.Path
	switch {
	case strings.HasPrefix(path, "/v1/emergency-calls"):
		return "emergency", 30
	case r.Method == http.MethodGet || r.Method == http.MethodHead:
		return "read", 180
	case strings.HasPrefix(path, "/v1/payments"):
		return "payments", 30
	case strings.HasPrefix(path, "/v1/calls"):
		return "calls", 30
	case path == "/v1/rides" || path == "/v1/rides/":
		return "ride_request", 15
	case strings.HasPrefix(path, "/v1/rides/") && strings.HasSuffix(path, "/negotiate"):
		return "negotiation", 30
	case strings.HasPrefix(path, "/v1/rides"):
		return "rides", 60
	case path == "/v1/client-events/chat":
		return "chats", 60
	case path == "/v1/client-events/call-end" || path == "/v1/client-events/call-accept":
		return "calls", 30
	case path == "/v1/client-events/arrival-photo":
		return "arrival_photo", 15
	case strings.HasPrefix(path, "/v1/chats"):
		return "chats", 60
	case strings.HasPrefix(path, "/v1/client-events"):
		return "client_events", 60
	default:
		return "mutation", 60
	}
}
