package compliance

import (
	"context"
	"errors"
	"os"
	"strings"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"

	"github.com/rundi/functions-v2/internal/fs"
)

func TestFirestoreEligibilityValidation(t *testing.T) {
	now := time.Date(2026, 1, 2, 5, 59, 0, 0, time.UTC)
	day, end := NicaraguaDayWindow(now)
	in := FirestoreAvailabilityInputs{
		DriverUID: "uid", DriverID: "driver", VehicleID: "vehicle", Allowed: true,
		Revision: 1, PolicyVersion: 2, EngineVersion: RulesVersion, Day: day,
		ExpiresAt: end, ServiceCodes: []string{"rides"},
	}
	policy := firestoreCompliancePolicy{Version: 2, EngineVersion: RulesVersion}
	if !validFirestoreInputs(in, policy, "uid", now) {
		t.Fatal("valid input rejected")
	}
	tests := []struct {
		name string
		edit func(*FirestoreAvailabilityInputs, *firestoreCompliancePolicy)
	}{
		{"different owner", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { i.DriverUID = "other" }},
		{"denied", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { i.Allowed = false }},
		{"missing vehicle", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { i.VehicleID = "" }},
		{"stale policy", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { p.Version++ }},
		{"stale engine", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { i.EngineVersion = "old" }},
		{"expired", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { i.ExpiresAt = now }},
		{"past midnight", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) { i.ExpiresAt = end.Add(time.Second) }},
		{"duplicate services", func(i *FirestoreAvailabilityInputs, p *firestoreCompliancePolicy) {
			i.ServiceCodes = []string{"rides", "rides"}
		}},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			candidate, candidatePolicy := in, policy
			tc.edit(&candidate, &candidatePolicy)
			if validFirestoreInputs(candidate, candidatePolicy, "uid", now) {
				t.Fatal("invalid input authorized")
			}
		})
	}
}

func TestPrivateDocumentsAllowlist(t *testing.T) {
	if !validPrivateDocuments(map[string]any{"license": map[string]any{
		"status": "verified", "categories": []string{"A", "B"}, "expiryDate": "2030-01-01",
	}}) {
		t.Fatal("rejected valid metadata")
	}
	for _, docs := range []map[string]any{
		{"license": map[string]any{"documentPath": "private/image"}},
		{"license": map[string]any{"expiryDate": 123}},
		{"deleted": true, "vehicle": map[string]any{"plate": "123"}},
		{"unrecognized": map[string]any{}},
	} {
		if validPrivateDocuments(docs) {
			t.Fatalf("accepted invalid metadata: %v", docs)
		}
	}
}

func TestPrivateDocumentDatesFailClosed(t *testing.T) {
	now := time.Date(2026, 1, 2, 5, 30, 0, 0, time.UTC)
	valid := func() map[string]any {
		return map[string]any{
			"license":   map[string]any{"expiryDate": "2026-01-01"},
			"insurance": map[string]any{"effectiveUntil": "2026-01-02"},
			"vehicle":   map[string]any{"id": "vehicle"},
		}
	}
	if !validPrivateDocumentDates(valid(), "vehicle", now) {
		t.Fatal("expiry date should include the Nicaragua calendar day")
	}
	cases := []func(map[string]any){
		func(d map[string]any) { d["license"] = nil },
		func(d map[string]any) { d["license"] = map[string]any{"expiryDate": "2025-12-31"} },
		func(d map[string]any) { d["license"] = map[string]any{"expiryDate": "2026-02-31"} },
		func(d map[string]any) {
			d["insurance"] = map[string]any{"effectiveFrom": "2026-01-02", "effectiveUntil": "2027-01-01"}
		},
		func(d map[string]any) {
			d["insurance"] = map[string]any{"status": "rejected", "effectiveUntil": "2027-01-01"}
		},
		func(d map[string]any) { d["vehicle"] = map[string]any{"id": "other"} },
		func(d map[string]any) { d["inspection"] = map[string]any{"validUntil": "2025-12-31"} },
	}
	for _, change := range cases {
		docs := valid()
		change(docs)
		if validPrivateDocumentDates(docs, "vehicle", now) {
			t.Fatalf("accepted invalid dates: %v", docs)
		}
	}
}

