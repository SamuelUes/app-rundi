package programmed

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"regexp"
	"strings"
	"sync"
	"testing"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgconn"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/compliance"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/middleware"
	"github.com/rundi/functions-v2/internal/notifications"
	"github.com/rundi/functions-v2/internal/rides"
)

func TestProgrammedRideCannotOverwriteConfirmedDriver(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("requires Firestore emulator and isolated PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-programmed-test")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ref := client.Collection(col).Doc(uuid.NewString())
	_, err = ref.Set(ctx, map[string]any{
		"clientId": "client", "driverId": "first-driver", "driverConfirmed": true,
		"clientConfirmed": true, "status": "client_confirmed",
		"scheduledAt": time.Now().Add(time.Hour).UnixMilli(),
	})
	if err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, client)
	if err := svc.Assign(ctx, "client", ref.ID, "local-driver"); err == nil {
		t.Fatal("assignment must not replace a confirmed driver")
	}
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if snap.Data()["driverId"] != "first-driver" || snap.Data()["driverConfirmed"] != true {
		t.Fatal("confirmed driver was changed")
	}
	if _, err := ref.Set(ctx, map[string]any{"driverConfirmed": false}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	if err := svc.Assign(ctx, "client", ref.ID, "local-driver"); err == nil {
		t.Fatal("pending invitation must be explicitly removed before replacement")
	}
}

func TestClientCanRemoveOnlyCurrentDriver(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	svc.SetNotifications(notifications.NewCenter(client, nil))
	handler := NewHandler(svc).Routes()
	for index, confirmed := range []bool{false, true} {
		ref := client.Collection(col).Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"clientId": "client", "status": "client_confirmed", "clientConfirmed": true,
			"driverId": "driver", "driver": map[string]any{"name": "Driver"},
			"driverConfirmed": confirmed, "driverInvitation": true, "driverInvitationAt": int64(123),
			"shareCode": "ABCD12", "scheduledAt": time.Now().Add(time.Hour).UnixMilli(),
		}); err != nil {
			t.Fatal(err)
		}
		call := func(uid, driver string, state bool, version int64) int {
			body, _ := json.Marshal(map[string]any{"driverId": driver, "driverConfirmed": state, "invitationAt": version})
			req := httptest.NewRequest(http.MethodPost, "/"+ref.ID+"/remove-driver", strings.NewReader(string(body)))
			req = req.WithContext(context.WithValue(req.Context(), middleware.CtxUID, uid))
			w := httptest.NewRecorder()
			handler.ServeHTTP(w, req)
			return w.Code
		}
		if code := call("other", "driver", confirmed, 123); code != http.StatusForbidden {
			t.Fatalf("non-owner: %d", code)
		}
		for _, code := range []int{
			call("client", "other", confirmed, 123),
			call("client", "driver", !confirmed, 123),
			call("client", "driver", confirmed, 122),
		} {
			if code != http.StatusConflict {
				t.Fatalf("stale removal: %d", code)
			}
		}
		if code := call("client", "driver", confirmed, 123); code != http.StatusOK {
			t.Fatalf("remove confirmed=%v: %d", confirmed, code)
		}
		snap, err := ref.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		data := snap.Data()
		if data["driverId"] != nil || data["driver"] != nil || data["driverConfirmed"] != false ||
			data["clientConfirmed"] != true || data["status"] != "client_confirmed" || data["shareCode"] != "ABCD12" {
			t.Fatalf("unexpected ride after removal: %v", data)
		}
		if code := call("client", "driver", confirmed, 123); code != http.StatusConflict {
			t.Fatalf("duplicate removal: %d", code)
		}
		items, err := client.Collection(fs.ColNotifications).Doc("driver").Collection("items").Documents(ctx).GetAll()
		if err != nil || len(items) != index+1 {
			t.Fatalf("driver not notified: %d %v", len(items), err)
		}
		for _, item := range items {
			payload, _ := item.Data()["data"].(map[string]any)
			if payload["type"] != "programmed_ride_driver_removed" || payload["role"] != "driver" || len(item.Ref.ID) > 64 {
				t.Fatalf("invalid driver notification: %v", payload)
			}
		}
	}
}

func TestRemovalAndConfirmationAreExclusive(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	for i := 0; i < 5; i++ {
		ref := client.Collection(col).Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"clientId": "client", "status": "scheduled", "driverId": "driver",
			"driverConfirmed": false, "driverInvitation": true, "driverInvitationAt": int64(123),
			"scheduledAt": time.Now().Add(time.Hour).UnixMilli(),
		}); err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		var wg sync.WaitGroup
		var removed, confirmed error
		at := int64(123)
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			removed = svc.RemoveDriver(ctx, "client", ref.ID, "driver", false, at)
		}()
		go func() { defer wg.Done(); <-start; confirmed = svc.Confirm(ctx, "driver", ref.ID, "driver", &at) }()
		close(start)
		wg.Wait()
		if (removed == nil) == (confirmed == nil) {
			t.Fatalf("exactly one must succeed: remove=%v confirm=%v", removed, confirmed)
		}
		snap, err := ref.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		d := snap.Data()
		if removed == nil && d["driverId"] != nil {
			t.Fatalf("removed driver still assigned: %v", d)
		}
		if confirmed == nil && (d["driverId"] != "driver" || d["driverConfirmed"] != true) {
			t.Fatalf("confirmed driver not retained: %v", d)
		}
	}
}

