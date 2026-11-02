// cmd/scheduler — Cloud Run Job invocado por Cloud Scheduler: presencia
// vencida, expiración de ofertas, reconciliación de proyecciones y sweeps
// (doc §2.1: "Cloud Scheduler dispara sweepers, presencia, batch y
// reconciliación").
package main

import (
	"context"
	"log/slog"
	"os"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/calls"
	"github.com/rundi/functions-v2/internal/compliance"
	"github.com/rundi/functions-v2/internal/config"
	"github.com/rundi/functions-v2/internal/crew"
	"github.com/rundi/functions-v2/internal/db"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/programmed"
	"github.com/rundi/functions-v2/internal/reconcile"
)

func main() {
	ctx := context.Background()
	cfg, err := config.Load()
	if err != nil {
		slog.Error("config", "err", err)
		os.Exit(1)
	}
	fsClient, err := fs.NewClient(ctx, cfg)
	if err != nil {
		slog.Error("firestore", "err", err)
		os.Exit(1)
	}
	defer fsClient.Close()
	pool, err := db.NewPool(ctx, cfg)
	if err != nil {
		slog.Error("postgres", "err", err)
		os.Exit(1)
	}
	defer pool.Close()

	crewSvc := crew.NewService(pool, fsClient)
	compSvc := compliance.NewService(pool, nil, nil)
	progSvc := programmed.NewService(pool, fsClient)

	// SCHEDULER_ONLY=programmed: job dedicado a la promoción de viajes
	// programados (la gracia de promoción es de 2 min — el barrido completo
	// cada 5 min no la garantiza). El job general sigue ejecutando el mismo
	// Process como respaldo si el dedicado no está desplegado.
	if os.Getenv("SCHEDULER_ONLY") == "programmed" {
		p, c, perr := progSvc.Process(ctx, "scheduler-programmed")
		if perr != nil {
			slog.Error("programmed sweep", "err", perr)
			os.Exit(1)
		}
		slog.Info("programmed sweep", "promoted", p, "canceled", c)
		if n, cerr := progSvc.Cleanup(ctx); cerr == nil && n > 0 {
			slog.Info("programmed cleanup", "deleted", n)
		}
		return
	}

	if err := expirePresence(ctx, fsClient, pool, crewSvc, cfg.PresenceTimeout); err != nil {
		slog.Error("presence sweep", "err", err)
	}
	if err := expireOffers(ctx, fsClient, pool); err != nil {
		slog.Error("offers sweep", "err", err)
	}
	if err := expireStaleCalls(ctx, pool, fsClient); err != nil {
		slog.Error("calls sweep", "err", err)
	}
	// Reconciliación: autoridad SQL → repara proyecciones atrasadas/ausentes.
	repaired, errs := reconcile.Run(ctx, pool, fsClient, 2*time.Hour)
	slog.Info("reconcile done", "repaired", repaired, "errors", errs)
	// Cumplimiento diario: reevalúa conductores activos (complianceDaily v1).
	ev, cerr := compSvc.ScheduledSweep(ctx)
	slog.Info("compliance sweep", "evaluated", ev, "errors", cerr)
	// Viajes programados: promoción en ventana + retención (processProgrammedRides
	// + cleanupProgrammedRides de v1). Respaldo del job dedicado por minuto.
	p, c, err := progSvc.Process(ctx, "scheduler")
	if err != nil {
		slog.Error("programmed sweep", "err", err)
	}
	slog.Info("programmed sweep", "promoted", p, "canceled", c)
	if n, err := progSvc.Cleanup(ctx); err == nil && n > 0 {
		slog.Info("programmed cleanup", "deleted", n)
	}
	// Limpieza de mensajes de chat (equivalente a cleanupChatMessages de v1).
	if err := cleanupChatMessages(ctx, fsClient); err != nil {
		slog.Error("chat cleanup", "err", err)
	}
	retentionSweep(ctx, fsClient)
	slog.Info("scheduler done")
}