func TestFirestoreSessionTransactions(t *testing.T) {
	if !strings.HasPrefix(os.Getenv("FIRESTORE_EMULATOR_HOST"), "127.0.0.1:") {
		t.Skip("requires a local Firestore emulator")
	}
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	client, err := firestore.NewClient(ctx, "demo-rundi-session-"+uuid.NewString())
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	uid := "session-test-" + uuid.NewString()
	inputRef := client.Collection(fs.ColDriverAvailabilityInputs).Doc(uid)
	liveRef := client.Collection(fs.ColDriversLive).Doc(uid)
	sessionRef := liveRef.Collection("private").Doc("availability")
	documentsRef := liveRef.Collection("private").Doc("documents")
	expiryRef := client.Collection(fs.ColDriverAvailabilityExpiry).Doc(uid)
	policyRef := client.Collection(fs.ColCompliancePolicy).Doc("active")
	pending := client.Collection(fs.ColPendingEvents).Where("aggregateId", "==", uid)
	defer func() {
		_, _ = inputRef.Delete(ctx)
		_, _ = sessionRef.Delete(ctx)
		_, _ = documentsRef.Delete(ctx)
		_, _ = liveRef.Delete(ctx)
		_, _ = expiryRef.Delete(ctx)
		_, _ = policyRef.Delete(ctx)
		docs, _ := pending.Documents(ctx).GetAll()
		for _, doc := range docs {
			_, _ = doc.Ref.Delete(ctx)
		}
	}()
	if _, err := ActivateFirestoreSession(ctx, client, uid, false); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("missing inputs must deny activation: %v", err)
	}
	now := time.Now()
	day, end := NicaraguaDayWindow(now)
	inputs := FirestoreAvailabilityInputs{
		DriverUID: uid, DriverID: "driver", VehicleID: "vehicle", Allowed: true,
		Revision: 1, PolicyVersion: 1, EngineVersion: RulesVersion, Day: day,
		ExpiresAt: end, ServiceCodes: []string{"rides"},
	}
	documents := map[string]any{
		"license":   map[string]any{"status": "verified", "expiryDate": "2099-01-01"},
		"vehicle":   map[string]any{"id": "vehicle"},
		"insurance": map[string]any{"status": "verified", "effectiveUntil": "2099-01-01"},
	}
	if _, err := policyRef.Set(ctx, firestoreCompliancePolicy{Version: 1, EngineVersion: RulesVersion}); err != nil {
		t.Fatal(err)
	}
	if err := ReplaceFirestoreAvailabilityInputs(ctx, client, uid, 0, inputs, documents, map[string]any{"license": "verified"}); err != nil {
		t.Fatal(err)
	}
	first, err := ActivateFirestoreSession(ctx, client, uid, false)
	if err != nil || first.Sequence != 1 || !first.Active {
		t.Fatalf("activation failed: %#v %v", first, err)
	}
	if _, err := CheckFirestoreSession(ctx, client, uid); err != nil {
		t.Fatal(err)
	}
	if err := fs.ProjectDriverSession(ctx, client, map[string]any{"driverUid": uid, "sessionSeq": float64(999)}, false); err != nil {
		t.Fatal(err)
	}
	live, err := liveRef.Get(ctx)
	if err != nil || live.Data()["status"] != "online" {
		t.Fatalf("legacy event changed Firestore-authoritative status: %v %v", live, err)
	}
	inputs.Revision++
	if err := ReplaceFirestoreAvailabilityInputs(ctx, client, uid, 1, inputs, documents, map[string]any{"license": "changed"}); err != nil {
		t.Fatal(err)
	}
	if _, err := CheckFirestoreSession(ctx, client, uid); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("changed inputs must invalidate the session: %v", err)
	}
	if err := ReplaceFirestoreAvailabilityInputs(ctx, client, uid, 1, inputs, documents, map[string]any{}); !errors.Is(err, ErrSessionSignalsStale) {
		t.Fatalf("stale input writer must be rejected: %v", err)
	}
	if err := DeactivateFirestoreSession(ctx, client, uid); err != nil {
		t.Fatal(err)
	}
	if err := DeactivateFirestoreSession(ctx, client, uid); err != nil {
		t.Fatal(err)
	}
	events, err := pending.Documents(ctx).GetAll()
	if err != nil || len(events) != 4 {
		t.Fatalf("expected two input changes, activation and one deactivation: %d %v", len(events), err)
	}
	if _, err := liveRef.Set(ctx, map[string]any{"status": "on_ride"}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	second, err := ActivateFirestoreSession(ctx, client, uid, false)
	if err != nil {
		t.Fatal(err)
	}
	expired, err := ExpireFirestoreSession(ctx, client, uid, first.Sequence)
	if err != nil || expired {
		t.Fatalf("old sweep revoked a newer session: %v %v", expired, err)
	}
	expired, err = ExpireFirestoreSession(ctx, client, uid, second.Sequence)
	if err != nil || expired {
		t.Fatalf("unexpired session was revoked: %v %v", expired, err)
	}
	if _, err := sessionRef.Update(ctx, []firestore.Update{{Path: "expiresAt", Value: time.Now().Add(-time.Second)}}); err != nil {
		t.Fatal(err)
	}
	if _, err := expiryRef.Update(ctx, []firestore.Update{{Path: "expiresAt", Value: time.Now().Add(-time.Second)}}); err != nil {
		t.Fatal(err)
	}
	count, err := SweepFirestoreSessionExpiry(ctx, client)
	if err != nil || count != 1 {
		t.Fatalf("expired session not revoked: %d %v", count, err)
	}
	if _, err := CheckFirestoreSession(ctx, client, uid); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("expired session must fail closed: %v", err)
	}
	live, err = liveRef.Get(ctx)
	if err != nil || live.Data()["status"] != "on_ride" {
		t.Fatalf("expiry interrupted an active ride: %v %v", live, err)
	}
	inputs.Revision = 3
	if err := ReplaceFirestoreAvailabilityInputs(ctx, client, uid, 2, inputs, documents, map[string]any{"license": "verified"}); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	activationResult, revokeResult := make(chan error, 1), make(chan error, 1)
	go func() {
		<-start
		_, err := ActivateFirestoreSession(ctx, client, uid, false)
		activationResult <- err
	}()
	go func() {
		<-start
		denied := inputs
		denied.Revision = 4
		denied.Allowed = false
		revokeResult <- ReplaceFirestoreAvailabilityInputs(ctx, client, uid, 3, denied, documents, map[string]any{"license": "rejected"})
	}()
	close(start)
	if err := <-activationResult; err != nil && !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("activation race failed: %v", err)
	}
	if err := <-revokeResult; err != nil {
		t.Fatalf("revocation race failed: %v", err)
	}
	if _, err := CheckFirestoreSession(ctx, client, uid); !errors.Is(err, ErrReactivationRequired) {
		t.Fatalf("concurrent rejection left a valid session: %v", err)
	}
}