func TestRemovedInvitationCannotAnswerNewInvitation(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": "client", "status": "scheduled",
		"driverId": "driver", "driverConfirmed": false, "driverInvitation": true,
		"driverInvitationAt": int64(123), "scheduledAt": time.Now().Add(time.Hour).UnixMilli(),
	}); err != nil {
		t.Fatal(err)
	}
	if err := svc.RemoveDriver(ctx, "client", ref.ID, "driver", false, 123); err != nil {
		t.Fatal(err)
	}
	if _, err := ref.Set(ctx, map[string]any{
		"driverId": "driver", "driverConfirmed": false,
		"driverInvitation": true, "driverInvitationAt": int64(124),
	}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	old, current := int64(123), int64(124)
	if err := svc.Confirm(ctx, "driver", ref.ID, "driver", &old); err == nil {
		t.Fatal("old invitation must not confirm a new invitation")
	}
	if err := svc.Decline(ctx, "driver", ref.ID, &old); err == nil {
		t.Fatal("old invitation must not decline a new invitation")
	}
	if err := svc.Confirm(ctx, "driver", ref.ID, "driver", nil); err == nil {
		t.Fatal("unversioned confirmation must not answer a new invitation after removal")
	}
	if err := svc.Confirm(ctx, "driver", ref.ID, "driver", &current); err != nil {
		t.Fatal(err)
	}
}

func TestRemovalAndPromotionAreExclusive(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	for i := 0; i < 10; i++ {
		ref := client.Collection(col).Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"clientId": "client", "status": "client_confirmed", "clientConfirmed": true,
			"driverId": "driver", "driverConfirmed": true, "driverInvitationAt": int64(123),
			"scheduledAt": time.Now().Add(-time.Second).UnixMilli(),
		}); err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		var wg sync.WaitGroup
		var removed error
		var promoted map[string]any
		var action string
		var promotionErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			removed = svc.RemoveDriver(ctx, "client", ref.ID, "driver", true, 123)
		}()
		go func() { defer wg.Done(); <-start; promoted, action, promotionErr = svc.preparePromotion(ctx, ref) }()
		close(start)
		wg.Wait()
		if promotionErr != nil || action != "promote" {
			t.Fatalf("promotion: %q %v", action, promotionErr)
		}
		if removed == nil && str(promoted["driverId"]) != "" {
			t.Fatal("promotion captured a driver after successful removal")
		}
		if removed != nil && str(promoted["driverId"]) != "driver" {
			t.Fatalf("failed removal must leave driver in promotion: %v %v", removed, promoted)
		}
	}
}

