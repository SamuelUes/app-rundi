package tasks

import (
	"testing"

	"cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
	"github.com/rundi/functions-v2/internal/config"
)

func TestConsumerWakeupRequest(t *testing.T) {
	cfg := &config.Config{
		ProjectID: "test-project", Region: "us-east1",
		CloudTasksQueue: "test-queue", CloudTasksSAEmail: "tasks@example.test",
	}
	req, err := consumerWakeupRequest(cfg)
	if err != nil {
		t.Fatal(err)
	}
	httpReq := req.Task.GetHttpRequest()
	if req.Task.GetName() != "" || req.Task.GetScheduleTime() != nil ||
		req.Parent != "projects/test-project/locations/us-east1/queues/test-queue" ||
		httpReq.GetUrl() != "https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/test-project/jobs/rundi-consumer:run" ||
		httpReq.GetHttpMethod() != cloudtaskspb.HttpMethod_POST ||
		httpReq.GetOauthToken().GetServiceAccountEmail() != cfg.CloudTasksSAEmail ||
		httpReq.GetOauthToken().GetScope() != "https://www.googleapis.com/auth/cloud-platform" {
		t.Fatalf("unexpected request: %v", req)
	}
}

func TestConsumerWakeupRequiresConfiguration(t *testing.T) {
	if _, err := consumerWakeupRequest(&config.Config{}); err == nil {
		t.Fatal("expected missing configuration error")
	}
}

func TestConsumerCoalescedRequest(t *testing.T) {
	cfg := &config.Config{
		ProjectID: "test-project", Region: "us-east1",
		CloudTasksQueue: "test-queue", CloudTasksSAEmail: "tasks@example.test",
	}
	const win = int64(123456789)
	req, err := consumerCoalescedRequest(cfg, win)
	if err != nil {
		t.Fatal(err)
	}
	httpReq := req.Task.GetHttpRequest()
	wantName := "projects/test-project/locations/us-east1/queues/test-queue/tasks/consumer-wake-123456789"
	// La task se programa para el FIN de la ventana de 15s: todo evento
	// comprometido dentro es reclamado por este barrido.
	wantSchedule := int64((win + 1) * 15)
	if req.Task.GetName() != wantName ||
		req.Task.GetScheduleTime().GetSeconds() != wantSchedule ||
		req.Parent != "projects/test-project/locations/us-east1/queues/test-queue" ||
		httpReq.GetUrl() != "https://us-east1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/test-project/jobs/rundi-consumer:run" ||
		httpReq.GetOauthToken().GetServiceAccountEmail() != cfg.CloudTasksSAEmail {
		t.Fatalf("unexpected request: %v", req)
	}
}
