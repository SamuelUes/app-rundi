// Package calls — llamadas de voz: doc de señalización creado por backend
// con roles resueltos desde SQL (estructura v1 de calls/{callId}), mint de
// token LiveKit y archivo de sesión compartido consumer↔webhook.
package calls

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
)

var (
	callRoomPrefix     = "support-call-"
	rideCallRoomPrefix = "ride-call-"
)

// RoomNameForCall — support-call-{id} | ride-call-{id} (convención v1).
func RoomNameForCall(callID, callType string) string {
	if callType == "ride" {
		return rideCallRoomPrefix + callID
	}
	return callRoomPrefix + callID
}

// CallIDFromRoom — inverso (webhook).
func CallIDFromRoom(room string) string {
	for _, p := range []string{callRoomPrefix, rideCallRoomPrefix} {
		if len(room) > len(p) && room[:len(p)] == p {
			return room[len(p):]
		}
	}
	return ""
}

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

// callDoc — estructura v1 completa (ver database/firebase-only.json §calls).
type callDoc struct {
	CallID      string
	CallType    string // ride | support
	ClientUID   string
	DriverUID   string
	OperatorUID string
	RideID      string
	ComplaintID string
	Direction   string // client_to_driver | driver_to_client | client_to_operator | operator_to_client
	CallerUID   string
	CalleeUID   string
}

// Initiate — POST /v1/calls/initiate. Resuelve roles desde SQL y escribe el
// doc + pending event call_initiated (push al callee) en batch atómico.
func (s *Service) Initiate(ctx context.Context, uid string, in InitiateRequest) (string, error) {
	cd, err := s.resolve(ctx, uid, in)
	if err != nil {
		return "", err
	}
	callID := uuid.NewString()
	cd.CallID = callID
	room := RoomNameForCall(callID, cd.CallType)

	batch := s.fs.Batch()
	callRef := s.fs.Collection(fs.ColCalls).Doc(callID)
	doc := map[string]any{
		"callerUid":      cd.CallerUID,
		"calleeUid":      cd.CalleeUID,
		"callType":       cd.CallType,
		"clientUid":      cd.ClientUID,
		"direction":      cd.Direction,
		"status":         "initiated",
		"acceptDeadline": time.Now().Add(60 * time.Second).UnixMilli(),
		"channel":        room,
		"createdAt":      firestore.ServerTimestamp,
		"updatedAt":      firestore.ServerTimestamp,
	}
	if cd.DriverUID != "" {
		doc["driverUid"] = cd.DriverUID
	}
	if cd.OperatorUID != "" {
		doc["operatorUid"] = cd.OperatorUID
	}
	if cd.RideID != "" {
		doc["rideId"] = cd.RideID
	}
	if cd.ComplaintID != "" {
		doc["complaintId"] = cd.ComplaintID
	}
	batch.Set(callRef, doc)

	// Pending event — el consumer empuja FCM al callee (mismo patrón cliente).
	peRef := s.fs.Collection(fs.ColPendingEvents).Doc("call-init-" + callID)
	batch.Set(peRef, map[string]any{
		"eventType":     "call_initiated",
		"aggregateType": "call",
		"aggregateId":   callID,
		"payload":       map[string]any{"callId": callID, "uid": uid},
		"status":        "pending",
		"source":        "server",
		"createdAt":     firestore.ServerTimestamp,
	})
	if _, err := batch.Commit(ctx); err != nil {
		return "", err
	}
	return callID, nil
}

