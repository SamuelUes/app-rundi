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
	if req.Parent != "projects/test-project/locations/us-east1/queues/test-queue" ||
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
