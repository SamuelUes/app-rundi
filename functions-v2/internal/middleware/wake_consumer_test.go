package middleware

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWakeConsumerAfterEachSuccessfulMutation(t *testing.T) {
	calls := 0
	handler := WakeConsumerOnMutation(func(context.Context) error {
		calls++
		return nil
	})(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/failure" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))

	for _, tc := range []struct {
		method string
		path   string
		want   int
	}{
		{http.MethodPost, "/one", 1},
		{http.MethodPost, "/two", 2},
		{http.MethodGet, "/read", 2},
		{http.MethodPost, "/failure", 2},
	} {
		handler.ServeHTTP(httptest.NewRecorder(), httptest.NewRequest(tc.method, tc.path, nil))
		if calls != tc.want {
			t.Fatalf("%s %s: wakes = %d, want %d", tc.method, tc.path, calls, tc.want)
		}
	}
}
