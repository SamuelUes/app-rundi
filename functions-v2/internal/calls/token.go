package calls

import (
	"crypto/sha256"
	"crypto/subtle"
	"encoding/hex"
	"encoding/json"
	"errors"
	"time"

	jwt "github.com/golang-jwt/jwt/v4"
)

// Token LiveKit — JWT HS256 con claim "video" (grant). Equivalente al
// AccessToken del SDK: iss=apiKey, sub=identity, exp/iat/nbf, name, metadata.
// Solo grant mic (llamadas de voz) como en v1.

const tokenTTL = 15 * time.Minute // TOKEN_TTL_SECONDS de v1

type videoGrant struct {
	RoomJoin          bool     `json:"roomJoin"`
	Room              string   `json:"room"`
	CanPublish        bool     `json:"canPublish"`
	CanSubscribe      bool     `json:"canSubscribe"`
	CanPublishData    bool     `json:"canPublishData"`
	CanPublishSources []string `json:"canPublishSources,omitempty"`
}

type accessClaims struct {
	jwt.RegisteredClaims
	Name     string     `json:"name,omitempty"`
	Metadata string     `json:"metadata,omitempty"`
	Video    videoGrant `json:"video"`
}

// mintAccessToken — emite el JWT que la app usa para unirse al room.
func mintAccessToken(apiKey, apiSecret, uid, name, room, metadata string) (string, error) {
	now := time.Now()
	meta, _ := json.Marshal(map[string]string{"callId": room, "participantType": "participant"})
	if metadata == "" {
		metadata = string(meta)
	}
	claims := accessClaims{
		RegisteredClaims: jwt.RegisteredClaims{
			Issuer:    apiKey,
			Subject:   uid,
			ExpiresAt: jwt.NewNumericDate(now.Add(tokenTTL)),
			NotBefore: jwt.NewNumericDate(now.Add(-10 * time.Second)),
			IssuedAt:  jwt.NewNumericDate(now),
		},
		Name:     name,
		Metadata: metadata,
		Video: videoGrant{
			RoomJoin:          true,
			Room:              room,
			CanPublish:        true,
			CanSubscribe:      true,
			CanPublishData:    true,
			CanPublishSources: []string{"microphone"},
		},
	}
	return jwt.NewWithClaims(jwt.SigningMethodHS256, claims).SignedString([]byte(apiSecret))
}

// webhookEvent — subconjunto del payload del webhook de LiveKit que v1 usa.
type webhookEvent struct {
	Event string `json:"event"`
	Room  *struct {
		Name            string `json:"name"`
		NumParticipants int32  `json:"numParticipants"`
	} `json:"room"`
	EgressInfo *struct {
		FileResults []struct {
			Location string `json:"location"`
			Filename string `json:"filename"`
		} `json:"fileResults"`
	} `json:"egressInfo"`
}

// verifyWebhook — el Authorization del webhook es un JWT firmado con
// api_secret cuyo claim "sha256" es el hex-SHA256 del body crudo
// (protocolo documentado de WebhookReceiver).
func verifyWebhook(apiKey, apiSecret, authHeader, rawBody string) (*webhookEvent, error) {
	if authHeader == "" {
		return nil, errors.New("missing authorization")
	}
	type whClaims struct {
		jwt.RegisteredClaims
		SHA256 string `json:"sha256"`
	}
	var claims whClaims
	_, err := jwt.ParseWithClaims(authHeader, &claims, func(t *jwt.Token) (any, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, errors.New("unexpected signing method")
		}
		return []byte(apiSecret), nil
	})
	if err != nil {
		return nil, err
	}
	sum := sha256.Sum256([]byte(rawBody))
	if subtle.ConstantTimeCompare([]byte(hex.EncodeToString(sum[:])), []byte(claims.SHA256)) != 1 {
		return nil, errors.New("sha256 mismatch")
	}
	var ev webhookEvent
	if err := json.Unmarshal([]byte(rawBody), &ev); err != nil {
		return nil, err
	}
	return &ev, nil
}
