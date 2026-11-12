package clientevents

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/middleware"
)

func TestClientEventsIntegration(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("requires isolated Firestore emulator and TEST_DATABASE_URL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-rate")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	uid, other := uuid.NewString(), uuid.NewString()
	chatID, callID, messageID := uuid.NewString(), uuid.NewString(), uuid.NewString()
	if _, err := client.Collection(fs.ColChats).Doc(chatID).Set(ctx, map[string]any{"participants": []string{uid}}); err != nil {
		t.Fatal(err)
	}
	if _, err := client.Collection(fs.ColCalls).Doc(callID).Set(ctx, map[string]any{
		"callerUid": uid, "calleeUid": other, "status": "initiated",
	}); err != nil {
		t.Fatal(err)
	}
	handler := NewHandler(pool, client).Routes()
	call := func(path, actor string, body any) int {
		raw, err := json.Marshal(body)
		if err != nil {
			t.Fatal(err)
		}
		req := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(raw))
		req = req.WithContext(context.WithValue(req.Context(), middleware.CtxUID, actor))
		out := httptest.NewRecorder()
		handler.ServeHTTP(out, req)
		return out.Code
	}
	msg := map[string]string{"chatId": chatID, "messageId": messageID, "text": "hola"}
	if got := call("/chat", other, msg); got != 403 {
		t.Fatalf("nonparticipant chat status=%d", got)
	}
	for i := 0; i < 2; i++ {
		if got := call("/chat", uid, msg); got != 200 {
			t.Fatalf("chat attempt %d status=%d", i, got)
		}
	}
	msg["text"] = "different"
	if got := call("/chat", uid, msg); got != 409 {
		t.Fatalf("changed idempotent message status=%d", got)
	}
	if _, err := client.Collection(fs.ColPendingEvents).Doc(eventID("chat", chatID, messageID)).Get(ctx); err != nil {
		t.Fatal(err)
	}
	accept := map[string]string{"callId": callID}
	if got := call("/call-accept", uid, accept); got != 403 {
		t.Fatalf("caller accepted call: status=%d", got)
	}
	for i := 0; i < 2; i++ {
		if got := call("/call-accept", other, accept); got != 204 {
			t.Fatalf("accept attempt %d status=%d", i, got)
		}
	}
	if _, err := client.Collection(fs.ColCalls).Doc(callID).Collection("events").Doc(other + "-accepted").Get(ctx); err != nil {
		t.Fatal(err)
	}
	end := map[string]string{"callId": callID, "status": "ended"}
	if got := call("/call-end", uuid.NewString(), end); got != 403 {
		t.Fatalf("nonparticipant call status=%d", got)
	}
	for i := 0; i < 2; i++ {
		if got := call("/call-end", uid, end); got != 204 {
			t.Fatalf("call attempt %d status=%d", i, got)
		}
	}
	if _, err := client.Collection(fs.ColPendingEvents).Doc("call-end-" + callID).Get(ctx); err != nil {
		t.Fatal(err)
	}

	var rideID string
	if _, err := pool.Exec(ctx, `INSERT INTO public.users(id, role) VALUES ($1, 'client'), ($2, 'driver')`, other, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.drivers(user_id) VALUES ($1)`, uid); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(ctx, `INSERT INTO public.rides(client_id, driver_id, status)
		VALUES ($1, $2, 'completed') RETURNING id::text`, other, uid).Scan(&rideID); err != nil {
		t.Fatal(err)
	}
	photo := map[string]string{"rideId": rideID, "path": "rides-documents/rides-inspection/designated-arrival/" + uid + "/1.jpg"}
	if got := call("/arrival-photo", other, photo); got != 400 {
		t.Fatalf("other user photo status=%d", got)
	}
	otherPhoto := map[string]string{"rideId": rideID, "path": "rides-documents/rides-inspection/designated-arrival/" + other + "/1.jpg"}
	if got := call("/arrival-photo", other, otherPhoto); got != 403 {
		t.Fatalf("non-driver photo status=%d", got)
	}
	for i := 0; i < 2; i++ {
		if got := call("/arrival-photo", uid, photo); got != 204 {
			t.Fatalf("arrival photo attempt %d status=%d", i, got)
		}
	}
	if _, err := client.Collection(fs.ColPendingEvents).Doc(eventID("arrival", rideID, uid, photo["path"])).Get(ctx); err != nil {
		t.Fatal(err)
	}
}