func TestConcurrentAssignmentsDoNotDoubleBookDriver(t *testing.T) {
	dsn := os.Getenv("TEST_PROGRAMMED_DATABASE_URL")
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || dsn == "" {
		t.Skip("requires Firestore emulator and isolated test PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, againstRegular := range []bool{false, true} {
		for i := 0; i < 4; i++ {
			firstClient, secondClient, driverUID := uuid.NewString(), uuid.NewString(), uuid.NewString()
			if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1,'client'),($2,'client'),($3,'driver')`, firstClient, secondClient, driverUID); err != nil {
				t.Fatal(err)
			}
			var driverID string
			if err := pool.QueryRow(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1,'active') RETURNING id::text`, driverUID).Scan(&driverID); err != nil {
				t.Fatal(err)
			}
			if _, err := pool.Exec(ctx, `INSERT INTO public.vehicles (driver_id, plate, type, is_active) VALUES ($1::uuid,$2,'auto',true)`, driverID, uuid.NewString()[:8]); err != nil {
				t.Fatal(err)
			}
			var generation int64
			if _, err := pool.Exec(ctx, `INSERT INTO public.compliance_signals (kind, signal_key) VALUES ('driver',$1) ON CONFLICT DO NOTHING`, driverID); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT generation FROM public.compliance_signals WHERE kind='driver' AND signal_key=$1`, driverID).Scan(&generation); err != nil {
				t.Fatal(err)
			}
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			today, end := compliance.NicaraguaDayWindow(time.Now())
			if _, _, err := compliance.OpenDriverSession(ctx, tx, driverID, today, nil, []string{"rides"}, map[string]int64{"driver:" + driverID: generation}, end); err != nil {
				t.Fatal(err)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
			if _, err := client.Collection(fs.ColDriversLive).Doc(driverUID).Set(ctx, map[string]any{"status": "online"}); err != nil {
				t.Fatal(err)
			}
			svc := NewService(pool, client)
			ref := client.Collection(col).Doc(uuid.NewString())
			if _, err := ref.Set(ctx, map[string]any{
				"clientId": firstClient, "driverId": driverUID, "status": "client_confirmed",
				"clientConfirmed": true, "driverConfirmed": true,
				"scheduledAt": time.Now().Add(-time.Second).UnixMilli(), "estimatedPrice": 100,
			}); err != nil {
				t.Fatal(err)
			}
			data, action, err := svc.preparePromotion(ctx, ref)
			if err != nil || action != "promote" {
				t.Fatalf("prepare: %q %v", action, err)
			}
			var otherRef *firestore.DocumentRef
			var otherData map[string]any
			var regularID string
			if againstRegular {
				if err := pool.QueryRow(ctx, `INSERT INTO public.rides (client_id, status, estimated_price) VALUES ($1,'requested',100) RETURNING id::text`, secondClient).Scan(&regularID); err != nil {
					t.Fatal(err)
				}
				if _, err := client.Collection(fs.ColDriverOffers).Doc(regularID+"_"+driverUID).Set(ctx, map[string]any{"status": "pending", "offeredPrice": 100.0}); err != nil {
					t.Fatal(err)
				}
			} else {
				otherRef = client.Collection(col).Doc(uuid.NewString())
				if _, err := otherRef.Set(ctx, map[string]any{
					"clientId": secondClient, "driverId": driverUID, "status": "client_confirmed",
					"clientConfirmed": true, "driverConfirmed": true,
					"scheduledAt": time.Now().Add(-time.Second).UnixMilli(), "estimatedPrice": 100,
				}); err != nil {
					t.Fatal(err)
				}
				otherData, action, err = svc.preparePromotion(ctx, otherRef)
				if err != nil || action != "promote" {
					t.Fatalf("prepare second: %q %v", action, err)
				}
			}
			start := make(chan struct{})
			var wg sync.WaitGroup
			var firstErr, secondErr error
			wg.Add(2)
			go func() {
				defer wg.Done()
				<-start
				firstErr = svc.promote(ctx, ref, data, true, t.Name())
			}()
			go func() {
				defer wg.Done()
				<-start
				if againstRegular {
					_, secondErr = rides.NewService(pool, client).ConfirmDriver(ctx, regularID, secondClient, driverUID, t.Name())
				} else {
					secondErr = svc.promote(ctx, otherRef, otherData, true, t.Name())
				}
			}()
			close(start)
			wg.Wait()
			for _, result := range []error{firstErr, secondErr} {
				if result == nil {
					continue
				}
				var pgErr *pgconn.PgError
				var domainErr *apperr.Error
				if !(errors.As(result, &pgErr) && pgErr.Code == "40001") && !(errors.As(result, &domainErr) && domainErr.Code == 409) {
					t.Fatalf("unexpected assignment error: %v", result)
				}
			}
			if firstErr != nil {
				if err := svc.promote(ctx, ref, data, true, t.Name()); err != nil {
					t.Fatalf("retry first: %v", err)
				}
			}
			if !againstRegular && secondErr != nil {
				if err := svc.promote(ctx, otherRef, otherData, true, t.Name()); err != nil {
					t.Fatalf("retry second: %v", err)
				}
			}
			var active int
			if err := pool.QueryRow(ctx, `SELECT COUNT(*) FROM public.rides WHERE driver_id=$1
				AND status IN ('accepted','driver_on_route','driver_arrived','in_progress','pending_payment')`, driverUID).Scan(&active); err != nil {
				t.Fatal(err)
			}
			if active != 1 {
				t.Fatalf("againstRegular=%v: driver has %d active rides (errors: %v, %v)", againstRegular, active, firstErr, secondErr)
			}
		}
	}
}

func TestInvitationHTTPFlow(t *testing.T) {
	dsn := os.Getenv("TEST_PROGRAMMED_DATABASE_URL")
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || dsn == "" {
		t.Skip("requires Firestore emulator and isolated test PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	clientUID, driverUID := uuid.NewString(), uuid.NewString()
	name := "Test " + uuid.NewString()
	license := "LIC" + strings.ReplaceAll(uuid.NewString(), "-", "")
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role, name) VALUES ($1,'client','Client'),($2,'driver',$3)`, clientUID, driverUID, name); err != nil {
		t.Fatal(err)
	}
	var driverID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.drivers (user_id, account_status, license_number)
		VALUES ($1,'active',$2) RETURNING id::text`, driverUID, license).Scan(&driverID); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, client)
	svc.SetNotifications(notifications.NewCenter(client, nil))
	handler := NewHandler(svc).Routes()
	call := func(method, path, body, uid string) *httptest.ResponseRecorder {
		t.Helper()
		req := httptest.NewRequest(method, path, strings.NewReader(body))
		req = req.WithContext(context.WithValue(req.Context(), middleware.CtxUID, uid))
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, req)
		return w
	}
	payload, err := json.Marshal(map[string]any{
		"scheduledAt":    time.Now().Add(time.Hour).UnixMilli(),
		"origin":         map[string]any{"lat": 12.1, "lng": -86.2, "address": "Origin"},
		"destination":    map[string]any{"lat": 12.2, "lng": -86.3, "address": "Destination"},
		"estimatedPrice": 100,
	})
	if err != nil {
		t.Fatal(err)
	}
	created := call(http.MethodPost, "/", string(payload), clientUID)
	if created.Code != http.StatusCreated {
		t.Fatalf("create: %d %s", created.Code, created.Body)
	}
	var result struct {
		ID        string `json:"id"`
		ShareCode string `json:"shareCode"`
	}
	if err := json.Unmarshal(created.Body.Bytes(), &result); err != nil || result.ID == "" || result.ShareCode == "" {
		t.Fatalf("create response: %+v err=%v", result, err)
	}
	for _, query := range []string{name, driverUID, driverID, license} {
		w := call(http.MethodGet, "/"+result.ID+"/candidates?q="+url.QueryEscape(query), "", clientUID)
		var found struct {
			Candidates []DriverCandidate `json:"candidates"`
		}
		if w.Code != http.StatusOK || json.Unmarshal(w.Body.Bytes(), &found) != nil || len(found.Candidates) != 1 || found.Candidates[0].DriverID != driverUID {
			t.Fatalf("search %q: %d %s", query, w.Code, w.Body)
		}
	}
	w := call(http.MethodPost, "/"+result.ID+"/assign", `{"driverId":"`+driverUID+`"}`, clientUID)
	if w.Code != http.StatusOK {
		t.Fatalf("invite: %d %s", w.Code, w.Body)
	}
	ref := client.Collection(col).Doc(result.ID)
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["driverInvitation"] != true || snap.Data()["driverConfirmed"] != false {
		t.Fatalf("invitation not pending: %v %v", snap, err)
	}
	w = call(http.MethodPost, "/"+result.ID+"/decline", `{}`, driverUID)
	if w.Code != http.StatusOK {
		t.Fatalf("decline: %d %s", w.Code, w.Body)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["driverInvitationStatus"] != "declined" {
		t.Fatalf("decline not visible to client: %v %v", snap, err)
	}
	w = call(http.MethodPost, "/"+result.ID+"/assign", `{"driverId":"`+driverUID+`"}`, clientUID)
	if w.Code != http.StatusOK {
		t.Fatalf("reinvite: %d %s", w.Code, w.Body)
	}
	items, err := client.Collection(fs.ColNotifications).Doc(driverUID).Collection("items").Documents(ctx).GetAll()
	if err != nil || len(items) != 2 {
		t.Fatalf("invitations must have distinct notifications: %d %v", len(items), err)
	}
	for _, item := range items {
		if len(item.Ref.ID) > 64 {
			t.Fatalf("notification collapse id exceeds APNs limit: %q", item.Ref.ID)
		}
		data, ok := item.Data()["data"].(map[string]any)
		if !ok || data["expiresInMs"] == "120000" {
			t.Fatalf("invitation push expires too early: %v", data)
		}
	}
	w = call(http.MethodPost, "/"+result.ID+"/confirm", `{"as":"driver"}`, driverUID)
	if w.Code != http.StatusOK {
		t.Fatalf("driver acceptance: %d %s", w.Code, w.Body)
	}
	snap, err = ref.Get(ctx)
	if err != nil || snap.Data()["driverConfirmed"] != true || snap.Data()["driverInvitationStatus"] != "accepted" {
		t.Fatalf("acceptance not persisted: %v %v", snap, err)
	}
	clientItems, err := client.Collection(fs.ColNotifications).Doc(clientUID).Collection("items").Documents(ctx).GetAll()
	if err != nil || len(clientItems) != 2 {
		t.Fatalf("client must receive both driver responses: %d %v", len(clientItems), err)
	}
	for _, item := range clientItems {
		if len(item.Ref.ID) > 64 {
			t.Fatalf("notification collapse id exceeds APNs limit: %q", item.Ref.ID)
		}
	}
	w = call(http.MethodPost, "/"+result.ID+"/cancel", `{}`, clientUID)
	if w.Code != http.StatusOK {
		t.Fatalf("cancel: %d %s", w.Code, w.Body)
	}
	w = call(http.MethodPost, "/"+result.ID+"/confirm", `{"as":"driver"}`, driverUID)
	if w.Code != http.StatusConflict {
		t.Fatalf("confirmed canceled ride: %d %s", w.Code, w.Body)
	}
	created = call(http.MethodPost, "/", string(payload), clientUID)
	if created.Code != http.StatusCreated || json.Unmarshal(created.Body.Bytes(), &result) != nil {
		t.Fatalf("create for code claim: %d %s", created.Code, created.Body)
	}
	w = call(http.MethodPost, "/"+result.ShareCode+"/claim", `{}`, driverUID)
	if w.Code != http.StatusOK {
		t.Fatalf("claim with shared code: %d %s", w.Code, w.Body)
	}
	snap, err = client.Collection(col).Doc(result.ID).Get(ctx)
	if err != nil || snap.Data()["driverId"] != driverUID || snap.Data()["driverConfirmed"] != false {
		t.Fatalf("claim must await confirmation: %v %v", snap, err)
	}
}

func TestCreatedCodesAreUniqueAndServerGenerated(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	codes := make(chan string, 20)
	errs := make(chan error, 20)
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			_, code, err := svc.Create(ctx, "client", map[string]any{
				"scheduledAt": time.Now().Add(time.Hour).UnixMilli(), "shareCode": "123456",
			})
			if err != nil {
				errs <- err
				return
			}
			codes <- code
		}()
	}
	wg.Wait()
	close(codes)
	close(errs)
	for err := range errs {
		t.Fatal(err)
	}
	seen := map[string]bool{}
	for code := range codes {
		if !regexp.MustCompile(`^[A-Z0-9]{6}$`).MatchString(code) || code == "123456" || seen[code] {
			t.Fatalf("invalid or duplicate code %q", code)
		}
		seen[code] = true
	}
	if len(seen) != 20 {
		t.Fatalf("got %d codes", len(seen))
	}
}

func TestCreatePreservesFeaturesAndCleanupReleasesCode(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	id, code, err := svc.Create(ctx, "client", map[string]any{
		"scheduledAt": time.Now().Add(time.Hour).UnixMilli(), "selectedFeatureCodes": []any{"premium", "senior"},
	})
	if err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(col).Doc(id)
	snap, err := ref.Get(ctx)
	if err != nil {
		t.Fatal(err)
	}
	pricing, ok := snap.Data()["pricingSnapshot"].(map[string]any)
	if !ok {
		t.Fatal("pricing snapshot missing")
	}
	features, ok := pricing["featureCodes"].([]any)
	if !ok || len(features) != 2 || features[0] != "premium" || features[1] != "senior" {
		t.Fatalf("features missing: %v", pricing)
	}
	if _, err := ref.Set(ctx, map[string]any{"status": "canceled", "updatedAt": time.Now().Add(-8 * 24 * time.Hour)}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	if n, err := svc.Cleanup(ctx); err != nil || n != 1 {
		t.Fatalf("cleanup: count=%d err=%v", n, err)
	}
	if _, err := client.Collection(fs.ColProgrammedCodes).Doc(code).Get(ctx); err == nil {
		t.Fatal("code reservation not removed")
	}
}

func TestPromotionChecksDriverSession(t *testing.T) {
	dsn := os.Getenv("TEST_PROGRAMMED_DATABASE_URL")
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || dsn == "" {
		t.Skip("requires Firestore emulator and isolated test PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for _, tc := range []struct {
		hasSession bool
		vehicle    string
		liveStatus string
		feature    bool
		grant      bool
		price      int
		areaMatch  bool
		accepted   bool
	}{
		{false, "auto", "online", false, false, 100, true, false},
		{true, "", "online", false, false, 100, true, false},
		{true, "moto", "online", false, false, 100, true, false},
		{true, "auto", "offline", false, false, 100, true, false},
		{true, "auto", "online", false, false, 100, false, false},
		{true, "auto", "online", false, false, 0, true, false},
		{true, "auto", "online", true, false, 100, true, false},
		{true, "auto", "online", true, true, 100, true, true},
		{true, "auto", "online", false, false, 100, true, true},
	} {
		clientUID, driverUID := uuid.NewString(), uuid.NewString()
		if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1,'client'),($2,'driver')`, clientUID, driverUID); err != nil {
			t.Fatal(err)
		}
		var driverID string
		if err := pool.QueryRow(ctx, `INSERT INTO public.drivers (user_id, account_status) VALUES ($1,'active') RETURNING id::text`, driverUID).Scan(&driverID); err != nil {
			t.Fatal(err)
		}
		if tc.vehicle != "" {
			if _, err := pool.Exec(ctx, `INSERT INTO public.vehicles (driver_id, plate, type, is_active) VALUES ($1::uuid, $2, $3, true)`, driverID, uuid.NewString()[:8], tc.vehicle); err != nil {
				t.Fatal(err)
			}
		}
		area := "test-area"
		if !tc.areaMatch {
			area = "other-area"
		}
		if _, err := client.Collection(fs.ColDriversLive).Doc(driverUID).Set(ctx, map[string]any{"status": tc.liveStatus, "serviceAreaId": area}); err != nil {
			t.Fatal(err)
		}
		var featureCode string
		if tc.feature {
			featureCode = "test-" + uuid.NewString()
			var featureID string
			if err := pool.QueryRow(ctx, `INSERT INTO public.features (code, name, eligibility_subject)
				VALUES ($1, 'Test', 'driver') RETURNING id::text`, featureCode).Scan(&featureID); err != nil {
				t.Fatal(err)
			}
			if tc.grant {
				if _, err := pool.Exec(ctx, `INSERT INTO public.driver_feature_assignments (driver_id, feature_id, granted_by)
					VALUES ($1::uuid,$2::uuid,'test')`, driverID, featureID); err != nil {
					t.Fatal(err)
				}
			}
		}
		if tc.hasSession {
			var generation int64
			if _, err := pool.Exec(ctx, `INSERT INTO public.compliance_signals (kind, signal_key) VALUES ('driver',$1) ON CONFLICT DO NOTHING`, driverID); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT generation FROM public.compliance_signals WHERE kind='driver' AND signal_key=$1`, driverID).Scan(&generation); err != nil {
				t.Fatal(err)
			}
			tx, err := pool.Begin(ctx)
			if err != nil {
				t.Fatal(err)
			}
			today, end := compliance.NicaraguaDayWindow(time.Now())
			if _, _, err := compliance.OpenDriverSession(ctx, tx, driverID, today, nil, []string{"rides"}, map[string]int64{"driver:" + driverID: generation}, end); err != nil {
				t.Fatal(err)
			}
			if err := tx.Commit(ctx); err != nil {
				t.Fatal(err)
			}
		}
		ref := client.Collection(col).Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"clientId": clientUID, "driverId": driverUID, "status": "client_confirmed",
			"clientConfirmed": true, "driverConfirmed": true, "scheduledAt": time.Now().Add(-time.Second).UnixMilli(),
			"estimatedPrice": tc.price, "serviceAreaId": "test-area",
			"pricingSnapshot": map[string]any{"featureCodes": []string{featureCode}},
		}); err != nil {
			t.Fatal(err)
		}
		if _, _, err := NewService(pool, client).Process(ctx, t.Name()); err != nil {
			t.Fatal(err)
		}
		var status string
		var assigned *string
		if err := pool.QueryRow(ctx, `SELECT status::text, driver_id FROM public.rides WHERE firebase_ride_id=$1`, ref.ID).Scan(&status, &assigned); err != nil {
			t.Fatal(err)
		}
		if tc.accepted && (status != "accepted" || assigned == nil || *assigned != driverUID) {
			t.Fatalf("eligible driver not assigned: status=%s driver=%v", status, assigned)
		}
		if !tc.accepted && (status != "requested" || assigned != nil) {
			t.Fatalf("ineligible driver assigned: status=%s driver=%v", status, assigned)
		}
		if tc.accepted {
			otherClient := uuid.NewString()
			if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1,'client')`, otherClient); err != nil {
				t.Fatal(err)
			}
			other := client.Collection(col).Doc(uuid.NewString())
			if _, err := other.Set(ctx, map[string]any{
				"clientId": otherClient, "driverId": driverUID, "status": "client_confirmed",
				"clientConfirmed": true, "driverConfirmed": true,
				"scheduledAt":    time.Now().Add(-time.Second).UnixMilli(),
				"estimatedPrice": 100, "serviceAreaId": "test-area",
			}); err != nil {
				t.Fatal(err)
			}
			if _, _, err := NewService(pool, client).Process(ctx, t.Name()); err != nil {
				t.Fatal(err)
			}
			if err := pool.QueryRow(ctx, `SELECT status::text, driver_id FROM public.rides WHERE firebase_ride_id=$1`, other.ID).Scan(&status, &assigned); err != nil {
				t.Fatal(err)
			}
			if status != "requested" || assigned != nil {
				t.Fatalf("driver already on a ride was assigned again: status=%s driver=%v", status, assigned)
			}
		}
	}
}

