package middleware

import (
	"context"
	"log/slog"
	"sync"
	"time"
)

type securityCounter struct {
	requests, limited, errors, latencyMicros int64
}

var securityMetrics = struct {
	sync.Mutex
	appCheck map[string]int64
	policies map[string]securityCounter
}{appCheck: make(map[string]int64), policies: make(map[string]securityCounter)}

func recordAppCheck(outcome string) {
	securityMetrics.Lock()
	securityMetrics.appCheck[outcome]++
	securityMetrics.Unlock()
}

func recordRateLimit(policy string, allowed bool, err error, elapsed time.Duration) {
	securityMetrics.Lock()
	counts := securityMetrics.policies[policy]
	counts.requests++
	counts.latencyMicros += elapsed.Microseconds()
	if err != nil {
		counts.errors++
	} else if !allowed {
		counts.limited++
	}
	securityMetrics.policies[policy] = counts
	securityMetrics.Unlock()
}

func FlushSecurityMetrics() {
	securityMetrics.Lock()
	appCheck, policies := securityMetrics.appCheck, securityMetrics.policies
	securityMetrics.appCheck = make(map[string]int64)
	securityMetrics.policies = make(map[string]securityCounter)
	securityMetrics.Unlock()
	for outcome, count := range appCheck {
		slog.Info("appcheck.metrics", "outcome", outcome, "count", count)
	}
	for policy, count := range policies {
		slog.Info("rate_limit.metrics", "policy", policy, "requests", count.requests,
			"limited", count.limited, "errors", count.errors, "latency_us_sum", count.latencyMicros)
	}
}

func StartSecurityMetrics(ctx context.Context) {
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				FlushSecurityMetrics()
				return
			case <-ticker.C:
				FlushSecurityMetrics()
			}
		}
	}()
}
