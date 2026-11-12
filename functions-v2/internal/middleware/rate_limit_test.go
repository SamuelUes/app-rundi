package middleware

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type fakeRateStore struct {
	allowed bool
	err     error
	policy  string
	subject string
	limit   int
}

func (s *fakeRateStore) Allow(_ context.Context, policy, subject string, limit int, _ time.Duration) (bool, time.Duration, error) {
	s.policy, s.subject, s.limit = policy, subject, limit
	return s.allowed, 3 * time.Second, s.err
}

func TestRateLimitEventPoliciesAndOverrides(t *testing.T) {
	for path, policy := range map[string]string{
		"/v1/client-events/chat":          "chats",
		"/v1/client-events/call-end":      "calls",
		"/v1/client-events/arrival-photo": "arrival_photo",
		"/v1/rides/abc/negotiate":         "negotiation",
		"/v1/rides/":                      "ride_request",
	} {
		store := &fakeRateStore{allowed: true}
		handler := RateLimit(store, "enforce", false, map[string]int{policy: 17})(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
			w.WriteHeader(http.StatusNoContent)
		}))
		req := httptest.NewRequest("POST", path, nil)
		req = req.WithContext(context.WithValue(req.Context(), CtxUID, "user-1"))
		handler.ServeHTTP(httptest.NewRecorder(), req)
		if store.policy != policy || store.limit != 17 {
			t.Errorf("path=%s got policy=%s limit=%d", path, store.policy, store.limit)
		}
	}
}

func TestRateLimitModes(t *testing.T) {
	for _, tc := range []struct {
		mode    string
		allowed bool
		err     error
		path    string
		want    int
	}{
		{"monitor", false, nil, "/v1/payments/123/confirm", 204},
		{"enforce", false, nil, "/v1/payments/123/confirm", 429},
		{"enforce", true, nil, "/v1/payments/123/confirm", 204},
		{"enforce", false, errors.New("db unavailable"), "/v1/payments/123/confirm", 503},
		{"enforce", false, errors.New("db unavailable"), "/v1/emergency-calls", 204},
	} {
		t.Run(tc.mode+tc.path+http.StatusText(tc.want), func(t *testing.T) {
			store := &fakeRateStore{allowed: tc.allowed, err: tc.err}
			handler := RateLimit(store, tc.mode, false, nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			}))
			req := httptest.NewRequest("POST", tc.path, nil)
			req = req.WithContext(context.WithValue(req.Context(), CtxUID, "user-1"))
			out := httptest.NewRecorder()
			handler.ServeHTTP(out, req)
			if out.Code != tc.want {
				t.Fatalf("status=%d want=%d", out.Code, tc.want)
			}
			if tc.want == 429 && out.Header().Get("Retry-After") != "3" {
				t.Fatalf("Retry-After=%q", out.Header().Get("Retry-After"))
			}
			if store.subject != "user-1" || store.policy == "" {
				t.Fatalf("subject=%q policy=%q", store.subject, store.policy)
			}
		})
	}
}

func TestRateLimitPublicUsesSharedBudget(t *testing.T) {
	store := &fakeRateStore{allowed: true}
	handler := RateLimit(store, "enforce", true, nil)(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	}))
	req := httptest.NewRequest("GET", "/v1/users/availability?email=secret@example.com", nil)
	req.Header.Set("X-Forwarded-For", "1.2.3.4")
	handler.ServeHTTP(httptest.NewRecorder(), req)
	if store.subject != "global" || store.policy != "availability" {
		t.Fatalf("unexpected key: %q %q", store.policy, store.subject)
	}
}