func TestProgrammedRideCannotCancelAfterPromotion(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-programmed-test")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{"clientId": "client", "status": "promoted"}); err != nil {
		t.Fatal(err)
	}
	if err := NewService(nil, client).Cancel(ctx, "client", ref.ID, ""); err == nil {
		t.Fatal("cancel must reject promoted rides")
	}
}

func TestPromotionAndCancellationAreExclusive(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	for i := 0; i < 10; i++ {
		ref := client.Collection(col).Doc(uuid.NewString())
		if _, err := ref.Set(ctx, map[string]any{
			"clientId": "client", "status": "client_confirmed", "clientConfirmed": true,
			"scheduledAt": time.Now().Add(-time.Second).UnixMilli(),
		}); err != nil {
			t.Fatal(err)
		}
		start := make(chan struct{})
		var wg sync.WaitGroup
		var action string
		var prepareErr, cancelErr error
		wg.Add(2)
		go func() {
			defer wg.Done()
			<-start
			_, action, prepareErr = svc.preparePromotion(ctx, ref)
		}()
		go func() {
			defer wg.Done()
			<-start
			cancelErr = svc.Cancel(ctx, "client", ref.ID, "")
		}()
		close(start)
		wg.Wait()
		if prepareErr != nil {
			t.Fatal(prepareErr)
		}
		snap, err := ref.Get(ctx)
		if err != nil {
			t.Fatal(err)
		}
		d := snap.Data()
		if action == "promote" {
			if cancelErr == nil || d["status"] == "canceled" || d["promotionStarted"] != true {
				t.Fatalf("promotion and cancellation both succeeded: data=%v cancelErr=%v", d, cancelErr)
			}
		} else if cancelErr != nil || d["status"] != "canceled" || d["promotionStarted"] == true {
			t.Fatalf("cancellation did not win: data=%v action=%q cancelErr=%v", d, action, cancelErr)
		}
	}
}

