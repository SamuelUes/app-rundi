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

	"github.com/rundi/functions-v2/internal/apns"
	"github.com/rundi/functions-v2/internal/calls"
	"github.com/rundi/functions-v2/internal/catalog"
	"github.com/rundi/functions-v2/internal/chats"
	"github.com/rundi/functions-v2/internal/clientevents"
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
	"github.com/rundi/functions-v2/internal/projections"
	"github.com/rundi/functions-v2/internal/ratelimit"
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
	var slogLevel slog.Level
	if err := slogLevel.UnmarshalText([]byte(cfg.LogLevel)); err == nil && slogLevel != slog.LevelInfo {
		slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slogLevel})))
	}
	middleware.StartSecurityMetrics(ctx)

	app, err := firebase.NewApp(ctx, nil)
	if err != nil {
		slog.Error("firebase app", "err", err)
		os.Exit(1)
	}
	var verifyAppCheck func(context.Context, string) error
	if cfg.AppCheckEnforce != "off" {
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
	rateStore := ratelimit.NewStore(pool)
	r.Use(middleware.RequestID)
	r.Get("/health", func(w http.ResponseWriter, _ *http.Request) {
		w.Write([]byte("ok"))
	})

	// APNs para pushes VoIP (CallKit/PushKit en llamadas entrantes). Sin
	// config → nil; la feature queda apagada y todo lo demás sigue igual.
	apnsSender, apnsErr := apns.NewSenderFromEnv()
	if apnsErr != nil {
		slog.Warn("apns disabled", "err", apnsErr)
	}

	callsH := calls.NewHandler(
		calls.NewService(pool, fsClient).WithVoip(apnsSender), cfg, pool, fsClient)

	// Endpoint público (App Check solamente): el chequeo de email/phone
	// únicos corre ANTES del signup, cuando aún no hay ID token.
	// El signer firma las fotos de recognize (corren pre-auth — el cliente no
	// puede resolver objectPaths de un bucket privado sin ID token).
	var deviceSigner *rstorage.Signer
	if s, err := rstorage.NewSigner(ctx, cfg.FirebaseStorageBucket, ""); err == nil {
		deviceSigner = s
	} else {
		slog.Warn("users: signer no disponible (recognize sin fotos firmadas)", "err", err)
	}
	usersH := users.NewHandler(users.NewService(pool, fsClient, app).WithSigner(deviceSigner))
	r.Group(func(r chi.Router) {
		r.Use(middleware.AppCheck(cfg.AppCheckEnforce, verifyAppCheck))
		r.Use(middleware.RateLimit(rateStore, cfg.RateLimitPublicMode, true, cfg.RateLimitLimits))
		r.Get("/v1/users/availability", usersH.Availability)
		// Reconocimiento de dispositivo post-reinstall: hint de cuenta y
		// cambio deviceId+secret → custom token (login directo).
		r.Post("/v1/auth/devices/recognize", usersH.RecognizeDevice)
		r.Post("/v1/auth/devices/token", usersH.DeviceToken)
	})

	// Rutas protegidas: ID token + App Check (modo según config)
	// wakeNow — wake inmediato sin dedupe para rutas sensibles a latencia:
	// rides (ride.requested dispara dispatchOffers = matching + push a
	// conductores, que SOLO corre en el sweep del consumer — no tiene
	// fast-path como el resto de transiciones), calls (push de llamada
	// entrante), client-events y events/poke (pending events de chat/calls/
	// foto = push percibidos por el usuario).
	wakeNow := func(r chi.Router) {
		if taskProducer != nil {
			r.Use(middleware.WakeConsumerOnMutation(taskProducer.WakeConsumer))
		}
	}
	// wakeSoon — wake coalescido (~15s) para rutas con trabajo real pero
	// tolerantes al desfase: una ráfaga de mutaciones produce ≤1 ejecución
	// del job por ventana entre todas las instancias (dedupe por nombre).
	// Solo se instala en grupos que de verdad insertan outbox_events o
	// SYSTEM_pending_events (verificado por código — internal/outbox y
	// fs.ColPendingEvents). chats/support/inspections/emergency-calls/pricing
	// no escriben ninguno de los dos: despertaban al consumer para que no
	// encontrara nada que hacer.
	wakeSoon := func(r chi.Router) {
		if taskProducer != nil {
			r.Use(middleware.WakeConsumerOnMutation(taskProducer.WakeConsumerCoalesced))
		}
	}
	r.Group(func(r chi.Router) {
		r.Use(middleware.AppCheck(cfg.AppCheckEnforce, verifyAppCheck))
		r.Use(middleware.Auth(app))
		r.Use(middleware.RateLimit(rateStore, cfg.RateLimitMode, false, cfg.RateLimitLimits))
		r.Route("/v1/rides", func(r chi.Router) {
			wakeNow(r)
			ridesHandler := rides.NewHandler(rides.NewService(pool, fsClient))
			r.Mount("/", ridesHandler.Routes())
		})
		// Compliance documental (driver self-service). Push/signer son
		// best-effort: el servicio funciona sin ellos (devuelve paths).
		compSvc := complianceService(ctx, app, pool, fsClient, cfg)
		dailyStore := compliance.NewDailyStore(fsClient)
		compHandler := compliance.NewHandler(compSvc, dailyStore)
		r.Route("/v1/payments", func(r chi.Router) {
			wakeSoon(r)
			paymentsH := payments.NewHandler(payments.NewService(pool, fsClient), fsClient)
			paymentsH.SetDriverReactivation(compSvc, dailyStore)
			paymentsH.SetPaymentProjector(func(ctx context.Context, paymentID string) error {
				_, err := projections.Publish(ctx, pool, fsClient, projections.Event{
					AggregateType: "payment", AggregateID: paymentID, Payload: []byte("{}"),
				})
				return err
			})
			r.Mount("/", paymentsH.Routes())
		})
		r.Route("/v1/crew", func(r chi.Router) {
			wakeSoon(r)
			r.Mount("/", crew.NewHandler(crew.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/ratings", func(r chi.Router) {
			wakeSoon(r)
			r.Mount("/", ratings.NewHandler(ratings.NewService(pool)).Routes())
		})
		// Sin outbox ni pending events (internal/pricing): solo lectura de
		// tarifas/estimaciones — nunca produce trabajo para el consumer.
		r.Route("/v1/pricing", func(r chi.Router) {
			r.Mount("/", pricing.NewHandler(pricing.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/users", func(r chi.Router) {
			wakeSoon(r)
			r.Mount("/", usersH.Routes())
		})
		r.Route("/v1/drivers", func(r chi.Router) {
			wakeSoon(r)
			r.Mount("/", drivers.NewHandler(drivers.NewService(pool, app, fsClient)).Routes())
		})
		r.Route("/v1/compliance", func(r chi.Router) {
			wakeSoon(r)
			r.Mount("/", compHandler.Routes())
		})
		// Sin outbox ni pending events (internal/chats): los mensajes van
		// directo por el SDK de Firestore desde la app (ver src/live/chats.ts
		// + /v1/events/poke), no por esta ruta REST.
		r.Route("/v1/chats", func(r chi.Router) {
			r.Mount("/", chats.NewHandler(chats.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/client-events", func(r chi.Router) {
			wakeNow(r)
			r.Mount("/", clientevents.NewHandler(pool, fsClient).Routes())
		})
		r.Route("/v1/calls", func(r chi.Router) {
			wakeNow(r)
			r.Mount("/", callsH.Routes())
		})
		// Sin outbox ni pending events (internal/support): solo persiste en
		// SQL — el chat de soporte real va por /v1/chats (Firestore).
		r.Route("/v1/support", func(r chi.Router) {
			r.Mount("/", support.NewHandler(support.NewService(pool, fsClient)).Routes())
		})
		r.Route("/v1/programmed-rides", func(r chi.Router) {
			wakeSoon(r)
			progSvc := programmed.NewService(pool, fsClient)
			sender, err := fcm.NewSender(ctx, app)
			if err != nil {
				slog.Warn("programmed invitation push unavailable", "err", err)
			}
			progSvc.SetNotifications(notifications.NewCenter(fsClient, sender))
			if taskProducer != nil {
				progSvc.SetPromotionScheduler(
					taskProducer.ScheduleProgrammedPromotion,
					taskProducer.CancelProgrammedPromotion)
			}
			r.Mount("/", programmed.NewHandler(progSvc).Routes())
		})
		// Sin outbox ni pending events (internal/emergency): solo registra el
		// llamado en SQL; la llamada real a emergencias ocurre en el
		// dispositivo (marcador telefónico), no por un flujo async backend.
		r.Route("/v1/emergency-calls", func(r chi.Router) {
			r.Mount("/", emergency.NewHandler(emergency.NewService(pool)).Routes())
		})
		// Sin outbox ni pending events (internal/inspections).
		r.Route("/v1/inspections", func(r chi.Router) {
			r.Mount("/", inspections.NewHandler(inspections.NewService(pool)).Routes())
		})
		r.Route("/v1/platform", func(r chi.Router) {
			wakeSoon(r)
			r.Mount("/", platform.NewHandler(platform.NewService(pool, fsClient, cfg.RideShareSecret)).Routes())
		})
		// Poke del consumer: la app lo llama tras escribir pending events
		// directo en Firestore (chat/calls/foto). Es solo la señal de "hay
		// trabajo" — 204 sin cuerpo; el middleware hace el wake inmediato.
		if taskProducer != nil {
			r.With(middleware.WakeConsumerOnMutation(taskProducer.WakeConsumer)).
				Post("/v1/events/poke", func(w http.ResponseWriter, r *http.Request) {
					w.WriteHeader(http.StatusNoContent)
				})
		} else {
			r.Post("/v1/events/poke", func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusNoContent)
			})
		}
		// Admin/operator: catálogo de pricing + aprobación de conductores +
		// revisión documental de compliance.
		r.Route("/v1/admin", func(r chi.Router) {
			r.Use(middleware.RequireRole("admin", "operator"))
			wakeSoon(r)
			r.Mount("/catalog", catalog.NewHandler(catalog.NewService(pool)).Routes())
			r.Mount("/compliance", compHandler.AdminRoutes())
			drivers.NewHandler(drivers.NewService(pool, app, fsClient)).AdminRoutes(r)
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
		if cfg.CloudTasksLocalAuth {
			r.Use(middleware.RequireLocalTasks(cfg.CloudTasksLocalToken))
		} else {
			r.Use(middleware.RequireTasksOIDC(cfg.CloudTasksSAEmail, cfg.CloudTasksAudience))
		}
		r.Post("/delayed-ride-status",
			tasks.NewDelayedRideStatusHandler(pool).ServeHTTP)
	})

	// Webhook LiveKit — público; la firma JWT del propio evento es la auth
	// (api_secret compartido). No lleva middleware Auth/App Check.
	if taskProducer != nil {
		r.With(middleware.WakeConsumerOnMutation(taskProducer.WakeConsumer)).
			Post("/livekit/webhook", callsH.Webhook)
	} else {
		r.Post("/livekit/webhook", callsH.Webhook)
	}

	// Tracking público (token HMAC en query; sin auth)
	r.Mount("/public",
		platform.NewHandler(platform.NewService(pool, fsClient, cfg.RideShareSecret)).PublicRoutes())

	// Webhook PuntoExpress (token header; sin Firebase auth)
	if taskProducer != nil {
		r.With(middleware.WakeConsumerOnMutation(taskProducer.WakeConsumer)).
			Post("/webhooks/puntoexpress",
				payments.NewHandler(payments.NewService(pool, fsClient), fsClient).
					PuntoExpressWebhook(cfg.PuntoExpressWebhookToken))
	} else {
		r.Post("/webhooks/puntoexpress",
			payments.NewHandler(payments.NewService(pool, fsClient), fsClient).
				PuntoExpressWebhook(cfg.PuntoExpressWebhookToken))
	}

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
	middleware.FlushSecurityMetrics()
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
	return compliance.NewService(pool, center, signer, fsClient)
}
