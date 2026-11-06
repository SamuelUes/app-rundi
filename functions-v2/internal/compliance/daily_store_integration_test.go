package compliance

import (
	"context"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
)

// TestDailyStoreIntegration — el resultado diario se guarda en la colección
// interna y se relee con los mismos datos; docs ausentes, incompletos o con
// señales inválidas nunca se leen como autorización.
func TestDailyStoreIntegration(t *testing.T) {
	if os.Getenv("RUN_LOCAL_DAILY_STORE_INTEGRATION") != "1" ||
		!strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	client, err := firestore.NewClient(ctx, "demo-daily-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	store := NewDailyStore(client)
	driverID := uuid.NewString()

	// Documento ausente: sin caché, no error.
	if _, found, err := store.Load(ctx, driverID); err != nil || found {
		t.Fatalf("missing doc found=%v err=%v", found, err)
	}

	ev := dailyEvalFixture()
	ev.DriverID = &driverID
	delete(ev.InputGenerations, "driver:d-1")
	ev.InputGenerations["driver:"+driverID] = 2
	decision, err := DailyDecisionFromEvaluation(ev, []string{"rides"})
	if err != nil {
		t.Fatal(err)
	}
	if err := store.Save(ctx, decision); err != nil {
		t.Fatal(err)
	}
	loaded, found, err := store.Load(ctx, driverID)
	if err != nil || !found {
		t.Fatalf("load found=%v err=%v", found, err)
	}
	if loaded.Day != decision.Day || !loaded.EvaluatedAt.Equal(decision.EvaluatedAt) ||
		!loaded.ExpiresAt.Equal(decision.ExpiresAt) || loaded.Context.DriverID != driverID {
		t.Fatalf("loaded=%+v want=%+v", loaded, decision)
	}
	now := decision.EvaluatedAt.Add(time.Hour)
	if !ReusableDailyDecision(loaded, loaded.Context, now) {
		t.Fatal("stored decision should validate against its own context")
	}
	stale := loaded.Context
	stale.InputGenerations = map[string]int64{}
	for k, v := range loaded.Context.InputGenerations {
		stale.InputGenerations[k] = v
	}
	stale.InputGenerations["driver:"+driverID] = 99
	if ReusableDailyDecision(loaded, stale, now) {
		t.Fatal("changed SQL generation must not reuse the decision")
	}

	// Guardar una decisión incompleta es error y no deja documento.
	blocked := decision
	blocked.Allowed = false
	if err := store.Save(ctx, blocked); err == nil {
		t.Fatal("incomplete decision must not be saved")
	}
	loaded, found, err = store.Load(ctx, driverID)
	if err != nil || !found || !loaded.Allowed {
		t.Fatalf("failed save must not overwrite: found=%v allowed=%v err=%v", found, loaded.Allowed, err)
	}

	// Documento incompleto (sin generaciones) nunca se lee como válido.
	if _, err := client.Collection(fs.ColDriverDailyCompliance).Doc("broken").Set(ctx, map[string]any{
		"allowed": true, "day": decision.Day,
		"evaluatedAt": decision.EvaluatedAt, "expiresAt": decision.ExpiresAt,
	}); err != nil {
		t.Fatal(err)
	}
	if _, _, err := store.Load(ctx, "broken"); err == nil {
		t.Fatal("incomplete stored doc must fail closed")
	}
}
