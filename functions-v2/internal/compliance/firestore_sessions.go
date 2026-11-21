package compliance

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	grpccodes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

var privateDocumentFields = map[string]map[string]bool{
	"license":     {"status": true, "licenseNumber": true, "licenseType": true, "categories": true, "issueDate": true, "expiryDate": true},
	"vehicle":     {"id": true, "plate": true, "type": true, "year": true, "brand": true, "model": true, "color": true},
	"circulation": {"status": true, "issuedAt": true, "validUntil": true},
	"insurance":   {"status": true, "policyNumber": true, "insurer": true, "coverageType": true, "insuredPlate": true, "effectiveFrom": true, "effectiveUntil": true},
	"inspection":  {"status": true, "result": true, "validUntil": true},
	"emissions":   {"status": true, "result": true, "validUntil": true},
	"revisado":    {"status": true, "validUntil": true, "stickerYear": true},
	"roadTax":     {"status": true, "taxYear": true, "exempt": true},
}

func validPrivateDocuments(docs map[string]any) bool {
	if docs == nil {
		return false
	}
	encoded, err := json.Marshal(docs)
	if err != nil || len(encoded) > maxHistorySnapshotBytes {
		return false
	}
	for key, value := range docs {
		if key == "deleted" {
			if _, ok := value.(bool); !ok {
				return false
			}
			continue
		}
		fields, allowed := privateDocumentFields[key]
		if !allowed {
			return false
		}
		if value == nil {
			continue
		}
		data, ok := value.(map[string]any)
		if !ok {
			return false
		}
		for field, item := range data {
			if !fields[field] {
				return false
			}
			if item == nil {
				continue
			}
			switch field {
			case "categories":
				var categories []any
				switch list := item.(type) {
				case []any:
					categories = list
				case []string:
					for _, category := range list {
						categories = append(categories, category)
					}
				default:
					return false
				}
				if len(categories) > 32 {
					return false
				}
				for _, category := range categories {
					if s, ok := category.(string); !ok || len(s) > 128 {
						return false
					}
				}
			case "year", "stickerYear", "taxYear":
				switch n := item.(type) {
				case int, int32, int64:
				case float64:
					if n != float64(int64(n)) {
						return false
					}
				default:
					return false
				}
			case "exempt":
				if _, ok := item.(bool); !ok {
					return false
				}
			default:
				if s, ok := item.(string); !ok || len(s) > 256 {
					return false
				}
			}
		}
	}
	if deleted, _ := docs["deleted"].(bool); deleted {
		for key, value := range docs {
			if key != "deleted" && value != nil {
				return false
			}
		}
	}
	return true
}

func validPrivateDocumentDates(docs map[string]any, vehicleID string, now time.Time) bool {
	if deleted, _ := docs["deleted"].(bool); deleted {
		return false
	}
	vehicle, ok := docs["vehicle"].(map[string]any)
	if !ok || vehicle["id"] != vehicleID {
		return false
	}
	today, _ := NicaraguaDayWindow(now)
	check := func(kind, startField, endField string, required bool) bool {
		doc, present := docs[kind].(map[string]any)
		if !present {
			return !required && docs[kind] == nil
		}
		if doc["status"] == "rejected" {
			return false
		}
		parse := func(field string, mandatory bool) (string, bool) {
			if field == "" {
				return "", true
			}
			value, ok := doc[field].(string)
			if !ok || value == "" {
				return "", !mandatory && doc[field] == nil
			}
			date, err := time.Parse("2006-01-02", value)
			return value, err == nil && date.Format("2006-01-02") == value
		}
		start, startOK := parse(startField, false)
		end, endOK := parse(endField, true)
		return startOK && endOK && end >= today && (start == "" || (start <= today && start <= end))
	}
	return check("license", "issueDate", "expiryDate", true) &&
		check("insurance", "effectiveFrom", "effectiveUntil", true) &&
		check("inspection", "", "validUntil", false) &&
		check("emissions", "", "validUntil", false) &&
		check("revisado", "", "validUntil", false)
}

// FirestoreAvailabilityInputs must be produced by a trusted backend after
// evaluating all current facts. The legacy SQL projection is not such a source.
type FirestoreAvailabilityInputs struct {
	DriverUID     string    `firestore:"driverUid"`
	DriverID      string    `firestore:"driverId"`
	VehicleID     string    `firestore:"vehicleId"`
	Allowed       bool      `firestore:"allowed"`
	Revision      int64     `firestore:"revision"`
	PolicyVersion int64     `firestore:"policyVersion"`
	EngineVersion string    `firestore:"engineVersion"`
	Day           string    `firestore:"day"`
	ExpiresAt     time.Time `firestore:"expiresAt"`
	ServiceCodes  []string  `firestore:"serviceCodes"`
}

