package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAppCheckModes(t *testing.T) {
	for _, tc := range []struct {
		mode, token string
		want        int
		calls       int
	}{
		{"off", "", 204, 0}, {"off", "bad", 204, 0},
		{"monitor", "", 204, 0}, {"monitor", "bad", 204, 0},
		{"enforce", "", 401, 0}, {"enforce", "bad", 401, 1},
		{"enforce", "valid", 204, 1},
	} {
		t.Run(tc.mode+"/"+tc.token, func(t *testing.T) {
			calls := 0
			verify := func(_ context.Context, token string) error {
				calls++
				if token != "valid" {
					return errors.New("invalid")
				}
				return nil
			}
			handler := AppCheck(tc.mode, verify)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			req := httptest.NewRequest("GET", "/", nil)
			req.Header.Set("X-Firebase-AppCheck", tc.token)
			out := httptest.NewRecorder()
			handler.ServeHTTP(out, req)
			if out.Code != tc.want || calls != tc.calls {
				t.Fatalf("status=%d calls=%d, want %d and %d", out.Code, calls, tc.want, tc.calls)
			}
		})
	}
}

func TestAppCheckEnforceWithoutVerifier(t *testing.T) {
	req := httptest.NewRequest("GET", "/", nil)
	req.Header.Set("X-Firebase-AppCheck", "token")
	out := httptest.NewRecorder()
	AppCheck("enforce", nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(out, req)
	if out.Code != http.StatusUnauthorized {
		t.Fatalf("status=%d", out.Code)
	}
}
