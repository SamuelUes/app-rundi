package programmed

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/rundi/functions-v2/internal/middleware"
)

type testLimiter struct {
	allowed bool
	err     error
}

func (l testLimiter) Allow(context.Context, string, string, int, time.Duration) (bool, time.Duration, error) {
	return l.allowed, 3 * time.Second, l.err
}

func TestSensitiveActionsFailClosedOnRateLimit(t *testing.T) {
	for _, tc := range []struct {
		limiter testLimiter
		want    int
	}{
		{testLimiter{allowed: false}, http.StatusTooManyRequests},
		{testLimiter{err: errors.New("unavailable")}, http.StatusServiceUnavailable},
	} {
		h := &Handler{limiter: tc.limiter}
		req := httptest.NewRequest(http.MethodPost, "/123456/claim", nil)
		req = req.WithContext(context.WithValue(req.Context(), middleware.CtxUID, "driver"))
		w := httptest.NewRecorder()
		h.Routes().ServeHTTP(w, req)
		if w.Code != tc.want {
			t.Fatalf("status = %d, want %d", w.Code, tc.want)
		}
	}
}