type FirestoreDriverSession struct {
	SessionID     string    `firestore:"sessionId"`
	Sequence      int64     `firestore:"sequence"`
	DriverUID     string    `firestore:"driverUid"`
	DriverID      string    `firestore:"driverId"`
	VehicleID     string    `firestore:"vehicleId"`
	Active        bool      `firestore:"active"`
	InputsVersion int64     `firestore:"inputsVersion"`
	PolicyVersion int64     `firestore:"policyVersion"`
	Day           string    `firestore:"day"`
	ExpiresAt     time.Time `firestore:"expiresAt"`
	ServiceCodes  []string  `firestore:"serviceCodes"`
}

type firestoreCompliancePolicy struct {
	Version       int64  `firestore:"version"`
	EngineVersion string `firestore:"engineVersion"`
}

func readLiveSession(tx *firestore.Transaction, ref *firestore.DocumentRef) (*firestore.DocumentSnapshot, error) {
	snap, err := tx.Get(ref)
	if status.Code(err) == grpccodes.NotFound {
		return nil, nil
	}
	return snap, err
}

func writeLiveSession(tx *firestore.Transaction, ref *firestore.DocumentRef, snap *firestore.DocumentSnapshot,
	session FirestoreDriverSession, oldSessionID string, active, forceOnline bool) error {
	data := map[string]any{}
	if snap != nil && snap.Exists() {
		data = snap.Data()
	}
	if !active && (data["availabilitySource"] != "firestore" || data["sessionId"] != oldSessionID) {
		return nil
	}
	update := map[string]any{
		"availabilitySource": "firestore", "sessionSeq": session.Sequence,
		"updatedAt": firestore.ServerTimestamp,
	}
	currentStatus, _ := data["status"].(string)
	if active {
		if forceOnline || (currentStatus != "on_ride" && currentStatus != "busy") {
			update["status"] = "online"
		}
		update["sessionId"] = session.SessionID
		update["sessionExpiresAt"] = session.ExpiresAt.UTC().Format(time.RFC3339Nano)
		update["activeServiceCodes"] = session.ServiceCodes
		update["offlineAt"] = nil
	} else {
		if currentStatus != "on_ride" && currentStatus != "busy" {
			update["status"] = "offline"
			update["offlineAt"] = firestore.ServerTimestamp
		}
		update["sessionId"] = nil
		update["sessionExpiresAt"] = nil
		update["activeServiceCodes"] = nil
	}
	return tx.Set(ref, update, firestore.MergeAll)
}

