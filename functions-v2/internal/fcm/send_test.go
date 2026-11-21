package fcm

import (
	"bytes"
	"context"
	"errors"
	"io"
	"log"
	"net/http"
	"strings"
	"testing"

	firebase "firebase.google.com/go/v4"
	"firebase.google.com/go/v4/messaging"
	"google.golang.org/api/option"
)

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func TestSendUsesValidAndroidPriority(t *testing.T) {
	ctx := context.Background()
	requests := make(chan string, 2)
	httpClient := &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		body, err := io.ReadAll(r.Body)
		if err != nil {
			return nil, err
		}
		requests <- string(body)
		return &http.Response{
			StatusCode: http.StatusOK,
			Header:     make(http.Header),
			Body:       io.NopCloser(strings.NewReader(`{"name":"projects/test/messages/1"}`)),
		}, nil
	})}
	app, err := firebase.NewApp(ctx, &firebase.Config{ProjectID: "test"}, option.WithHTTPClient(httpClient))
	if err != nil {
		t.Fatal(err)
	}
	sender, err := NewSender(ctx, app)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := sender.SendToTokens(ctx, []string{"token"}, "title", "body", nil, SendOpts{Silent: true}); err != nil {
		t.Fatalf("visual notification rejected: %v", err)
	}
	if _, err := sender.SendDataOnly(ctx, []string{"token"}, map[string]string{"type": "test"}); err != nil {
		t.Fatalf("data notification rejected: %v", err)
	}
	for range 2 {
		if body := <-requests; !strings.Contains(body, `"priority":"high"`) {
			t.Fatalf("missing valid Android priority: %s", body)
		}
	}
}

func TestProcessResponsesReportsIndividualFailures(t *testing.T) {
	var output bytes.Buffer
	oldWriter := log.Writer()
	log.SetOutput(&output)
	defer log.SetOutput(oldWriter)

	tokens := []string{"secret-token-1", "secret-token-2"}
	response := &messaging.BatchResponse{Responses: []*messaging.SendResponse{
		{Success: true},
		{Error: errors.New("APNs credentials rejected")},
	}}
	if invalid := processResponses(tokens, response); len(invalid) != 0 {
		t.Fatalf("unexpected invalid tokens: %v", invalid)
	}
	if got := output.String(); !strings.Contains(got, "APNs credentials rejected") || strings.Contains(got, "secret-token") {
		t.Fatalf("unexpected diagnostic: %s", got)
	}
}