func TestOnlyOneDriverCanClaim(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("requires Firestore emulator and seeded local PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	svc := NewService(pool, client)
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": "local-client", "status": "scheduled",
		"scheduledAt": time.Now().Add(time.Hour).UnixMilli(),
	}); err != nil {
		t.Fatal(err)
	}
	start := make(chan struct{})
	var wg sync.WaitGroup
	errs := make([]error, 2)
	for i, uid := range []string{"local-driver", "local-driver-2"} {
		wg.Add(1)
		go func(i int, uid string) {
			defer wg.Done()
			<-start
			errs[i] = svc.Claim(ctx, uid, ref.ID)
		}(i, uid)
	}
	close(start)
	wg.Wait()
	if (errs[0] == nil) == (errs[1] == nil) {
		t.Fatalf("exactly one driver must claim, got %v", errs)
	}
}

func TestPreparePromotionUsesCurrentConfirmation(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-programmed-test")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": "client", "status": "scheduled", "clientConfirmed": false,
		"scheduledAt": time.Now().Add(time.Minute).UnixMilli(),
	}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(nil, client)
	_, action, err := svc.preparePromotion(ctx, ref)
	if err != nil || action != "" {
		t.Fatalf("unconfirmed future ride must remain available: action=%q err=%v", action, err)
	}
	if err := svc.Confirm(ctx, "client", ref.ID, "client", nil); err != nil {
		t.Fatal(err)
	}
	_, action, err = svc.preparePromotion(ctx, ref)
	if err != nil || action != "" {
		t.Fatalf("confirmed future ride must not be canceled: action=%q err=%v", action, err)
	}
}

