package clientevents

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

	"cloud.google.com/go/firestore"
	"github.com/go-chi/chi/v5"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
	"github.com/rundi/functions-v2/internal/middleware"
)

type Handler struct {
	fs   *firestore.Client
	pool *pgxpool.Pool
}

func NewHandler(pool *pgxpool.Pool, client *firestore.Client) *Handler {
	return &Handler{fs: client, pool: pool}
}

func (h *Handler) Routes() chi.Router {
	r := chi.NewRouter()
	r.Post("/chat", h.chat)
	r.Post("/call-accept", h.callAccept)
	r.Post("/call-end", h.callEnd)
	r.Post("/arrival-photo", h.arrivalPhoto)
	return r
}

var idPattern = regexp.MustCompile(`^[A-Za-z0-9_-]{1,128}$`)

func validID(id string) bool { return idPattern.MatchString(id) }

func eventID(prefix string, parts ...string) string {
	hash := sha256.Sum256([]byte(strings.Join(parts, "\x00")))
	return prefix + "-" + hex.EncodeToString(hash[:])
}

func validPhotoPath(uid, objectPath string) bool {
	return fs.ValidArrivalPhotoPath(uid, objectPath)
}

func readBody(w http.ResponseWriter, r *http.Request, body any) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16<<10))
	if err := decoder.Decode(body); err != nil {
		apperr.Write(w, apperr.New(http.StatusBadRequest, "invalid body"))
		return false
	}
	return true
}

func requestUID(r *http.Request) string {
	uid, _ := r.Context().Value(middleware.CtxUID).(string)
	return uid
}

func pending(eventType, aggregateType, aggregateID, uid string, payload map[string]any) map[string]any {
	payload["uid"] = uid
	return map[string]any{
		"eventType": eventType, "aggregateType": aggregateType, "aggregateId": aggregateID,
		"payload": payload, "status": "pending", "source": "server", "createdAt": firestore.ServerTimestamp,
	}
}

func exists(s *firestore.DocumentSnapshot, err error) (bool, error) {
	if status.Code(err) == codes.NotFound {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	return s.Exists(), nil
}

func containsUID(value any, uid string) bool {
	members, ok := value.([]any)
	if !ok {
		return false
	}
	for _, member := range members {
		if member == uid {
			return true
		}
	}
	return false
}

func (h *Handler) chat(w http.ResponseWriter, r *http.Request) {
	var body struct {
		ChatID    string `json:"chatId"`
		MessageID string `json:"messageId"`
		Text      string `json:"text"`
	}
	if !readBody(w, r, &body) {
		return
	}
	if !validID(body.ChatID) || !validID(body.MessageID) || strings.TrimSpace(body.Text) == "" || utf8.RuneCountInString(body.Text) > 4000 {
		apperr.Write(w, apperr.New(400, "invalid message"))
		return
	}
	uid := requestUID(r)
	chatRef := h.fs.Collection(fs.ColChats).Doc(body.ChatID)
	messageRef := chatRef.Collection("messages").Doc(body.MessageID)
	eventRef := h.fs.Collection(fs.ColPendingEvents).Doc(eventID("chat", body.ChatID, body.MessageID))
	err := h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		chat, err := tx.Get(chatRef)
		if ok, e := exists(chat, err); e != nil {
			return e
		} else if !ok {
			return apperr.ErrNotFound
		}
		if !containsUID(chat.Data()["participants"], uid) {
			return apperr.ErrForbidden
		}
		message, err := tx.Get(messageRef)
		if ok, e := exists(message, err); e != nil {
			return e
		} else if ok {
			data := message.Data()
			if data["from"] != uid || data["text"] != body.Text {
				return apperr.ErrConflict
			}
			return nil
		}
		if err := tx.Create(messageRef, map[string]any{
			"from": uid, "text": body.Text, "type": "text", "sentAt": firestore.ServerTimestamp,
		}); err != nil {
			return err
		}
		return tx.Create(eventRef, pending("chat_message", "chat", body.ChatID, uid, map[string]any{"chatId": body.ChatID}))
	})
	if err != nil {
		apperr.Write(w, err)
		return
	}
	apperr.JSON(w, http.StatusOK, map[string]string{"messageId": body.MessageID})
}

