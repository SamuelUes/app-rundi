// Package config — único módulo de configuración por servicio.
// Valida al arrancar y falla rápido (doc FASE 3/4). Variables no secretas por
// env; secretos vía Secret Manager inyectados como env en Cloud Run.
package config

import (
	"fmt"
	"os"
	"strconv"
	"strings"
	"time"
)

type Config struct {
	// GCP
	ProjectID           string
	Region              string
	FirestoreDatabaseID string // única database; "" = (default)

	// Cloud SQL
	DatabaseURL            string // URI completo postgres://... (prioridad 1)
	InstanceConnectionName string // PROJECT:REGION:INSTANCE (prod, connector)
	DBIPType               string // private | public | auto (connector)
	DBHost                 string // TCP directo (local/docker); vacío = connector
	DBPort                 string
	DBSSLMode              string // sslmode para DB_HOST (default disable)
	DBName                 string
	DBUser                 string // preferir identidad/IAM cuando aplique
	DBPassword             string // secreto (Secret Manager); vacío si IAM auth
	DBPoolMax              int32
	DBStatementTimeout     time.Duration

	// Tasks / Scheduler
	CloudTasksQueue   string
	CloudTasksSAEmail string

	// Operación
	APIBaseURL            string
	OfferTTL              time.Duration
	GPSMinInterval        time.Duration
	PresenceTimeout       time.Duration
	MatchRadiusKm         float64
	MatchMaxOffers        int
	AppCheckEnforce       string // "off" | "monitor" | "enforce"
	AdminAllowedOrigins   []string
	LogLevel              string
	FirebaseStorageBucket string
	Port                  string

	// LiveKit — mint de tokens + webhook (opcional: vacío = llamadas deshabilitadas)
	LiveKitURL       string
	LiveKitAPIKey    string
	LiveKitAPISecret string

	// RideShareSecret — HMAC de tokens de tracking público (vacío = deshabilitado)
	RideShareSecret string

	// PuntoExpressWebhookToken — auth del webhook de recargas (vacío = rechaza todo)
	PuntoExpressWebhookToken string

	// CloudTasksAudience — aud esperado del token OIDC de Tasks
	// (fallback: APIBaseURL si vacío, ver Load()).
	CloudTasksAudience string
}

