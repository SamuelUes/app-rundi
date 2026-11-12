// cmd/taskemulator — Cloud Tasks local para docker-compose v2.
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/rundi/functions-v2/internal/taskqueue"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer stop()

	statePath := getenv("LOCAL_TASKS_STATE", "/data/tasks.json")
	maxAttempts := intEnv("LOCAL_TASKS_MAX_ATTEMPTS", 5)
	retryDelay := durEnv("LOCAL_TASKS_RETRY_DELAY", time.Second)
	token := os.Getenv("CLOUD_TASKS_LOCAL_TOKEN")

	srv, err := taskqueue.NewServer(taskqueue.Options{
		StatePath:    statePath,
		MaxAttempts:  maxAttempts,
		RetryDelay:   retryDelay,
		Token:        token,
		PeriodicJobs: periodicJobs(),
	})
	if err != nil {
		slog.Error("task emulator init", "err", err)
		os.Exit(1)
	}

	health := &http.Server{Addr: ":8091", ReadHeaderTimeout: 2 * time.Second}
	health.Handler = http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte("ok"))
	})
	go func() {
		_ = health.ListenAndServe()
	}()

	errCh := make(chan error, 1)
	go func() {
		errCh <- taskqueue.ListenAndServe(ctx, ":8090", srv)
	}()
	runDone := make(chan struct{})
	go func() {
		defer close(runDone)
		_ = srv.Run(ctx)
	}()
	slog.Info("local cloud tasks listening", "grpc", ":8090", "health", ":8091", "state", statePath)

	select {
	case <-ctx.Done():
	case err := <-errCh:
		if err != nil {
			slog.Error("task emulator", "err", err)
			os.Exit(1)
		}
	}
	<-runDone
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_ = health.Shutdown(shutdownCtx)
}

// periodicJobs reproduce los ticks de Cloud Scheduler dentro del contenedor
// local: el job real corre en Cloud Tasks; estos barridos son el respaldo.
func periodicJobs() map[string]time.Duration {
	jobs := map[string]time.Duration{
		"rundi-programmed": minuteEnv("LOCAL_PROGRAMMED_TICK_SECONDS", 60),
		"rundi-scheduler":  minuteEnv("LOCAL_SCHEDULER_TICK_SECONDS", 300),
		"rundi-consumer":   minuteEnv("LOCAL_CONSUMER_TICK_SECONDS", 10),
	}
	if raw := os.Getenv("LOCAL_PERIODIC_JOBS"); raw != "" {
		jobs = map[string]time.Duration{}
		for _, pair := range strings.Split(raw, ",") {
			parts := strings.SplitN(strings.TrimSpace(pair), "=", 2)
			if len(parts) != 2 {
				continue
			}
			d, err := time.ParseDuration(parts[1])
			if err == nil && parts[0] != "" {
				jobs[parts[0]] = d
			}
		}
	}
	return jobs
}

func getenv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func intEnv(k string, def int) int {
	v, err := strconv.Atoi(os.Getenv(k))
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func durEnv(k string, def time.Duration) time.Duration {
	v, err := time.ParseDuration(os.Getenv(k))
	if err != nil || v <= 0 {
		return def
	}
	return v
}

func minuteEnv(k string, defSeconds int) time.Duration {
	v, err := strconv.Atoi(os.Getenv(k))
	if err != nil || v <= 0 {
		v = defSeconds
	}
	return time.Duration(v) * time.Second
}