// ReplaceFirestoreAvailabilityInputs atomically replaces a trusted evaluation,
// closes any previous session and records both transitions. Wired through
// SyncFirestoreInputs (document/service mutations post-commit and the
// driver.fs_inputs_stale consumer event).
func ReplaceFirestoreAvailabilityInputs(ctx context.Context, client *firestore.Client, uid string,
	expectedRevision int64, next FirestoreAvailabilityInputs, documents, historySnapshot map[string]any) error {
	if client == nil || !validFirestoreUID(uid) || expectedRevision < 0 ||
		next.DriverUID != uid || next.DriverID == "" || next.Revision != expectedRevision+1 ||
		next.Revision <= 0 || !validPrivateDocuments(documents) || historySnapshot == nil {
		return errors.New("invalid Firestore availability inputs")
	}
	if deleted, _ := documents["deleted"].(bool); deleted && next.Allowed {
		return errors.New("deleted driver cannot be eligible")
	}
	inputRef := client.Collection(fs.ColDriverAvailabilityInputs).Doc(uid)
	policyRef := client.Collection(fs.ColCompliancePolicy).Doc("active")
	sessionRef := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("availability")
	documentsRef := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("documents")
	liveRef := client.Collection(fs.ColDriversLive).Doc(uid)
	expiryRef := client.Collection(fs.ColDriverAvailabilityExpiry).Doc(uid)
	return client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		old, err := tx.Get(inputRef)
		if err != nil && status.Code(err) != grpccodes.NotFound {
			return err
		}
		policySnap, err := tx.Get(policyRef)
		if err != nil && status.Code(err) != grpccodes.NotFound {
			return err
		}
		sessionSnap, err := tx.Get(sessionRef)
		if err != nil && status.Code(err) != grpccodes.NotFound {
			return err
		}
		var current FirestoreAvailabilityInputs
		if old != nil && old.Exists() {
			if old.DataTo(&current) != nil || current.DriverUID != uid || current.Revision <= 0 {
				return ErrSessionSignalsStale
			}
		}
		if current.Revision != expectedRevision {
			return ErrSessionSignalsStale
		}
		if next.Allowed {
			var policy firestoreCompliancePolicy
			if policySnap == nil || !policySnap.Exists() || policySnap.DataTo(&policy) != nil ||
				!validFirestoreInputs(next, policy, uid, time.Now()) {
				return ErrReactivationRequired
			}
		}
		var session FirestoreDriverSession
		if sessionSnap != nil && sessionSnap.Exists() {
			if sessionSnap.DataTo(&session) != nil || session.DriverUID != uid || session.Sequence <= 0 ||
				(session.Active && session.SessionID == "") {
				return ErrSessionSignalsStale
			}
		}
		var liveSnap *firestore.DocumentSnapshot
		if session.Active {
			liveSnap, err = readLiveSession(tx, liveRef)
			if err != nil {
				return err
			}
		}
		if err := tx.Set(inputRef, next); err != nil {
			return err
		}
		visible := make(map[string]any, len(documents)+3)
		for key, value := range documents {
			visible[key] = value
		}
		visible["source"], visible["revision"], visible["updatedAt"] = "firestore", next.Revision, firestore.ServerTimestamp
		if err := tx.Set(documentsRef, visible); err != nil {
			return err
		}
		if err := QueueComplianceHistory(tx, client, uid, "documents_changed", next.Revision, historySnapshot); err != nil {
			return err
		}
		if session.Active {
			session.Sequence++
			if session.Sequence <= 0 {
				return ErrSessionSignalsStale
			}
			oldID := session.SessionID
			session.Active = false
			session.SessionID = ""
			if err := tx.Set(sessionRef, session); err != nil {
				return err
			}
			if err := writeLiveSession(tx, liveRef, liveSnap, session, oldID, false, false); err != nil {
				return err
			}
			if err := tx.Delete(expiryRef); err != nil {
				return err
			}
			return QueueComplianceHistory(tx, client, uid, "session_deactivated", session.Sequence, map[string]any{
				"sessionId": oldID, "driverId": session.DriverID, "reason": "inputs_changed",
				"inputsVersion": session.InputsVersion,
			})
		}
		return nil
	})
}

func validFirestoreUID(uid string) bool {
	return uid != "" && len(uid) <= 128 && !strings.Contains(uid, "/")
}

func validFirestoreInputs(in FirestoreAvailabilityInputs, policy firestoreCompliancePolicy, uid string, now time.Time) bool {
	day, dayEnd := NicaraguaDayWindow(now)
	if in.DriverUID != uid || in.DriverID == "" || in.VehicleID == "" || !in.Allowed ||
		in.Revision <= 0 || policy.Version <= 0 || in.PolicyVersion != policy.Version ||
		in.EngineVersion != RulesVersion || policy.EngineVersion != RulesVersion ||
		in.Day != day || !in.ExpiresAt.After(now) || in.ExpiresAt.After(dayEnd) || len(in.ServiceCodes) == 0 {
		return false
	}
	seen := make(map[string]bool, len(in.ServiceCodes))
	for _, code := range in.ServiceCodes {
		if code == "" || seen[code] {
			return false
		}
		seen[code] = true
	}
	return true
}