func Load() (*Config, error) {
	c := &Config{
		ProjectID:                os.Getenv("GCP_PROJECT_ID"),
		Region:                   getEnv("REGION", "us-central1"), // Firestore (default) ya existe en us-central1; colocar servicios regionales aquí
		FirestoreDatabaseID:      os.Getenv("FIRESTORE_DATABASE_ID"),
		DatabaseURL:              os.Getenv("DATABASE_URL"),
		InstanceConnectionName:   os.Getenv("INSTANCE_CONNECTION_NAME"),
		DBIPType:                 getEnv("DB_IP_TYPE", "public"),
		DBHost:                   os.Getenv("DB_HOST"),
		DBPort:                   getEnv("DB_PORT", "5432"),
		DBSSLMode:                getEnv("DB_SSLMODE", "disable"),
		DBName:                   getEnv("DB_NAME", "rundi"),
		DBUser:                   getEnv("DB_USER", "rundi_app"),
		DBPassword:               os.Getenv("DB_PASSWORD"),
		CloudTasksQueue:          os.Getenv("CLOUD_TASKS_QUEUE"),
		CloudTasksSAEmail:        os.Getenv("CLOUD_TASKS_SA_EMAIL"),
		APIBaseURL:               os.Getenv("API_BASE_URL"),
		AppCheckEnforce:          getEnv("APP_CHECK_ENFORCE", "monitor"),
		AdminAllowedOrigins:      splitCSV(os.Getenv("ADMIN_ALLOWED_ORIGINS")),
		LogLevel:                 getEnv("LOG_LEVEL", "info"),
		FirebaseStorageBucket:    os.Getenv("FIREBASE_STORAGE_BUCKET"),
		Port:                     getEnv("PORT", "8080"),
		LiveKitURL:               os.Getenv("LIVEKIT_URL"),
		LiveKitAPIKey:            os.Getenv("LIVEKIT_API_KEY"),
		LiveKitAPISecret:         os.Getenv("LIVEKIT_API_SECRET"),
		RideShareSecret:          os.Getenv("RIDE_SHARE_SECRET"),
		PuntoExpressWebhookToken: os.Getenv("PUNTOEXPRESS_WEBHOOK_TOKEN"),
		CloudTasksAudience:       os.Getenv("CLOUD_TASKS_AUDIENCE"),
	}
	if c.CloudTasksAudience == "" {
		c.CloudTasksAudience = c.APIBaseURL
	}

	var err error
	if c.DBPoolMax, err = getInt32("DB_POOL_MAX", 5); err != nil {
		return nil, err
	}
	if c.DBStatementTimeout, err = getDurMS("DB_STATEMENT_TIMEOUT_MS", 10000); err != nil {
		return nil, err
	}
	if c.OfferTTL, err = getDurSec("OFFER_TTL_SECONDS", 60); err != nil {
		return nil, err
	}
	if c.GPSMinInterval, err = getDurMS("GPS_MIN_INTERVAL_MS", 2500); err != nil {
		return nil, err
	}
	if c.PresenceTimeout, err = getDurSec("PRESENCE_TIMEOUT_SECONDS", 90); err != nil {
		return nil, err
	}
	if c.MatchRadiusKm, err = getFloat("MATCH_RADIUS_KM", 15); err != nil {
		return nil, err
	}
	if c.MatchMaxOffers, err = getInt("MATCH_MAX_OFFERS", 10); err != nil {
		return nil, err
	}

	for _, req := range []struct{ name, val string }{
		{"GCP_PROJECT_ID", c.ProjectID},
	} {
		if req.val == "" {
			return nil, fmt.Errorf("config: %s requerida", req.name)
		}
	}
	if c.DatabaseURL == "" && c.DBHost == "" && c.InstanceConnectionName == "" {
		return nil, fmt.Errorf("config: DATABASE_URL, DB_HOST o INSTANCE_CONNECTION_NAME requerida")
	}
	switch c.AppCheckEnforce {
	case "off", "monitor", "enforce":
	default:
		return nil, fmt.Errorf("config: APP_CHECK_ENFORCE inválido %q", c.AppCheckEnforce)
	}
	return c, nil
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return v
	}
	return def
}

func getInt32(k string, def int32) (int32, error) {
	v := os.Getenv(k)
	if v == "" {
		return def, nil
	}
	n, err := strconv.ParseInt(v, 10, 32)
	if err != nil {
		return 0, fmt.Errorf("config: %s inválido: %w", k, err)
	}
	return int32(n), nil
}

func getDurMS(k string, def int64) (time.Duration, error) {
	v := os.Getenv(k)
	if v == "" {
		return time.Duration(def) * time.Millisecond, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("config: %s inválido: %w", k, err)
	}
	return time.Duration(n) * time.Millisecond, nil
}

func getDurSec(k string, def int64) (time.Duration, error) {
	v := os.Getenv(k)
	if v == "" {
		return time.Duration(def) * time.Second, nil
	}
	n, err := strconv.ParseInt(v, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("config: %s inválido: %w", k, err)
	}
	return time.Duration(n) * time.Second, nil
}

func getFloat(k string, def float64) (float64, error) {
	v := os.Getenv(k)
	if v == "" {
		return def, nil
	}
	n, err := strconv.ParseFloat(v, 64)
	if err != nil {
		return 0, fmt.Errorf("config: %s inválido: %w", k, err)
	}
	return n, nil
}

func getInt(k string, def int) (int, error) {
	v := os.Getenv(k)
	if v == "" {
		return def, nil
	}
	n, err := strconv.Atoi(v)
	if err != nil {
		return 0, fmt.Errorf("config: %s inválido: %w", k, err)
	}
	return n, nil
}

func splitCSV(s string) []string {
	if s == "" {
		return nil
	}
	var out []string
	for _, p := range strings.Split(s, ",") {
		if p = strings.TrimSpace(p); p != "" {
			out = append(out, p)
		}
	}
	return out
}