// expirePresence marca offline drivers_live con lastSeen más viejo que el
// umbral (reemplaza dependencia de onDisconnect) y aplica los efectos del
// trigger driverOffline de v1: rechaza ofertas pendientes del conductor y
// marca 'abandoned' a su seguidor de crew si lo tenía.
func expirePresence(ctx context.Context, c *firestore.Client, pool *pgxpool.Pool, crewSvc *crew.Service, timeout time.Duration) error {
	cutoff := time.Now().Add(-timeout)
	iter := c.Collection(fs.ColDriversLive).
		Where("status", "==", "online").
		Where("lastSeen", "<", cutoff).
		Documents(ctx)
	snaps, err := iter.GetAll()
	if err != nil {
		return err
	}
	batch := c.BulkWriter(ctx)
	for _, s := range snaps {
		if _, err := batch.Update(s.Ref, []firestore.Update{
			{Path: "status", Value: "offline"},
			{Path: "offlineAt", Value: firestore.ServerTimestamp},
		}); err != nil {
			slog.Warn("presence update", "doc", s.Ref.ID, "err", err)
		}
	}
	batch.End()
	for _, s := range snaps {
		uid := s.Ref.ID
		// rejectDriverOffersOnOffline: ofertas pendientes → rejected.
		offers, err := c.Collection(fs.ColDriverOffers).
			Where("driverId", "==", uid).
			Where("status", "==", "pending").
			Documents(ctx).GetAll()
		if err == nil {
			b := c.BulkWriter(ctx)
			for _, o := range offers {
				_, _ = b.Update(o.Ref, []firestore.Update{
					{Path: "status", Value: "rejected"},
					{Path: "reason", Value: "driver_offline"},
				})
			}
			b.End()
		}
		// Espejo durable en ride_offers (auditoría).
		if _, err := pool.Exec(ctx, `
			UPDATE public.ride_offers
			SET status = 'rejected', responded_at = NOW()
			WHERE driver_id = $1 AND status = 'sent'`, uid); err != nil {
			slog.Warn("offers offline audit", "uid", uid, "err", err)
		}
		// markCrewFollowerAbandonedOnOffline (driverOffline.ts de v1).
		if err := crewSvc.MarkFollowerAbandoned(ctx, uid); err != nil {
			slog.Warn("crew abandon", "uid", uid, "err", err)
		}
	}
	slog.Info("presence sweep", "expired", len(snaps))
	return nil
}

// expireStaleCalls — port de expireStaleCalls de v1: llamadas en estado
// ringing (initiated/ringing_*) cuyo acceptDeadline (o createdAt+60s) ya
// venció → 'missed' + archivo de sesión directo a SQL (backend-authoritative).
func expireStaleCalls(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client) error {
	now := time.Now()
	expired := 0
	for _, status := range []string{"initiated", "ringing_client", "ringing_operator", "ringing_driver"} {
		snaps, err := c.Collection(fs.ColCalls).
			Where("status", "==", status).
			Limit(200).
			Documents(ctx).GetAll()
		if err != nil {
			return err
		}
		for _, s := range snaps {
			d := s.Data()
			var deadline time.Time
			switch v := d["acceptDeadline"].(type) {
			case int64:
				deadline = time.UnixMilli(v)
			case float64:
				deadline = time.UnixMilli(int64(v))
			case time.Time:
				deadline = v
			default:
				if t := tsOrNil(d["createdAt"]); t != nil {
					deadline = t.Add(60 * time.Second)
				} else {
					continue
				}
			}
			if deadline.After(now) {
				continue
			}
			if _, err := s.Ref.Set(ctx, map[string]any{
				"status":    "missed",
				"endedAt":   firestore.ServerTimestamp,
				"updatedAt": firestore.ServerTimestamp,
			}, firestore.MergeAll); err != nil {
				slog.Warn("call missed", "callId", s.Ref.ID, "err", err)
				continue
			}
			_, _ = s.Ref.Collection("events").NewDoc().Set(ctx, map[string]any{
				"type": "missed", "at": firestore.ServerTimestamp, "source": "call_lifecycle",
			})
			// Archiva directo (el webhook también puede archivar; ON CONFLICT).
			if err := calls.ArchiveCallSession(ctx, pool, c, s.Ref.ID); err != nil {
				slog.Warn("call archive", "callId", s.Ref.ID, "err", err)
			}
			expired++
		}
	}
	slog.Info("calls sweep", "missed", expired)
	return nil
}

// tsOrNil — epoch ms / timestamp → time.Time (señalización v1 usa ms).
func tsOrNil(v any) *time.Time {
	var ms float64
	switch n := v.(type) {
	case float64:
		ms = n
	case int64:
		ms = float64(n)
	case time.Time:
		return &n
	default:
		return nil
	}
	if ms <= 0 {
		return nil
	}
	t := time.UnixMilli(int64(ms))
	return &t
}

// expireOffers marca 'expired' las REALTIME_driver_offers vencidas y espeja
// el cierre en ride_offers (auditoría SQL). La expiración real de negocio la
// confirma el comando SQL (OFFER_TTL_SECONDS).
func expireOffers(ctx context.Context, c *firestore.Client, pool *pgxpool.Pool) error {
	iter := c.Collection(fs.ColDriverOffers).
		Where("status", "==", "pending").
		Where("expiresAt", "<", time.Now()).
		Documents(ctx)
	snaps, err := iter.GetAll()
	if err != nil {
		return err
	}
	batch := c.BulkWriter(ctx)
	for _, s := range snaps {
		if _, err := batch.Update(s.Ref, []firestore.Update{
			{Path: "status", Value: "expired"},
		}); err != nil {
			slog.Warn("offer update", "doc", s.Ref.ID, "err", err)
		}
	}
	batch.End()
	if _, err := pool.Exec(ctx, `
		UPDATE public.ride_offers
		SET status = 'expired', responded_at = NOW()
		WHERE status = 'sent' AND expires_at IS NOT NULL AND expires_at < NOW()`); err != nil {
		return err
	}
	slog.Info("offers sweep", "expired", len(snaps))
	return nil
}