func TestInvitationAndDriverSearch(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || os.Getenv("TEST_DATABASE_URL") == "" {
		t.Skip("requires Firestore emulator and seeded local PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-rundi-programmed-test")
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, os.Getenv("TEST_DATABASE_URL"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": "local-client", "status": "scheduled", "clientConfirmed": false,
		"scheduledAt": time.Now().Add(time.Hour).UnixMilli(),
	}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, client)
	var license, name string
	if err := pool.QueryRow(ctx, `SELECT d.license_number, u.name FROM public.drivers d
		JOIN public.users u ON u.id=d.user_id WHERE d.user_id='local-driver'`).Scan(&license, &name); err != nil {
		t.Fatal(err)
	}
	for _, query := range []string{"local-driver", license, name} {
		candidates, err := svc.SearchCandidates(ctx, "local-client", ref.ID, query)
		if err != nil {
			t.Fatalf("search %q: %v", query, err)
		}
		found := false
		for _, c := range candidates {
			found = found || c.DriverID == "local-driver"
		}
		if !found {
			t.Fatalf("search %q did not return local-driver", query)
		}
	}
	if _, err := svc.SearchCandidates(ctx, "another-client", ref.ID, "Conductor"); err == nil {
		t.Fatal("non-owner must not search")
	}
	if err := svc.Assign(ctx, "local-client", ref.ID, "local-driver"); err != nil {
		t.Fatal(err)
	}
	if err := svc.Decline(ctx, "other-driver", ref.ID, nil); err == nil {
		t.Fatal("another driver must not decline")
	}
	if err := svc.Decline(ctx, "local-driver", ref.ID, nil); err != nil {
		t.Fatal(err)
	}
	if err := svc.Assign(ctx, "local-client", ref.ID, "local-driver"); err != nil {
		t.Fatal(err)
	}
	if err := svc.Confirm(ctx, "local-driver", ref.ID, "driver", nil); err != nil {
		t.Fatal(err)
	}
	if err := svc.Decline(ctx, "local-driver", ref.ID, nil); err == nil {
		t.Fatal("confirmed invitation must not be declined")
	}
}