// resolve — mapea el request a un callDoc con roles desde SQL.
func (s *Service) resolve(ctx context.Context, uid string, in InitiateRequest) (*callDoc, error) {
	switch in.Type {
	case "ride":
		if in.RideID == "" {
			return nil, apperr.New(400, "rideId requerido")
		}
		var clientID string
		var driverID *string
		var status string
		err := s.pool.QueryRow(ctx, `
			SELECT client_id, driver_id, status::text
			FROM public.rides WHERE id = $1::uuid`, in.RideID,
		).Scan(&clientID, &driverID, &status)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(404, "ride not found")
		}
		if err != nil {
			return nil, err
		}
		if driverID == nil || *driverID == "" {
			return nil, apperr.New(409, "ride has no assigned driver")
		}
		cd := &callDoc{
			CallType: "ride", RideID: in.RideID,
			ClientUID: clientID, DriverUID: *driverID,
		}
		switch uid {
		case clientID:
			cd.CallerUID, cd.CalleeUID = clientID, *driverID
			cd.Direction = "client_to_driver"
		case *driverID:
			cd.CallerUID, cd.CalleeUID = *driverID, clientID
			cd.Direction = "driver_to_client"
		default:
			return nil, apperr.ErrForbidden
		}
		return cd, nil

	case "support":
		// Soporte: complaint asignado a operador (support_complaints).
		if in.ComplaintID == "" {
			return nil, apperr.New(400, "complaintId requerido")
		}
		var createdBy, assignedTo *string
		err := s.pool.QueryRow(ctx, `
			SELECT created_by_user_id, assigned_to_user_id
			FROM public.support_complaints WHERE id = $1::uuid AND deleted_at IS NULL`,
			in.ComplaintID).Scan(&createdBy, &assignedTo)
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, apperr.New(404, "complaint not found")
		}
		if err != nil {
			return nil, err
		}
		if assignedTo == nil || *assignedTo == "" || createdBy == nil {
			return nil, apperr.New(409, "complaint has no assigned operator")
		}
		cd := &callDoc{
			CallType: "support", ComplaintID: in.ComplaintID,
			ClientUID: *createdBy, OperatorUID: *assignedTo,
		}
		switch uid {
		case *createdBy:
			cd.CallerUID, cd.CalleeUID = *createdBy, *assignedTo
			cd.Direction = "client_to_operator"
		case *assignedTo:
			cd.CallerUID, cd.CalleeUID = *assignedTo, *createdBy
			cd.Direction = "operator_to_client"
		default:
			return nil, apperr.ErrForbidden
		}
		return cd, nil
	}
	return nil, apperr.New(400, "type debe ser ride|support")
}

// Token — POST /v1/calls/{callId}/token: participante → JWT LiveKit 15min.
func (s *Service) Token(ctx context.Context, uid, callID, apiKey, apiSecret, url string) (*TokenResponse, error) {
	if apiKey == "" || apiSecret == "" {
		return nil, apperr.New(503, "LiveKit no configurado")
	}
	snap, err := s.fs.Collection(fs.ColCalls).Doc(callID).Get(ctx)
	if err != nil || !snap.Exists() {
		return nil, apperr.New(404, "call not found")
	}
	d := snap.Data()
	isParticipant := false
	partType := ""
	for _, k := range []struct{ key, typ string }{
		{"callerUid", "caller"}, {"calleeUid", "callee"},
		{"clientUid", "client"}, {"driverUid", "driver"}, {"operatorUid", "operator"},
	} {
		if v, _ := d[k.key].(string); v == uid {
			isParticipant = true
			if partType == "" || k.typ == "driver" || k.typ == "operator" {
				partType = k.typ
			}
		}
	}
	if !isParticipant {
		return nil, apperr.ErrForbidden
	}
	callType, _ := d["callType"].(string)
	room := RoomNameForCall(callID, callType)
	status, _ := d["status"].(string)
	switch status {
	case "ended", "rejected", "missed":
		return nil, apperr.New(409, "call already finished")
	}
	meta, _ := json.Marshal(map[string]string{"callId": callID, "participantType": partType})
	token, err := mintAccessToken(apiKey, apiSecret, uid, uid, room, string(meta))
	if err != nil {
		return nil, err
	}
	return &TokenResponse{
		Token: token, URL: url, Room: room,
		ExpiresIn: int(tokenTTL.Seconds()), CallID: callID, ParticipantType: partType,
	}, nil
}

