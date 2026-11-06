package projections

import (
	"context"
	"encoding/json"
	"fmt"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

// WriteStatus records only successfully applied versions and prevents an
// older worker from replacing the status of a newer projection.
// revision >= 0 registra appliedRevision: la revision SQL (orden de commit)
// que la proyeccion aplico; el reconciliador la compara contra la fila.
func WriteStatus(ctx context.Context, c *firestore.Client, aggregateType, aggregateID string, version any, revision int64, eventID, state, lastErr string) error {
	ref := c.Collection(fs.ColProjectionStatus).Doc(aggregateType + "_" + aggregateID)
	incoming, incomingOK := statusVersion(version)
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		var current float64
		var currentOK bool
		var previousState string
		var failedVersion float64
		var failedVersionOK bool
		if snap != nil && snap.Exists() {
			current, currentOK = statusVersion(snap.Data()["appliedVersion"])
			previousState, _ = snap.Data()["status"].(string)
			failedVersion, failedVersionOK = statusVersion(snap.Data()["failedVersion"])
			if !incomingOK && (state == "ok" || state == "reconciled") &&
				(previousState == "error" || previousState == "failed") {
				return nil
			}
		}
		if incomingOK && currentOK && incoming < current {
			return nil
		}
		isSuccess := state == "ok" || state == "reconciled"
		previousFailure := previousState == "error" || previousState == "failed"
		if previousFailure && failedVersionOK && incomingOK && incoming < failedVersion {
			if !isSuccess {
				return nil
			}
			// Record an older success without concealing a newer failed version.
			return tx.Update(ref, []firestore.Update{{Path: "appliedVersion", Value: version}})
		}
		data := map[string]any{
			"aggregateType": aggregateType,
			"aggregateId":   aggregateID,
			"status":        state,
			"updatedAt":     firestore.ServerTimestamp,
		}
		if eventID != "" {
			data["lastEventId"] = eventID
		}
		if isSuccess {
			if incomingOK {
				data["appliedVersion"] = version
			}
			if revision >= 0 {
				data["appliedRevision"] = revision
			}
			if snap != nil && snap.Exists() {
				data["lastError"] = firestore.Delete
				data["failedVersion"] = firestore.Delete
			}
		} else {
			if lastErr != "" {
				data["lastError"] = lastErr
			}
			if incomingOK {
				data["failedVersion"] = version
			}
		}
		return tx.Set(ref, data, firestore.MergeAll)
	})
}

func statusVersion(value any) (float64, bool) {
	switch v := value.(type) {
	case int:
		return float64(v), true
	case int64:
		return float64(v), true
	case float64:
		return v, true
	case json.Number:
		n, err := v.Float64()
		return n, err == nil
	default:
		return 0, false
	}
}

// ReadStatusVersion returns -1 for missing or failed markers, including for
// legacy version-zero projections, so the reconciler does not skip them.
func ReadStatusVersion(ctx context.Context, c *firestore.Client, aggregateType, aggregateID string) (float64, error) {
	snap, err := c.Collection(fs.ColProjectionStatus).Doc(aggregateType + "_" + aggregateID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return -1, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read projection status: %w", err)
	}
	if state, _ := snap.Data()["status"].(string); state == "error" || state == "failed" {
		return -1, nil
	}
	version, ok := statusVersion(snap.Data()["appliedVersion"])
	if !ok {
		return -1, nil
	}
	return version, nil
}

// ReadStatusRevision — revision SQL que el status tiene registrada (-1 si no
// existe o el ultimo intento fallo). Es el valor que el reconciliador compara
// contra la columna revision de la fila (monotona en orden de commit).
func ReadStatusRevision(ctx context.Context, c *firestore.Client, aggregateType, aggregateID string) (float64, error) {
	snap, err := c.Collection(fs.ColProjectionStatus).Doc(aggregateType + "_" + aggregateID).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return -1, nil
	}
	if err != nil {
		return 0, fmt.Errorf("read projection status: %w", err)
	}
	if state, _ := snap.Data()["status"].(string); state == "error" || state == "failed" {
		return -1, nil
	}
	revision, ok := statusVersion(snap.Data()["appliedRevision"])
	if !ok {
		return -1, nil
	}
	return revision, nil
}
