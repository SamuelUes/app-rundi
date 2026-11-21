package main

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"
)

// archiveComplianceHistory is idempotent even if a worker dies after the SQL
// commit but before the Firestore event is marked processed.
func archiveComplianceHistory(ctx context.Context, pool *pgxpool.Pool, event map[string]any) error {
	payload, ok := event["payload"].(map[string]any)
	if !ok {
		return errors.New("invalid compliance history payload")
	}
	eventID, _ := payload["eventId"].(string)
	uid, _ := payload["uid"].(string)
	aggregateID, _ := event["aggregateId"].(string)
	kind, _ := payload["kind"].(string)
	revision, _ := payload["revision"].(int64)
	occurredAt, timeOK := event["createdAt"].(time.Time)
	snapshot, snapshotOK := payload["snapshot"].(map[string]any)
	if _, err := uuid.Parse(eventID); err != nil || uid == "" || len(uid) > 128 ||
		strings.Contains(uid, "/") || aggregateID != uid || revision <= 0 ||
		(kind != "documents_changed" && kind != "session_activated" && kind != "session_deactivated") ||
		!timeOK || occurredAt.IsZero() || !snapshotOK || snapshot == nil {
		return errors.New("invalid compliance history event")
	}
	encoded, err := json.Marshal(snapshot)
	if err != nil || len(encoded) > 128*1024 {
		return errors.New("invalid compliance history snapshot")
	}
	tx, err := pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	tag, err := tx.Exec(ctx, `INSERT INTO public.driver_compliance_history
		(event_id, driver_uid, event_kind, revision, snapshot, occurred_at)
		VALUES ($1::uuid, $2, $3, $4, $5::jsonb, $6)
		ON CONFLICT (event_id) DO NOTHING`, eventID, uid, kind, revision, string(encoded), occurredAt)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		var identical bool
		if err := tx.QueryRow(ctx, `SELECT driver_uid = $2 AND event_kind = $3 AND revision = $4
			AND snapshot = $5::jsonb AND occurred_at = $6::timestamptz
			FROM public.driver_compliance_history WHERE event_id = $1::uuid`,
			eventID, uid, kind, revision, string(encoded), occurredAt).Scan(&identical); err != nil {
			return err
		}
		if !identical {
			return errors.New("compliance history event id reused with different contents")
		}
	}
	if kind == "documents_changed" {
		if _, err := tx.Exec(ctx, `INSERT INTO public.driver_compliance_sync_checkpoints (driver_uid)
			VALUES ($1) ON CONFLICT (driver_uid) DO NOTHING`, uid); err != nil {
			return err
		}
		var checkpoint int64
		if err := tx.QueryRow(ctx, `SELECT document_revision FROM public.driver_compliance_sync_checkpoints
			WHERE driver_uid = $1 FOR UPDATE`, uid).Scan(&checkpoint); err != nil {
			return err
		}
		var contiguous int64
		if err := tx.QueryRow(ctx, `SELECT COALESCE(
			MIN($2::bigint + rn - 1) FILTER (WHERE revision <> $2::bigint + rn),
			MAX(revision), $2::bigint)
			FROM (SELECT revision, ROW_NUMBER() OVER (ORDER BY revision) AS rn
				FROM public.driver_compliance_history
				WHERE driver_uid = $1 AND event_kind = 'documents_changed' AND revision > $2) AS ordered`,
			uid, checkpoint).Scan(&contiguous); err != nil {
			return err
		}
		if contiguous > checkpoint {
			if _, err := tx.Exec(ctx, `UPDATE public.driver_compliance_sync_checkpoints
				SET document_revision=$2, updated_at=NOW() WHERE driver_uid=$1`, uid, contiguous); err != nil {
				return err
			}
		}
	}
	return tx.Commit(ctx)
}
