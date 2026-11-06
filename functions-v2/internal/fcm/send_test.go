package fcm

import (
	"bytes"
	"errors"
	"log"
	"strings"
	"testing"

	"firebase.google.com/go/v4/messaging"
)

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