// ActivateFirestoreSession is the production activation gate: the session is
// born in Firestore and mirrored into driver_sessions as a '_fs' row, so SQL
// ride commits stay fenced by CheckDriverSession (FOR SHARE) while signal
// mutations revoke the mirror eagerly via fs_availability_invalidate.
func ActivateFirestoreSession(ctx context.Context, client *firestore.Client, uid string, forceOnline bool) (FirestoreDriverSession, error) {
	var result FirestoreDriverSession
	if client == nil || !validFirestoreUID(uid) {
		return result, errors.New("invalid Firestore session request")
	}
	inputRef := client.Collection(fs.ColDriverAvailabilityInputs).Doc(uid)
	policyRef := client.Collection(fs.ColCompliancePolicy).Doc("active")
	sessionRef := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("availability")
	liveRef := client.Collection(fs.ColDriversLive).Doc(uid)
	expiryRef := client.Collection(fs.ColDriverAvailabilityExpiry).Doc(uid)
	err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		result = FirestoreDriverSession{}
		inputSnap, err := tx.Get(inputRef)
		if status.Code(err) == grpccodes.NotFound {
			return ErrReactivationRequired
		}
		if err != nil {
			return err
		}
		policySnap, err := tx.Get(policyRef)
		if status.Code(err) == grpccodes.NotFound {
			return ErrReactivationRequired
		}
		if err != nil {
			return err
		}
		sessionSnap, err := tx.Get(sessionRef)
		if err != nil && status.Code(err) != grpccodes.NotFound {
			return err
		}
		var inputs FirestoreAvailabilityInputs
		var policy firestoreCompliancePolicy
		if inputSnap.DataTo(&inputs) != nil || policySnap.DataTo(&policy) != nil ||
			!validFirestoreInputs(inputs, policy, uid, time.Now()) {
			return ErrReactivationRequired
		}
		var previous FirestoreDriverSession
		if sessionSnap != nil && sessionSnap.Exists() {
			if err := sessionSnap.DataTo(&previous); err != nil || previous.Sequence < 0 {
				return ErrReactivationRequired
			}
		}
		liveSnap, err := readLiveSession(tx, liveRef)
		if err != nil {
			return err
		}
		result = FirestoreDriverSession{
			SessionID: uuid.NewString(), Sequence: previous.Sequence + 1,
			DriverUID: uid, DriverID: inputs.DriverID, VehicleID: inputs.VehicleID, Active: true,
			InputsVersion: inputs.Revision, PolicyVersion: inputs.PolicyVersion,
			Day: inputs.Day, ExpiresAt: inputs.ExpiresAt, ServiceCodes: inputs.ServiceCodes,
		}
		if result.Sequence <= 0 {
			return ErrReactivationRequired
		}
		if err := tx.Set(sessionRef, result); err != nil {
			return err
		}
		if err := writeLiveSession(tx, liveRef, liveSnap, result, "", true, forceOnline); err != nil {
			return err
		}
		if err := tx.Set(expiryRef, map[string]any{
			"driverUid": uid, "sequence": result.Sequence, "expiresAt": result.ExpiresAt,
		}); err != nil {
			return err
		}
		return QueueComplianceHistory(tx, client, uid, "session_activated", result.Sequence, map[string]any{
			"sessionId": result.SessionID, "driverId": result.DriverID, "vehicleId": result.VehicleID,
			"inputsVersion": result.InputsVersion, "policyVersion": result.PolicyVersion,
			"expiresAt": result.ExpiresAt, "serviceCodes": result.ServiceCodes,
		})
	})
	return result, err
}

// DeactivateFirestoreSession closes a staged session and enqueues its history
// atomically. Repeated calls on a closed or missing session are no-ops.
func DeactivateFirestoreSession(ctx context.Context, client *firestore.Client, uid string) error {
	if client == nil || !validFirestoreUID(uid) {
		return errors.New("invalid Firestore session request")
	}
	ref := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("availability")
	liveRef := client.Collection(fs.ColDriversLive).Doc(uid)
	expiryRef := client.Collection(fs.ColDriverAvailabilityExpiry).Doc(uid)
	return client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		snap, err := tx.Get(ref)
		if status.Code(err) == grpccodes.NotFound {
			return nil
		}
		if err != nil {
			return err
		}
		var session FirestoreDriverSession
		if err := snap.DataTo(&session); err != nil || session.DriverUID != uid || session.Sequence <= 0 ||
			(session.Active && session.SessionID == "") {
			return ErrReactivationRequired
		}
		if !session.Active {
			return nil
		}
		liveSnap, err := readLiveSession(tx, liveRef)
		if err != nil {
			return err
		}
		session.Sequence++
		if session.Sequence <= 0 {
			return ErrReactivationRequired
		}
		oldID := session.SessionID
		session.Active = false
		session.SessionID = ""
		if err := tx.Set(ref, session); err != nil {
			return err
		}
		if err := writeLiveSession(tx, liveRef, liveSnap, session, oldID, false, false); err != nil {
			return err
		}
		if err := tx.Delete(expiryRef); err != nil {
			return err
		}
		return QueueComplianceHistory(tx, client, uid, "session_deactivated", session.Sequence, map[string]any{
			"sessionId": oldID, "driverId": session.DriverID, "inputsVersion": session.InputsVersion,
		})
	})
}

