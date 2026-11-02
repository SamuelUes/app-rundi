package calls

import "encoding/json"

// InitiateRequest — POST /v1/calls/initiate.
type InitiateRequest struct {
	Type        string `json:"type"` // ride | support
	RideID      string `json:"rideId,omitempty"`
	ComplaintID string `json:"complaintId,omitempty"`
}

// TokenResponse — POST /v1/calls/{callId}/token.
type TokenResponse struct {
	Token           string `json:"token"`
	URL             string `json:"url"`
	Room            string `json:"room"`
	ExpiresIn       int    `json:"expiresIn"`
	CallID          string `json:"callId"`
	ParticipantType string `json:"participantType"`
}

var _ = json.Marshal // keep import (metadata marshalling lives in token.go)
