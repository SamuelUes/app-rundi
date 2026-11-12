package middleware

import (
	"bytes"
	"errors"
	"log/slog"
	"strings"
	"testing"
	"time"
)

func TestFlushSecurityMetrics(t *testing.T) {
	FlushSecurityMetrics()
	var output bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewJSONHandler(&output, nil)))
	defer slog.SetDefault(previous)
	recordAppCheck("valid")
	recordAppCheck("missing")
	recordRateLimit("chats", false, nil, 2*time.Millisecond)
	recordRateLimit("chats", false, errors.New("db unavailable"), time.Millisecond)
	FlushSecurityMetrics()
	logged := output.String()
	for _, text := range []string{`"outcome":"valid"`, `"outcome":"missing"`, `"policy":"chats"`,
		`"requests":2`, `"limited":1`, `"errors":1`, `"latency_us_sum":3000`} {
		if !strings.Contains(logged, text) {
			t.Errorf("missing %s in %s", text, logged)
		}
	}
	output.Reset()
	FlushSecurityMetrics()
	if output.Len() != 0 {
		t.Fatalf("empty counters should not log: %s", output.String())
	}
}