// CheckFirestoreSession reads the session and its input and policy revisions
// in one Firestore transaction. A SQL ride commit additionally needs the
// cross-store fence; this check alone cannot serialize against that commit.
func CheckFirestoreSession(ctx context.Context, client *firestore.Client, uid string) (FirestoreDriverSession, error) {
	var result FirestoreDriverSession
	if client == nil || !validFirestoreUID(uid) {
		return result, ErrReactivationRequired
	}
	inputRef := client.Collection(fs.ColDriverAvailabilityInputs).Doc(uid)
	policyRef := client.Collection(fs.ColCompliancePolicy).Doc("active")
	sessionRef := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("availability")
	err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		result = FirestoreDriverSession{}
		inputSnap, err := tx.Get(inputRef)
		if status.Code(err) == grpccodes.NotFound {
			return ErrReactivationRequired
		}
		if err != nil {
			return err
		}
		policySnap, err := tx.Get(policyRef)
		if status.Code(err) == grpccodes.NotFound {
			return ErrReactivationRequired
		}
		if err != nil {
			return err
		}
		sessionSnap, err := tx.Get(sessionRef)
		if status.Code(err) == grpccodes.NotFound {
			return ErrReactivationRequired
		}
		if err != nil {
			return err
		}
		var in FirestoreAvailabilityInputs
		var policy firestoreCompliancePolicy
		var session FirestoreDriverSession
		now := time.Now()
		if inputSnap.DataTo(&in) != nil || policySnap.DataTo(&policy) != nil ||
			sessionSnap.DataTo(&session) != nil || !validFirestoreInputs(in, policy, uid, now) ||
			!session.Active || session.SessionID == "" || session.Sequence <= 0 ||
			session.DriverUID != uid || session.DriverID != in.DriverID || session.VehicleID != in.VehicleID ||
			session.InputsVersion != in.Revision || session.PolicyVersion != policy.Version ||
			session.Day != in.Day || !session.ExpiresAt.After(now) || session.ExpiresAt.After(in.ExpiresAt) ||
			!sameServiceCodes(session.ServiceCodes, in.ServiceCodes) {
			return ErrReactivationRequired
		}
		result = session
		return nil
	})
	return result, err
}

// ExpireFirestoreSession closes only the session observed by a sweeper. A
// concurrent reactivation with a newer sequence cannot be revoked by it.
func ExpireFirestoreSession(ctx context.Context, client *firestore.Client, uid string, expectedSequence int64) (bool, error) {
	if client == nil || !validFirestoreUID(uid) || expectedSequence <= 0 {
		return false, errors.New("invalid Firestore session expiry request")
	}
	ref := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("availability")
	liveRef := client.Collection(fs.ColDriversLive).Doc(uid)
	expiryRef := client.Collection(fs.ColDriverAvailabilityExpiry).Doc(uid)
	expired := false
	err := client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		expired = false
		expirySnap, err := tx.Get(expiryRef)
		if status.Code(err) == grpccodes.NotFound {
			return nil
		}
		if err != nil {
			return err
		}
		seq, _ := expirySnap.Data()["sequence"].(int64)
		if seq != expectedSequence {
			return nil
		}
		snap, err := tx.Get(ref)
		if status.Code(err) == grpccodes.NotFound {
			return tx.Delete(expiryRef)
		}
		if err != nil {
			return err
		}
		var session FirestoreDriverSession
		if snap.DataTo(&session) != nil || session.DriverUID != uid || session.Sequence <= 0 ||
			(session.Active && session.SessionID == "") {
			return ErrReactivationRequired
		}
		if !session.Active {
			return tx.Delete(expiryRef)
		}
		if session.Sequence != expectedSequence || session.ExpiresAt.IsZero() {
			return ErrSessionSignalsStale
		}
		if session.ExpiresAt.After(time.Now()) {
			return nil
		}
		liveSnap, err := readLiveSession(tx, liveRef)
		if err != nil {
			return err
		}
		session.Sequence++
		if session.Sequence <= 0 {
			return ErrReactivationRequired
		}
		oldID := session.SessionID
		session.Active = false
		session.SessionID = ""
		if err := tx.Set(ref, session); err != nil {
			return err
		}
		if err := writeLiveSession(tx, liveRef, liveSnap, session, oldID, false, false); err != nil {
			return err
		}
		if err := tx.Delete(expiryRef); err != nil {
			return err
		}
		if err := QueueComplianceHistory(tx, client, uid, "session_deactivated", session.Sequence, map[string]any{
			"sessionId": oldID, "driverId": session.DriverID, "reason": "session_expired",
			"inputsVersion": session.InputsVersion,
		}); err != nil {
			return err
		}
		expired = true
		return nil
	})
	return expired, err
}
