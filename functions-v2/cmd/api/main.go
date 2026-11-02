// cmd/api — Cloud Run: API Gateway + Business Commands (doc §2.1).
package main

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"cloud.google.com/go/firestore"
	firebase "firebase.google.com/go/v4"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/calls"
	"github.com/rundi/functions-v2/internal/catalog"
	"github.com/rundi/functions-v2/internal/chats"
	"github.com/rundi/functions-v2/internal/compliance"
	"github.com/rundi/functions-v2/internal/config"
	"github.com/rundi/functions-v2/internal/crew"
	"github.com/rundi/functions-v2/internal/db"
	"github.com/rundi/functions-v2/internal/drivers"
	"github.com/rundi/functions-v2/internal/emergency"
	"github.com/rundi/functions-v2/internal/fcm"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/inspections"
	"github.com/rundi/functions-v2/internal/middleware"
	"github.com/rundi/functions-v2/internal/notifications"
	"github.com/rundi/functions-v2/internal/payments"
	"github.com/rundi/functions-v2/internal/platform"
	"github.com/rundi/functions-v2/internal/pricing"
	"github.com/rundi/functions-v2/internal/programmed"
	"github.com/rundi/functions-v2/internal/ratings"
	"github.com/rundi/functions-v2/internal/rides"
	rstorage "github.com/rundi/functions-v2/internal/storage"
	"github.com/rundi/functions-v2/internal/support"
	"github.com/rundi/functions-v2/internal/tasks"
	"github.com/rundi/functions-v2/internal/users"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}

	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		slog.Error("firebase app", "err", err)
		os.Exit(1)
	}
	var verifyAppCheck func(context.Context, string) error
	if cfg.AppCheckEnforce == "enforce" {
		check, err := app.AppCheck(ctx)
		if err != nil {
			slog.Error("firebase app check", "err", err)
			os.Exit(1)
		}
		verifyAppCheck = func(_ context.Context, token string) error {
			_, err := check.VerifyToken(token)
			return err
		}
	}
	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		slog.Error("postgres", "err", err)
		os.Exit(1)
	}
	defer pool.Close()
	fsClient, err := fs.NewClient(ctx, cfg)
	if err != nil {
		slog.Error("firestore", "err", err)
		os.Exit(1)
	}
	defer fsClient.Close()

	var taskProducer *tasks.Producer
	if cfg.CloudTasksQueue != "" && cfg.CloudTasksSAEmail != "" {
		taskProducer, err = tasks.NewProducer(ctx, cfg)
		if err != nil {
			slog.Warn("Cloud Tasks unavailable; scheduled outbox sweep remains enabled", "err", err)
		} else {
			defer taskProducer.Close()
		}
	}

	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})

	callsH := calls.NewHandler(calls.NewService(pool, fsClient), cfg, pool, fsClient)

	// Endpoint público (App Check solamente): el chequeo de email/phone
	// únicos corre ANTES del signup, cuando aún no hay ID token.
	usersH := users.NewHandler(users.NewService(pool, fsClient, app))
	r.Group(func(r chi.Router) {
		r.Use(middleware.AppCheck(cfg.AppCheckEnforce, verifyAppCheck))
		r.Get("/v1/users/availability", usersH.Availability)
	})

	// Rutas protegidas: ID token + App Check (modo según config)
	r.Group(func(r chi.Router) {
		r.Use(middleware.AppCheck(cfg.AppCheckEnforce, verifyAppCheck))
		r.Use(middleware.Auth(app))
		r.Route("/v1/rides", func(r chi.Router) {
			ridesHandler := rides.NewHandler(rides.NewService(pool, fsClient))
			if taskProducer != nil {
				ridesHandler.SetConsumerWakeup(taskProducer.WakeConsumer)
			}
			r.Mount("/", ridesHandler.Routes())
		})
		r.Route("/v1/payments", func(r chi.Router) {
			r.Mount("/", payments.NewHandler(payments.NewService(pool, fsClient), fsClient).Routes())
		})
		r.Route("/v1/crew", func(r chi.Router) {
			r.Mount("/", crew.NewHandler(crew.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/ratings", func(r chi.Router) {
			r.Mount("/", ratings.NewHandler(ratings.NewService(pool)).Routes())
		})
		r.Route("/v1/pricing", func(r chi.Router) {
			r.Mount("/", pricing.NewHandler(pricing.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/users", func(r chi.Router) {
			r.Mount("/", usersH.Routes())
		})
		r.Route("/v1/drivers", func(r chi.Router) {
			r.Mount("/", drivers.NewHandler(drivers.NewService(pool, app)).Routes())
		})
		// Compliance documental (driver self-service). Push/signer son
		// best-effort: el servicio funciona sin ellos (devuelve paths).
		compSvc := complianceService(ctx, app, pool, fsClient, cfg)
		r.Route("/v1/compliance", func(r chi.Router) {
			r.Mount("/", compliance.NewHandler(compSvc).Routes())
		})
		r.Route("/v1/chats", func(r chi.Router) {
			r.Mount("/", chats.NewHandler(chats.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/calls", func(r chi.Router) {
			r.Mount("/", callsH.Routes())
		})
		r.Route("/v1/support", func(r chi.Router) {
			r.Mount("/", support.NewHandler(support.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/programmed-rides", func(r chi.Router) {
			r.Mount("/", programmed.NewHandler(programmed.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/emergency-calls", func(r chi.Router) {
			r.Mount("/", emergency.NewHandler(emergency.NewService(pool)).Routes())
		})
		r.Route("/v1/inspections", func(r chi.Router) {
			r.Mount("/", inspections.NewHandler(inspections.NewService(pool)).Routes())
		})
		r.Route("/v1/platform", func(r chi.Router) {
			r.Mount("/", platform.NewHandler(platform.NewService(pool, fsClient, cfg.RideShareSecret)).Routes())
		})
		// Admin/operator: catálogo de pricing + aprobación de conductores +
		// revisión documental de compliance.
		r.Route("/v1/admin", func(r chi.Router) {
			r.Use(middleware.RequireRole("admin", "operator"))
			r.Mount("/catalog", catalog.NewHandler(catalog.NewService(pool)).Routes())
			r.Mount("/compliance", compliance.NewHandler(compSvc).AdminRoutes())
			drivers.NewHandler(drivers.NewService(pool, app)).AdminRoutes(r)
			users.NewHandler(users.NewService(pool, fsClient, app)).AdminRoutes(r)
			rides.NewHandler(rides.NewService(pool, fsClient)).AdminRoutes(r)
			if sender, err := fcm.NewSender(ctx, app); err == nil {
				notifications.NewHandler(
					notifications.NewCenter(fsClient, sender)).AdminRoutes(r)
			}
		})
	})

	// Task targets de Cloud Tasks — OIDC verificado (firma Google + email del
	// SA de la cola). Sin middleware Auth: el token OIDC es la autorización.
	r.Route("/tasks", func(r chi.Router) {
		r.Use(middleware.RequireTasksOIDC(cfg.CloudTasksSAEmail, cfg.CloudTasksAudience))
		r.Post("/delayed-ride-status",
			tasks.NewDelayedRideStatusHandler(pool).ServeHTTP)
	})

	// Webhook LiveKit — público; la firma JWT del propio evento es la auth
	// (api_secret compartido). No lleva middleware Auth/App Check.
	r.Post("/livekit/webhook", callsH.Webhook)

	// Tracking público (token HMAC en query; sin auth)
	r.Mount("/public",
		platform.NewHandler(platform.NewService(pool, fsClient, cfg.RideShareSecret)).PublicRoutes())

	// Webhook PuntoExpress (token header; sin Firebase auth)
	r.Post("/webhooks/puntoexpress",
		payments.NewHandler(payments.NewService(pool, fsClient), fsClient).
			PuntoExpressWebhook(cfg.PuntoExpressWebhookToken))

	srv := &http.Server{Addr: ":" + cfg.Port, Handler: r, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		slog.Info("api listening", "port", cfg.Port)
		if err := srv.ListenAndServe(); err != http.ErrServerClosed {
			slog.Error("http", "err", err)
			os.Exit(1)
		}
	}()

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, syscall.SIGINT, syscall.SIGTERM)
	<-stop
	shutdownCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
}

// complianceService — arma el servicio de compliance con dependencias
// opcionales (FCM para pushes de revisión, signer para URLs firmadas).
func complianceService(ctx context.Context, app *firebase.App, pool *pgxpool.Pool,
	fsClient *firestore.Client, cfg *config.Config) *compliance.Service {
	var center *notifications.Center
	if sender, err := fcm.NewSender(ctx, app); err == nil {
		center = notifications.NewCenter(fsClient, sender)
	} else {
		slog.Warn("compliance: FCM no disponible (sin push de revisión)", "err", err)
	}
	var signer *rstorage.Signer
	if s, err := rstorage.NewSigner(ctx, cfg.FirebaseStorageBucket, ""); err == nil {
		signer = s
	} else {
		slog.Warn("compliance: signer no disponible (paths sin firmar)", "err", err)
	}
	return compliance.NewService(pool, center, signer)
}