// cleanupChatMessages — borra mensajes de REALTIME_chats/{id}/messages con
// sentAt más viejo que la retención (efímeros; histórico vía chat_log_url
// cuando el flujo de soporte lo genere). Límite por seguridad.
func cleanupChatMessages(ctx context.Context, c *firestore.Client) error {
	cutoff := time.Now().Add(-7 * 24 * time.Hour)
	chats, err := c.Collection(fs.ColChats).Documents(ctx).GetAll()
	if err != nil {
		return err
	}
	deleted := 0
	for _, ch := range chats {
		iter := ch.Ref.Collection("messages").
			Where("sentAt", "<", cutoff).
			Limit(500).
			Documents(ctx)
		msgs, err := iter.GetAll()
		if err != nil {
			slog.Warn("chat cleanup query", "chat", ch.Ref.ID, "err", err)
			continue
		}
		batch := c.BulkWriter(ctx)
		for _, m := range msgs {
			if _, err := batch.Delete(m.Ref); err != nil {
				slog.Warn("chat cleanup delete", "err", err)
			}
		}
		batch.End()
		deleted += len(msgs)
	}
	slog.Info("chat cleanup", "deleted", deleted)
	return nil
}

// retentionSweep — retenciones de colecciones efímeras (los históricos viven
// en SQL): notification items 30d, trips_live terminal 7d, chats 30d,
// presence 7d. Equivalente a cleanupNotifications/cleanupOldRides(archivo)/
// cleanupOldChats/cleanupPresenceHistory de v1.
func retentionSweep(ctx context.Context, c *firestore.Client) {
	// Notificaciones leídas/nuevas >30d (collection group 'items').
	cut30 := time.Now().Add(-30 * 24 * time.Hour)
	if items, err := c.CollectionGroup("items").
		Where("createdAt", "<", cut30).Limit(2000).Documents(ctx).GetAll(); err == nil {
		b := c.BulkWriter(ctx)
		for _, d := range items {
			_, _ = b.Delete(d.Ref)
		}
		b.End()
		slog.Info("retention: notifications", "deleted", len(items))
	}
	// trips_live terminal >7d — borra doc + subcolección locations.
	cut7 := time.Now().Add(-7 * 24 * time.Hour)
	for _, status := range []string{"completed", "canceled", "rating_completed", "rating_skipped"} {
		trips, err := c.Collection(fs.ColTripsLive).
			Where("status", "==", status).
			Where("requestedAt", "<", cut7).Limit(500).Documents(ctx).GetAll()
		if err != nil {
			continue
		}
		for _, t := range trips {
			if locs, err := t.Ref.Collection("locations").Limit(500).Documents(ctx).GetAll(); err == nil {
				b := c.BulkWriter(ctx)
				for _, l := range locs {
					_, _ = b.Delete(l.Ref)
				}
				b.End()
			}
			_, _ = t.Ref.Delete(ctx)
		}
		if len(trips) > 0 {
			slog.Info("retention: trips_live", "status", status, "deleted", len(trips))
		}
	}
	// Chat docs >30d (los mensajes ya los limpia cleanupChatMessages).
	if chats, err := c.Collection(fs.ColChats).
		Where("createdAt", "<", cut30).Limit(500).Documents(ctx).GetAll(); err == nil {
		for _, ch := range chats {
			_, _ = ch.Ref.Delete(ctx)
		}
		if len(chats) > 0 {
			slog.Info("retention: chats", "deleted", len(chats))
		}
	}
	// presence >7d sin heartbeat.
	if pres, err := c.Collection(fs.ColPresence).
		Where("lastSeen", "<", cut7).Limit(1000).Documents(ctx).GetAll(); err == nil {
		b := c.BulkWriter(ctx)
		for _, p := range pres {
			_, _ = b.Delete(p.Ref)
		}
		b.End()
		if len(pres) > 0 {
			slog.Info("retention: presence", "deleted", len(pres))
		}
	}
	// cleanupOrphanPayments v1: payments_live cuyo trip_live ya no existe.
	if pays, err := c.Collection(fs.ColPaymentsLive).Limit(1000).Documents(ctx).GetAll(); err == nil {
		for _, p := range pays {
			if _, err := c.Collection(fs.ColTripsLive).Doc(p.Ref.ID).Get(ctx); err != nil {
				_, _ = p.Ref.Delete(ctx)
				slog.Info("retention: orphan payment_live", "id", p.Ref.ID)
			}
		}
	}
}
