// Push VoIP (PushKit) a los dispositivos iOS del callee — despierta la app y
// reporta la llamada a CallKit aunque esté muerta. Los tokens viven en
// DATA-MAIN_users/{uid}/voipTokens (doc id = token; bundleId deriva el topic
// {bundle}.voip). Se dispara dos veces por llamada: síncrono en Initiate
// (latencia ~0) y desde el consumer de pending events (respaldo durable);
// la app deduplica por callId antes de reportar a CallKit.
package calls

import (
	"context"
	"log/slog"

	"cloud.google.com/go/firestore"

	"github.com/rundi/functions-v2/internal/apns"
	"github.com/rundi/functions-v2/internal/fs"
)

// SendVoipCallPush — best-effort: errores se loggean, nunca fallan al caller.
// Los tokens inválidos se purgan igual que los FCM.
func SendVoipCallPush(ctx context.Context, c *firestore.Client, sender *apns.Sender, callID, callerUID, callee string) {
	if sender == nil || callee == "" || callID == "" {
		return
	}
	tokSnaps, err := c.Collection(fs.ColUsers).Doc(callee).
		Collection("voipTokens").Documents(ctx).GetAll()
	if err != nil {
		slog.Warn("voip token lookup failed", "call", callID, "callee", callee, "err", err)
		return
	}
	if len(tokSnaps) == 0 {
		return
	}
	callerName := "Rundi"
	if snap, err := c.Collection(fs.ColUsers).Doc(callerUID).Get(ctx); err == nil {
		if n, _ := snap.Data()["name"].(string); n != "" {
			callerName = n
		}
	}
	payload := map[string]any{
		"type": "call", "callId": callID, "callerName": callerName, "callerUid": callerUID,
	}
	for _, ts := range tokSnaps {
		bundleID, _ := ts.Data()["bundleId"].(string)
		if bundleID == "" {
			continue
		}
		invalid, err := sender.SendVoip(ctx, ts.Ref.ID, bundleID+".voip", payload)
		if err != nil {
			slog.Warn("voip push failed", "call", callID, "callee", callee, "err", err)
		}
		if invalid {
			_, _ = ts.Ref.Delete(ctx)
		}
	}
}