// ArchiveCallSession — port de onCallEnded: estado terminal → upsert a
// call_sessions (tabla unificada; call_type = ride|support).
// Idempotente (call_id UNIQUE). Compartido por consumer (pending event)
// y webhook (room_finished).
func ArchiveCallSession(ctx context.Context, pool *pgxpool.Pool, c *firestore.Client, callID string) error {
	snap, err := c.Collection(fs.ColCalls).Doc(callID).Get(ctx)
	if err != nil || !snap.Exists() {
		return fmt.Errorf("call %s no encontrada", callID)
	}
	d := snap.Data()
	status, _ := d["status"].(string)
	switch status {
	case "ended", "rejected", "missed":
	default:
		return fmt.Errorf("call %s status %q no terminal", callID, status)
	}
	callType, _ := d["callType"].(string)
	isRide := callType == "ride"
	clientUID, _ := d["clientUid"].(string)
	driverUID, _ := d["driverUid"].(string)
	operatorUID, _ := d["operatorUid"].(string)
	caller, _ := d["callerUid"].(string)
	callee, _ := d["calleeUid"].(string)
	direction, _ := d["direction"].(string)
	rideID, _ := d["rideId"].(string)
	complaintID, _ := d["complaintId"].(string)
	recording, _ := d["recordingUrl"].(string)

	// Fallbacks para docs antiguos sin campos de rol explícito.
	if clientUID == "" {
		clientUID = caller
		if isRide && driverUID != "" && driverUID == caller {
			clientUID = callee
		}
	}
	if isRide && driverUID == "" {
		driverUID = callee
		if clientUID == callee {
			driverUID = caller
		}
	}
	if !isRide && operatorUID == "" {
		operatorUID = callee
		if clientUID == callee {
			operatorUID = caller
		}
	}

	notes, _ := json.Marshal(map[string]any{
		"livekitRoom": RoomNameForCall(callID, callType),
		"archivedBy":  "fs_consumer",
		"events":      d["events"],
	})
	endedAt := tsOrNow(d["endedAt"])
	connectedAt := tsOrNil(d["connectedAt"])
	createdAt := tsOrNow(d["createdAt"])

	var dir string
	if isRide {
		dir = "client_to_driver"
		if direction == "driver_to_client" || (driverUID == caller && clientUID == callee) {
			dir = "driver_to_client"
		}
		if driverUID == "" {
			return fmt.Errorf("call %s ride sin driver resoluble", callID)
		}
	} else {
		dir = "client_to_operator"
		if direction == "operator_to_client" || (operatorUID != "" && operatorUID == caller) {
			dir = "operator_to_client"
		}
		if operatorUID == "" {
			return fmt.Errorf("call %s support sin operator resoluble", callID)
		}
	}

	_, err = pool.Exec(ctx, `
		INSERT INTO public.call_sessions
			(call_id, call_type, ride_id, complaint_id, operator_uid, client_uid,
			 driver_uid, direction, status, recording_url, signaling_notes,
			 created_at, updated_at, connected_at, ended_at)
		VALUES ($1,$2,NULLIF($3,''),NULLIF($4,''),NULLIF($5,''),$6,
		        NULLIF($7,''),$8,$9,$10,$11,$12,NOW(),$13,$14)
		ON CONFLICT (call_id) DO UPDATE SET
			status=EXCLUDED.status, recording_url=EXCLUDED.recording_url,
			signaling_notes=EXCLUDED.signaling_notes, updated_at=NOW(),
			connected_at=EXCLUDED.connected_at, ended_at=EXCLUDED.ended_at`,
		callID, callType, rideID, complaintID, operatorUID, clientUID,
		driverUID, dir, status, recording, string(notes),
		createdAt, connectedAt, endedAt)
	return err
}

func tsOrNow(v any) time.Time {
	if t := tsOrNil(v); t != nil {
		return *t
	}
	return time.Now()
}
func tsOrNil(v any) *time.Time {
	var ms float64
	switch n := v.(type) {
	case float64:
		ms = n
	case int64:
		ms = float64(n)
	case time.Time:
		return &n
	default:
		return nil
	}
	if ms <= 0 {
		return nil
	}
	t := time.UnixMilli(int64(ms))
	return &t
}
