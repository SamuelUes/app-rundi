// Package crew — conductor designado con colega (doc §7.4, multi-actor).
// Semántica portada de functions/src/helpers/designatedCrewStore.ts:
// capitán = rides.driver_id; seguidor = rides.follower_driver_id;
// pago y comisión solo al capitán. Estado del crew en Firestore REALTIME_*
// (solo backend escribe); hechos del viaje en SQL rides.follower_*.
package crew

import "time"

type FollowerStatus string

const (
	FollowerActive    FollowerStatus = "active"
	FollowerCompleted FollowerStatus = "completed"
	FollowerAbandoned FollowerStatus = "abandoned"
	FollowerCanceled  FollowerStatus = "canceled"
)

type InviteRequest struct {
	CaptainID  string `json:"captainId"`
	FollowerID string `json:"followerId"`
}

type AttachRequest struct {
	RideID string `json:"rideId"`
}

type ReleaseRequest struct {
	RideID string `json:"rideId"`
	Reason string `json:"reason"` // 'completed' | 'canceled' | 'abandoned'
}

type CrewDoc struct {
	CaptainID  string    `firestore:"captainId" json:"captainId"`
	FollowerID string    `firestore:"followerId" json:"followerId"`
	Status     string    `firestore:"status" json:"status"`
	JoinedAt   time.Time `firestore:"joinedAt" json:"joinedAt"`
}