func TestPromotionPersistsRouteAndRecovers(t *testing.T) {
	dsn := os.Getenv("TEST_PROGRAMMED_DATABASE_URL")
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || dsn == "" {
		t.Skip("requires Firestore emulator and isolated test PostgreSQL")
	}
	ctx := context.Background()
	project := "demo-programmed-" + uuid.NewString()[:8]
	client, err := firestore.NewClient(ctx, project)
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	uid := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1, 'client')`, uid); err != nil {
		t.Fatal(err)
	}
	serviceCode := "test-" + uuid.NewString()
	var serviceID string
	if err := pool.QueryRow(ctx, `INSERT INTO public.services (name, code, commission_rate) VALUES ('Test',$1,0)
		RETURNING id::text`, serviceCode).Scan(&serviceID); err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": uid, "status": "client_confirmed", "clientConfirmed": true,
		"scheduledAt": time.Now().Add(-time.Second).UnixMilli(), "estimatedPrice": 100.75,
		"paymentMethod": "card", "estimatedDistance": 2345, "estimatedDuration": 456, "serviceId": serviceID,
		"origin":      map[string]any{"lat": 12.14567, "lng": -86.24731, "address": "Origen"},
		"destination": map[string]any{"lat": 12.15567, "lng": -86.25731, "address": "Destino"},
	}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, client)
	if n, _, err := svc.Process(ctx, t.Name()); err != nil || n != 1 {
		t.Fatalf("promotion: promoted=%d err=%v", n, err)
	}
	var rideID string
	var lat, lng, price float64
	if err := pool.QueryRow(ctx, `SELECT r.id::text, l.latitude, l.longitude, r.estimated_price
		FROM public.rides r JOIN public.ride_locations l ON l.id=r.origin_location_id
		WHERE r.firebase_ride_id=$1`, ref.ID).Scan(&rideID, &lat, &lng, &price); err != nil {
		t.Fatal(err)
	}
	if lat != 12.14567 || lng != -86.24731 || price != 100.75 {
		t.Fatalf("precision lost: lat=%v lng=%v price=%v", lat, lng, price)
	}
	var payment, promotedService, dispatchService string
	var distance, duration int
	if err := pool.QueryRow(ctx, `SELECT payment_type::text, service_id::text, estimated_distance, estimated_duration
		FROM public.rides WHERE id=$1::uuid`, rideID).Scan(&payment, &promotedService, &distance, &duration); err != nil {
		t.Fatal(err)
	}
	if payment != "card_local" || promotedService != serviceID || distance != 2345 || duration != 456 {
		t.Fatalf("ride attributes lost: payment=%s service=%s distance=%d duration=%d", payment, promotedService, distance, duration)
	}
	if err := pool.QueryRow(ctx, `SELECT payload->>'serviceCode' FROM public.outbox_events
		WHERE aggregate_id=$1 AND event_type='ride.requested'`, rideID).Scan(&dispatchService); err != nil || dispatchService != serviceCode {
		t.Fatalf("dispatch service=%q err=%v", dispatchService, err)
	}
	if _, err := ref.Set(ctx, map[string]any{
		"status": "client_confirmed", "promotionStarted": true, "promotionLeaseUntil": int64(0),
	}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	if n, _, err := svc.Process(ctx, t.Name()); err != nil || n != 1 {
		t.Fatalf("recovery: promoted=%d err=%v", n, err)
	}
	var count int
	if err := pool.QueryRow(ctx, `SELECT count(*) FROM public.rides WHERE firebase_ride_id=$1`, ref.ID).Scan(&count); err != nil || count != 1 {
		t.Fatalf("ride count=%d err=%v", count, err)
	}
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["rideId"] != rideID || snap.Data()["status"] != "promoted" {
		t.Fatalf("recovered document=%v err=%v", snap, err)
	}
}

func TestPromotionCancelsWhenClientHasActiveRide(t *testing.T) {
	dsn := os.Getenv("TEST_PROGRAMMED_DATABASE_URL")
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" || dsn == "" {
		t.Skip("requires Firestore emulator and isolated test PostgreSQL")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	uid := uuid.NewString()
	if _, err := pool.Exec(ctx, `INSERT INTO public.users (id, role) VALUES ($1,'client')`, uid); err != nil {
		t.Fatal(err)
	}
	if _, err := pool.Exec(ctx, `INSERT INTO public.rides (client_id, status, estimated_price) VALUES ($1,'requested',100)`, uid); err != nil {
		t.Fatal(err)
	}
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": uid, "status": "client_confirmed", "clientConfirmed": true,
		"scheduledAt": time.Now().Add(-time.Second).UnixMilli(), "estimatedPrice": 100,
	}); err != nil {
		t.Fatal(err)
	}
	svc := NewService(pool, client)
	svc.SetNotifications(notifications.NewCenter(client, nil))
	promoted, canceled, err := svc.Process(ctx, t.Name())
	if err != nil || promoted != 0 || canceled != 1 {
		t.Fatalf("promotion conflict: promoted=%d canceled=%d err=%v", promoted, canceled, err)
	}
	snap, err := ref.Get(ctx)
	if err != nil || snap.Data()["status"] != "canceled" || snap.Data()["cancelReason"] != "client_has_active_ride" {
		t.Fatalf("conflict not reflected in Firestore: %v %v", snap, err)
	}
	items, err := client.Collection(fs.ColNotifications).Doc(uid).Collection("items").Documents(ctx).GetAll()
	if err != nil || len(items) != 1 {
		t.Fatalf("client conflict notification missing: %d %v", len(items), err)
	}
}

func TestStalePromotionCannotCancelNewLease(t *testing.T) {
	if os.Getenv("FIRESTORE_EMULATOR_HOST") == "" {
		t.Skip("requires Firestore emulator")
	}
	ctx := context.Background()
	client, err := firestore.NewClient(ctx, "demo-programmed-"+uuid.NewString()[:8])
	if err != nil {
		t.Fatal(err)
	}
	defer client.Close()
	svc := NewService(nil, client)
	ref := client.Collection(col).Doc(uuid.NewString())
	if _, err := ref.Set(ctx, map[string]any{
		"clientId": "client", "status": "client_confirmed", "clientConfirmed": true,
		"scheduledAt": time.Now().Add(-time.Second).UnixMilli(),
	}); err != nil {
		t.Fatal(err)
	}
	first, action, err := svc.preparePromotion(ctx, ref)
	if err != nil || action != "promote" {
		t.Fatalf("first lease: %q %v", action, err)
	}
	if _, err := ref.Set(ctx, map[string]any{"promotionLeaseUntil": 0}, firestore.MergeAll); err != nil {
		t.Fatal(err)
	}
	second, action, err := svc.preparePromotion(ctx, ref)
	if err != nil || action != "promote" || first["promotionToken"] == second["promotionToken"] {
		t.Fatalf("second lease: %q %v", action, err)
	}
	if canceled, err := svc.cancelPromotionConflict(ctx, ref, str(first["promotionToken"])); err != nil || canceled {
		t.Fatalf("stale lease canceled ride: %v %v", canceled, err)
	}
	if canceled, err := svc.cancelPromotionConflict(ctx, ref, str(second["promotionToken"])); err != nil || !canceled {
		t.Fatalf("current lease did not cancel: %v %v", canceled, err)
	}
}
