// Package db — pool pgx a Cloud SQL Postgres vía Cloud SQL Go Connector
// (conectividad privada; sin proxy sidecar).
package db

import (
	"context"
	"fmt"
	"net"

	"cloud.google.com/go/cloudsqlconn"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/config"
)

func NewPool(ctx context.Context, cfg *config.Config) (*pgxpool.Pool, error) {
	var dsn string
	var dialFunc func(ctx context.Context, _, _ string) (net.Conn, error)

	switch {
	case cfg.DatabaseURL != "":
		// URI completo: postgres://user:pass@host:5432/db?sslmode=...
		dsn = cfg.DatabaseURL
	case cfg.DBHost != "":
		// TCP directo (local/docker / IP pública): sin connector.
		dsn = fmt.Sprintf(
			"host=%s port=%s user=%s password=%s dbname=%s sslmode=%s",
			cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBPassword, cfg.DBName, cfg.DBSSLMode,
		)
	default:
		// Cloud SQL Go Connector (IAM auth + cifrado transparente).
		var ipOpt cloudsqlconn.DialOption
		switch cfg.DBIPType {
		case "private":
			ipOpt = cloudsqlconn.WithPrivateIP()
		case "auto":
			ipOpt = cloudsqlconn.WithAutoIP()
		default:
			ipOpt = cloudsqlconn.WithPublicIP()
		}
		dialer, err := cloudsqlconn.NewDialer(ctx,
			cloudsqlconn.WithDefaultDialOptions(ipOpt),
		)
		if err != nil {
			return nil, fmt.Errorf("cloudsqlconn dialer: %w", err)
		}
		dsn = fmt.Sprintf(
			"user=%s password=%s dbname=%s sslmode=disable",
			cfg.DBUser, cfg.DBPassword, cfg.DBName,
		)
		dialFunc = func(ctx context.Context, _, _ string) (net.Conn, error) {
			return dialer.Dial(ctx, cfg.InstanceConnectionName)
		}
	}

	poolCfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("pgxpool parse: %w", err)
	}
	if dialFunc != nil {
		poolCfg.ConnConfig.DialFunc = dialFunc
	}
	poolCfg.MaxConns = cfg.DBPoolMax
	// Statement timeout por conexión (doc §2.2: DB_STATEMENT_TIMEOUT_MS)
	poolCfg.ConnConfig.RuntimeParams["statement_timeout"] = fmt.Sprintf("%d", cfg.DBStatementTimeout.Milliseconds())

	pool, err := pgxpool.NewWithConfig(ctx, poolCfg)
	if err != nil {
		return nil, fmt.Errorf("pgxpool new: %w", err)
	}
	if err := pool.Ping(ctx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("postgres ping: %w", err)
	}
	return pool, nil
}

// ActorScope — contexto de actor para GUCs usados por triggers
// (log_commission_change lee app.current_user_id).
func WithActor(ctx context.Context, conn *pgx.Conn, uid string) error {
	_, err := conn.Exec(ctx, "SELECT set_config('app.current_user_id', $1, true)", uid)
	return err
}
