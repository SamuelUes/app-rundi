// Package chats — creación de REALTIME_chats/{chatId} por backend
// (las reglas prohíben create/update del doc: participants sale solo de la
// autoridad SQL). Los mensajes los escriben los participantes por SDK con
// validación de reglas (from==uid, text<=4000, participant in participants).
package chats

import (
	"context"
	"fmt"
	"regexp"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

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

// RideChat — crea/devuelve el chat del viaje. chatId = "ride-{rideId}".
// Solo participantes (client_id/driver_id/follower_driver_id).
func (s *Service) RideChat(ctx context.Context, uid, rideID string) (string, error) {
	rideID, err := s.resolveRideID(ctx, rideID)
	if err != nil {
		return "", err
	}
	var clientID string
	var driverID, followerID *string
	err = s.pool.QueryRow(ctx, `
		SELECT client_id, driver_id, follower_driver_id
		FROM public.rides WHERE id = $1::uuid`, rideID).
		Scan(&clientID, &driverID, &followerID)
	if err != nil {
		if err == pgx.ErrNoRows {
			return "", apperr.New(404, "ride no encontrado")
		}
		return "", err
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
