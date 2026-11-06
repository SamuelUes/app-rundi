// Package apns — envío directo a APNs para pushes VoIP (PushKit/CallKit).
// FCM no entrega pushes VoIP: el token de PushKit solo vive en APNs y exige
// apns-push-type=voip + topic {bundleId}.voip. Sin dependencias nuevas:
// HTTP/2 lo negocia net/http sobre TLS y el provider token es un JWT ES256
// firmado con la p8 (key APNs) configurada por env.
package apns

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"crypto/rand"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

const (
	hostProduction = "https://api.push.apple.com"
	hostSandbox    = "https://api.sandbox.push.apple.com"
	// El provider token de APNs vive 60 min; se renueva a los 50.
	jwtRefreshAfter = 50 * time.Minute
)

type Sender struct {
	teamID string
	keyID  string
	key    *ecdsa.PrivateKey
	host   string
	client *http.Client

	mu    sync.Mutex
	jwt   string
	jwtAt time.Time
}

// NewSenderFromEnv — config por env (mismo patrón que otras integraciones):
//
//	APNS_TEAM_ID      team id de Apple Developer
//	APNS_KEY_ID       id de la APNs Auth Key (.p8)
//	APNS_P8_KEY       contenido PEM de la p8 (acepta \n escapados) — alternativa: APNS_P8_PATH
//	APNS_P8_PATH      ruta al archivo .p8
//	APNS_SANDBOX=1    usa api.sandbox (builds dev/ad-hoc)
//
// Devuelve (nil, nil) si falta config → la feature queda apagada, no fatal.
func NewSenderFromEnv() (*Sender, error) {
	teamID := os.Getenv("APNS_TEAM_ID")
	keyID := os.Getenv("APNS_KEY_ID")
	p8 := os.Getenv("APNS_P8_KEY")
	if p8 == "" {
		if path := os.Getenv("APNS_P8_PATH"); path != "" {
			if raw, err := os.ReadFile(path); err == nil {
				p8 = string(raw)
			}
		}
	}
	p8 = strings.ReplaceAll(p8, `\n`, "\n")
	if teamID == "" || keyID == "" || p8 == "" {
		return nil, nil
	}
	block, _ := pem.Decode([]byte(p8))
	if block == nil {
		return nil, fmt.Errorf("apns: APNS_P8_KEY no es PEM válido")
	}
	key, err := x509.ParsePKCS8PrivateKey(block.Bytes)
	if err != nil {
		return nil, fmt.Errorf("apns: parse p8: %w", err)
	}
	ecKey, ok := key.(*ecdsa.PrivateKey)
	if !ok {
		return nil, fmt.Errorf("apns: la key no es ECDSA")
	}
	host := hostProduction
	if os.Getenv("APNS_SANDBOX") == "1" || os.Getenv("APNS_SANDBOX") == "true" {
		host = hostSandbox
	}
	return &Sender{
		teamID: teamID,
		keyID:  keyID,
		key:    ecKey,
		host:   host,
		client: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

// providerJWT — JWT ES256 {iss: teamID, iat} firmado con la p8 (ES256 exige
// la firma raw R||S de 32B cada una, no DER). Se cachea 50min.
func (s *Sender) providerJWT() (string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.jwt != "" && time.Since(s.jwtAt) < jwtRefreshAfter {
		return s.jwt, nil
	}
	header, _ := json.Marshal(map[string]string{"alg": "ES256", "kid": s.keyID})
	claims, _ := json.Marshal(map[string]any{"iss": s.teamID, "iat": time.Now().Unix()})
	unsigned := base64.RawURLEncoding.EncodeToString(header) + "." +
		base64.RawURLEncoding.EncodeToString(claims)
	sum := sha256.Sum256([]byte(unsigned))
	r, ss, err := ecdsa.Sign(rand.Reader, s.key, sum[:])
	if err != nil {
		return "", fmt.Errorf("apns: sign jwt: %w", err)
	}
	sig := make([]byte, 64)
	r.FillBytes(sig[:32])
	ss.FillBytes(sig[32:])
	s.jwt = unsigned + "." + base64.RawURLEncoding.EncodeToString(sig)
	s.jwtAt = time.Now()
	return s.jwt, nil
}

// SendVoip — push VoIP a un token PushKit. topic = "{bundleId}.voip".
// Devuelve invalid=true cuando el token ya no sirve (BadDeviceToken /
// Unregistered) para que el caller lo purgue igual que los FCM inválidos.
func (s *Sender) SendVoip(ctx context.Context, deviceToken, topic string, payload map[string]any) (invalid bool, err error) {
	body := map[string]any{"aps": map[string]any{"content-available": 1}}
	for k, v := range payload {
		body[k] = v
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return false, err
	}
	jwt, err := s.providerJWT()
	if err != nil {
		return false, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.host+"/3/device/"+deviceToken, bytes.NewReader(raw))
	if err != nil {
		return false, err
	}
	req.Header.Set("authorization", "bearer "+jwt)
	req.Header.Set("apns-topic", topic)
	req.Header.Set("apns-push-type", "voip")
	req.Header.Set("apns-priority", "10")
	req.Header.Set("apns-expiration", fmt.Sprint(time.Now().Add(90*time.Second).Unix()))
	req.Header.Set("content-type", "application/json")

	resp, err := s.client.Do(req)
	if err != nil {
		return false, fmt.Errorf("apns voip: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusOK {
		return false, nil
	}
	respBody, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
	var reason struct {
		Reason string `json:"reason"`
	}
	_ = json.Unmarshal(respBody, &reason)
	switch reason.Reason {
	case "BadDeviceToken", "Unregistered", "DeviceTokenNotForTopic":
		return true, fmt.Errorf("apns voip: %s", reason.Reason)
	}
	return false, fmt.Errorf("apns voip: status %d reason %q", resp.StatusCode, reason.Reason)
}