func (h *Handler) callEnd(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CallID string `json:"callId"`
		Status string `json:"status"`
	}
	if !readBody(w, r, &body) {
		return
	}
	if !validID(body.CallID) || (body.Status != "ended" && body.Status != "rejected" && body.Status != "missed") {
		apperr.Write(w, apperr.New(400, "invalid call"))
		return
	}
	uid := requestUID(r)
	callRef := h.fs.Collection(fs.ColCalls).Doc(body.CallID)
	eventRef := h.fs.Collection(fs.ColPendingEvents).Doc("call-end-" + body.CallID)
	err := h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		call, err := tx.Get(callRef)
		if ok, e := exists(call, err); e != nil {
			return e
		} else if !ok {
			return apperr.ErrNotFound
		}
		data := call.Data()
		if data["callerUid"] != uid && data["calleeUid"] != uid {
			return apperr.ErrForbidden
		}
		event, err := tx.Get(eventRef)
		if ok, e := exists(event, err); e != nil {
			return e
		} else if ok {
			return nil
		}
		current, _ := data["status"].(string)
		if current != "ended" && current != "rejected" && current != "missed" {
			if err := tx.Set(callRef, map[string]any{
				"status": body.Status, "endedAt": firestore.ServerTimestamp, "updatedAt": firestore.ServerTimestamp,
			}, firestore.MergeAll); err != nil {
				return err
			}
		}
		return tx.Create(eventRef, pending("call_ended", "call", body.CallID, uid, map[string]any{"callId": body.CallID}))
	})
	if err != nil {
		apperr.Write(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) callAccept(w http.ResponseWriter, r *http.Request) {
	var body struct {
		CallID string `json:"callId"`
	}
	if !readBody(w, r, &body) {
		return
	}
	if !validID(body.CallID) {
		apperr.Write(w, apperr.New(400, "invalid call"))
		return
	}
	uid := requestUID(r)
	callRef := h.fs.Collection(fs.ColCalls).Doc(body.CallID)
	eventRef := callRef.Collection("events").Doc(uid + "-accepted")
	err := h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		call, err := tx.Get(callRef)
		if ok, e := exists(call, err); e != nil {
			return e
		} else if !ok {
			return apperr.ErrNotFound
		}
		data := call.Data()
		if data["calleeUid"] != uid {
			return apperr.ErrForbidden
		}
		current, _ := data["status"].(string)
		if current == "ended" || current == "rejected" || current == "missed" {
			return apperr.ErrConflict
		}
		event, err := tx.Get(eventRef)
		if ok, e := exists(event, err); e != nil {
			return e
		} else if ok {
			return nil
		}
		if current != "connected" {
			if err := tx.Set(callRef, map[string]any{
				"status": "accepted", "updatedAt": firestore.ServerTimestamp,
			}, firestore.MergeAll); err != nil {
				return err
			}
		}
		return tx.Create(eventRef, map[string]any{
			"from": uid, "type": "accepted", "at": firestore.ServerTimestamp,
		})
	})
	if err != nil {
		apperr.Write(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) arrivalPhoto(w http.ResponseWriter, r *http.Request) {
	var body struct {
		RideID string `json:"rideId"`
		Path   string `json:"path"`
	}
	if !readBody(w, r, &body) {
		return
	}
	uid := requestUID(r)
	if !validPhotoPath(uid, body.Path) || (body.RideID != "" && !validID(body.RideID)) {
		apperr.Write(w, apperr.New(400, "invalid arrival photo"))
		return
	}
	rideID := body.RideID
	if rideID != "" {
		var matched string
		err := h.pool.QueryRow(r.Context(), `
			SELECT id::text FROM public.rides WHERE (id::text=$1 OR firebase_ride_id=$1)
			  AND (driver_id=$2 OR follower_driver_id=$2)`, rideID, uid).Scan(&matched)
		if err != nil {
			if errors.Is(err, pgx.ErrNoRows) {
				apperr.Write(w, apperr.ErrForbidden)
			} else {
				apperr.Write(w, err)
			}
			return
		}
		rideID = matched
	}
	photoRef := h.fs.Collection(fs.ColArrivalPhotos).Doc(uid)
	var eventRef *firestore.DocumentRef
	if rideID != "" {
		eventRef = h.fs.Collection(fs.ColPendingEvents).Doc(eventID("arrival", rideID, uid, body.Path))
	}
	err := h.fs.RunTransaction(r.Context(), func(ctx context.Context, tx *firestore.Transaction) error {
		if eventRef != nil {
			event, err := tx.Get(eventRef)
			if ok, e := exists(event, err); e != nil {
				return e
			} else if ok {
				return nil
			}
		}
		if err := tx.Set(photoRef, map[string]any{"path": body.Path, "takenAt": firestore.ServerTimestamp}); err != nil {
			return err
		}
		if eventRef != nil {
			return tx.Create(eventRef, pending("arrival_photo_uploaded", "ride", rideID, uid, map[string]any{
				"rideId": rideID, "path": body.Path,
			}))
		}
		return nil
	})
	if err != nil {
		apperr.Write(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
