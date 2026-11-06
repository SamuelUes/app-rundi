package projections

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"

	"github.com/rundi/functions-v2/internal/fs"
)

// TestProjectDriverSession — el cerco sessionSeq impide que eventos atrasados
// apaguen una activación más reciente, y una activación nunca baja un viaje
// en curso. Requiere el emulador de Firestore local.
func TestProjectDriverSession(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := firestore.NewClient(ctx, "demo-rundi")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()

	uid := "sess-" + time.Now().Format("150405.000000000")
	ref := client.Collection(fs.ColDriversLive).Doc(uid)

	activated := func(seq float64) map[string]any {
		return map[string]any{
			"driverUid": uid, "sessionSeq": seq, "sessionId": "sid",
			"expiresAt": "2026-01-02T06:00:00Z", "serviceCodes": []any{"rides"},
		}
	}
	deactivated := func(seq float64) map[string]any {
		return map[string]any{"driverUid": uid, "sessionSeq": seq}
	}
	status := func() string {
		snap, err := ref.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		s, _ := snap.Data()["status"].(string)
		return s
	}

	// Activación seq=5 → online + campos de sesión.
	if err := projectDriverSession(ctx, client, activated(5), true); err != nil {
		t.Fatal(err)
	}
	if got := status(); got != "online" {
		t.Fatalf("status=%q want online", got)
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if codes, ok := snap.Data()["activeServiceCodes"].([]any); !ok || len(codes) != 1 {
		t.Fatalf("activeServiceCodes=%v", snap.Data()["activeServiceCodes"])
	}

	// deactivated seq=4 (atrasado) → no apaga la sesión seq=5.
	if err := projectDriverSession(ctx, client, deactivated(4), false); err != nil {
		t.Fatal(err)
	}
	if got := status(); got != "online" {
		t.Fatalf("stale deactivate left status=%q", got)
	}

	// deactivated seq=6 → offline y limpia la sesión.
	if err := projectDriverSession(ctx, client, deactivated(6), false); err != nil {
		t.Fatal(err)
	}
	if got := status(); got != "offline" {
		t.Fatalf("status=%q want offline", got)
	}
	snap, err = ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if v := snap.Data()["sessionId"]; v != nil {
		t.Fatalf("sessionId=%v want cleared", v)
	}

	// Con viaje en curso (status on_ride): activated seq=7 registra la sesión
	// pero NO baja el estado operativo.
	if _, err := ref.Set(ctx, map[string]any{"status": "on_ride"}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	if err := projectDriverSession(ctx, client, activated(7), true); err != nil {
		t.Fatal(err)
	}
	if got := status(); got != "on_ride" {
		t.Fatalf("activation changed on_ride status to %q", got)
	}
}
