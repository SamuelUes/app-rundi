// Package ratings — calificación opcional por rol (AGENTS.md: rated_role =
// captain|follower; submitRating acepta targetRole + finalize).
package ratings

import "time"

type Rating struct {
	ID            string    `json:"id"`
	RideID        string    `json:"rideId"`
	FromUserID    string    `json:"fromUserId"`
	ToUserID      string    `json:"toUserId"`
	Rating        int       `json:"rating"`
	Comment       string    `json:"comment,omitempty"`
	RatedRole     string    `json:"ratedRole"` // driver|captain|follower|client
	Punctuality   *int      `json:"punctuality,omitempty"`
	Cleanliness   *int      `json:"cleanliness,omitempty"`
	Communication *int      `json:"communication,omitempty"`
	Driving       *int      `json:"driving,omitempty"`
	Safety        *int      `json:"safety,omitempty"`
	Friendliness  *int      `json:"friendliness,omitempty"`
	CreatedAt     time.Time `json:"createdAt"`
}

type SubmitRatingRequest struct {
	RideID        string `json:"rideId"`
	ToUserID      string `json:"toUserId"`
	RatedRole     string `json:"ratedRole"`
	Rating        int    `json:"rating"`
	Comment       string `json:"comment,omitempty"`
	Punctuality   *int   `json:"punctuality,omitempty"`
	Cleanliness   *int   `json:"cleanliness,omitempty"`
	Communication *int   `json:"communication,omitempty"`
	Driving       *int   `json:"driving,omitempty"`
	Safety        *int   `json:"safety,omitempty"`
	Friendliness  *int   `json:"friendliness,omitempty"`
	// Finalize — cierra el flujo de calificación del viaje (rating_completed).
	Finalize bool `json:"finalize,omitempty"`
	// Skip — el actor omite la calificación (rating_skipped), sin fila en ratings.
	Skip bool `json:"skip,omitempty"`
}
