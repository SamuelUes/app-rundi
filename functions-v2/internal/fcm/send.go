// Package fcm — envío de push vía Firebase Cloud Messaging (doc §7.5:
// orquestado desde backend/consumidores, idempotente por event_id).
package fcm

import (
	"context"
	"fmt"
	"time"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
)

type Sender struct {
	client *messaging.Client
}

func NewSender(ctx context.Context, app *firebase.App) (*Sender, error) {
	c, err := app.Messaging(ctx)
	if err != nil {
		return nil, err
	}
	return &Sender{client: c}, nil
}

// SendOpts — opciones alineadas a pushNotifications.ts de v1.
type SendOpts struct {
	ChannelID   string        // Android notification channel (rundi-default-v2)
	TTL         time.Duration // expira en dispositivo/proxy (ttl + apns-expiration)
	CollapseKey string        // Android tag + apns-collapse-id (dedupe/update)
}

const DefaultChannel = "rundi-default-v2"
const ActiveRideChannel = "rundi-active-ride-v2"

// SendToTokens multicast notification+data; retorna tokens inválidos para
// depuración. Headers APNS explícitos (apns-push-type=alert obligatorio en iOS
// para pushes con notification; content-available para procesamiento en bg).
func (s *Sender) SendToTokens(ctx context.Context, tokens []string, title, body string, data map[string]string, opts SendOpts) (invalid []string, err error) {
	if len(tokens) == 0 {
		return nil, nil
	}
	channel := opts.ChannelID
	if channel == "" {
		channel = DefaultChannel
	}
	ttl := opts.TTL
	if ttl <= 0 {
		ttl = 120 * time.Second // default v1
	}
	android := &messaging.AndroidConfig{
		Priority: "HIGH",
		TTL:      &ttl,
		Notification: &messaging.AndroidNotification{
			ChannelID: channel,
			Tag:       opts.CollapseKey,
		},
	}
	apnsHeaders := map[string]string{
		"apns-priority":   "10",
		"apns-push-type":  "alert",
		"apns-expiration": fmt.Sprintf("%d", time.Now().Unix()+int64(ttl.Seconds())),
	}
	if opts.CollapseKey != "" {
		apnsHeaders["apns-collapse-id"] = opts.CollapseKey
	}
	resp, err := s.client.SendEachForMulticast(ctx, &messaging.MulticastMessage{
		Tokens:       tokens,
		Notification: &messaging.Notification{Title: title, Body: body},
		Data:         data,
		Android:      android,
		APNS: &messaging.APNSConfig{
			Headers: apnsHeaders,
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{
					Sound:            "default",
					ContentAvailable: true,
				},
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("fcm multicast: %w", err)
	}
	for i, r := range resp.Responses {
		if !r.Success && messaging.IsUnregistered(r.Error) {
			invalid = append(invalid, tokens[i])
		}
	}
	return invalid, nil
}

// SendDataOnly — push silencioso (procesamiento en background). apns-push-type
// = background + content-available; iOS descarta data-only con push-type alert.
func (s *Sender) SendDataOnly(ctx context.Context, tokens []string, data map[string]string) (invalid []string, err error) {
	if len(tokens) == 0 {
		return nil, nil
	}
	resp, err := s.client.SendEachForMulticast(ctx, &messaging.MulticastMessage{
		Tokens: tokens,
		Data:   data,
		Android: &messaging.AndroidConfig{
			Priority: "HIGH",
		},
		APNS: &messaging.APNSConfig{
			Headers: map[string]string{
				"apns-priority":  "5",
				"apns-push-type": "background",
			},
			Payload: &messaging.APNSPayload{
				Aps: &messaging.Aps{ContentAvailable: true},
			},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("fcm multicast: %w", err)
	}
	for i, r := range resp.Responses {
		if !r.Success && messaging.IsUnregistered(r.Error) {
			invalid = append(invalid, tokens[i])
		}
	}
	return invalid, nil
}
