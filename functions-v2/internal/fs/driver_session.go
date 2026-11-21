package fs

import (
	"context"
	"errors"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ProjectDriverSession fences reordered activation events with the SQL session sequence.
func ProjectDriverSession(ctx context.Context, c *firestore.Client, p map[string]any, online bool) error {
	uid, _ := p["driverUid"].(string)
	if uid == "" {
		return errors.New("driver session event without driverUid")
	}
	seq, _ := p["sessionSeq"].(float64)
	ref := c.Collection(ColDriversLive).Doc(uid)
	return c.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		existingStatus := ""
		if err == nil {
			// Firestore-authoritative sessions use their own sequence. A delayed
			// legacy SQL event must never overwrite the newer authority.
			if snap.Data()["availabilitySource"] == "firestore" {
				return nil
			}
			existingStatus, _ = snap.Data()["status"].(string)
			var prev float64
			switch v := snap.Data()["sessionSeq"].(type) {
			case int64:
				prev = float64(v)
			case float64:
				prev = v
			}
			if prev > seq {
				return nil
			}
		}
		data := map[string]any{"sessionSeq": seq, "updatedAt": firestore.ServerTimestamp}
		if online {
			forceOnline, _ := p["postRideReactivation"].(bool)
			if forceOnline || (existingStatus != "on_ride" && existingStatus != "busy") {
				data["status"] = "online"
			}
			data["sessionId"], _ = p["sessionId"].(string)
			data["sessionExpiresAt"], _ = p["expiresAt"].(string)
			if serviceCodes, ok := p["serviceCodes"].([]any); ok {
				data["activeServiceCodes"] = serviceCodes
			}
			data["offlineAt"] = nil
		} else {
			data["status"] = "offline"
			data["offlineAt"] = firestore.ServerTimestamp
			data["sessionId"] = nil
			data["sessionExpiresAt"] = nil
		}
		return tx.Set(ref, data, firestore.MergeAll)
	})
}
