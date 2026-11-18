// Package chats — creación de REALTIME_chats/{chatId} por backend
// (las reglas prohíben create/update del doc: participants sale solo de la
// autoridad SQL). Los mensajes los escriben los participantes por SDK con
// validación de reglas (from==uid, text<=4000, participant in participants).
package chats

import (
	"context"
	"crypto/sha256"
	"fmt"
	"regexp"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
)

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

var uuidRe = regexp.MustCompile(`^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$`)

// resolveRideID — el rideId del request puede ser rides.id (uuid SQL) o
// firebase_ride_id (doc vivo REALTIME_trips_live); normaliza al uuid SQL.
func (s *Service) resolveRideID(ctx context.Context, rideID string) (string, error) {
	if uuidRe.MatchString(rideID) {
		return rideID, nil
	}
	var id string
	err := s.pool.QueryRow(ctx,
		`SELECT id::text FROM public.rides WHERE firebase_ride_id = $1`, rideID).Scan(&id)
	if err == pgx.ErrNoRows {
		return "", apperr.New(404, "ride no encontrado")
	}
	return id, err
}

// RideChat autoriza participantes asignados u ofertas activas. Cada oferta
// tiene un chat privado para evitar compartir mensajes entre conductores.
func (s *Service) RideChat(ctx context.Context, uid, rideID, otherUserID string) (string, error) {
	rideID, err := s.resolveRideID(ctx, rideID)
	if err != nil {
		return "", err
	}
	var clientID, rideStatus string
	var driverID, followerID *string
	err = s.pool.QueryRow(ctx, `
		SELECT client_id, driver_id, follower_driver_id, status::text
		FROM public.rides WHERE id = $1::uuid`, rideID).
		Scan(&clientID, &driverID, &followerID, &rideStatus)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", apperr.New(404, "ride no encontrado")
		}
		return "", err
	}
	if driverID != nil && uid == clientID && otherUserID != "" &&
		otherUserID != *driverID && (followerID == nil || otherUserID != *followerID) {
		return "", apperr.New(403, "el destinatario no participa en el viaje")
	}
	// Pending offers have private client/driver conversations; never put
	// competing drivers into the same ride chat.
	candidate := ""
	if driverID != nil && ((uid == clientID && (otherUserID == "" || otherUserID == *driverID)) ||
		(uid == *driverID && (otherUserID == "" || otherUserID == clientID))) {
		candidate = *driverID
	} else if driverID == nil && (rideStatus == "requested" || rideStatus == "driver_offered") {
		if uid == clientID {
			candidate = otherUserID
		} else if otherUserID == "" || otherUserID == clientID {
			candidate = uid
		}
		if uid == clientID && candidate == clientID {
			return "", apperr.New(403, "destinatario inválido")
		}
		if candidate != "" && candidate != clientID {
			var offered bool
			err = s.pool.QueryRow(ctx, `
				SELECT EXISTS (
					SELECT 1 FROM public.ride_offers
					WHERE ride_id = $1::uuid AND driver_id = $2 AND status = 'sent'
					  AND (kind = 'counter_offer' OR expires_at > NOW())
				)`, rideID, candidate).Scan(&offered)
			if err != nil {
				return "", err
			}
			if !offered {
				return "", apperr.New(403, "no tienes una oferta activa para este viaje")
			}
		}
	}
	if candidate != "" && candidate != clientID {
		hash := sha256.Sum256([]byte(candidate))
		pairID := fmt.Sprintf("offer-%s-%x", rideID, hash[:])
		ref := s.fs.Collection(fs.ColChats).Doc(pairID)
		if driverID == nil {
			_, err = ref.Set(ctx, map[string]any{
				"participants": []string{clientID, candidate},
				"rideId":       rideID, "type": "ride",
			}, firestore.MergeAll)
			return pairID, err
		}
		// Continue an existing offer conversation after assignment; otherwise
		// retain the original ride chat and its history.
		_, err = ref.Get(ctx)
		if err == nil {
			return pairID, nil
		}
		if status.Code(err) != codes.NotFound {
			return "", err
		}
	}
	participants := []string{clientID}
	in := uid == clientID
	for _, d := range []*string{driverID, followerID} {
		if d != nil && *d != "" {
			participants = append(participants, *d)
			if *d == uid {
				in = true
			}
		}
	}
	if !in {
		return "", apperr.New(403, "no eres participante del viaje")
	}
	chatID := fmt.Sprintf("ride-%s", rideID)
	_, err = s.fs.Collection(fs.ColChats).Doc(chatID).Set(ctx, map[string]any{
		"participants": participants,
		"rideId":       rideID,
		"type":         "ride",
	}, firestore.MergeAll)
	return chatID, err
}
