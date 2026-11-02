// Package tasks — productor Cloud Tasks + handlers de targets diferidos
// (doc §2.1: Tasks transporta/agenda; no es el event store).
package tasks

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	cloudtasks "cloud.google.com/go/cloudtasks/apiv2"
	"cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
	"google.golang.org/protobuf/types/known/timestamppb"

	"github.com/rundi/functions-v2/internal/config"
)

// Producer encola HTTP tasks hacia los handlers del propio servicio API.
type Producer struct {
	client *cloudtasks.Client
	cfg    *config.Config
}

func NewProducer(ctx context.Context, cfg *config.Config) (*Producer, error) {
	c, err := cloudtasks.NewClient(ctx)
	if err != nil {
		return nil, err
	}
	return &Producer{client: c, cfg: cfg}, nil
}

func (p *Producer) Close() error { return p.client.Close() }

// WakeConsumer requests a Cloud Run Job execution. The SQL outbox remains the
// durable queue; if creating this wake-up fails, the scheduled sweep recovers it.
func (p *Producer) WakeConsumer(ctx context.Context) error {
	req, err := consumerWakeupRequest(p.cfg)
	if err != nil {
		return err
	}
	if _, err := p.client.CreateTask(ctx, req); err != nil {
		return fmt.Errorf("enqueue consumer wake-up: %w", err)
	}
	return nil
}

func consumerWakeupRequest(cfg *config.Config) (*cloudtaskspb.CreateTaskRequest, error) {
	if cfg.ProjectID == "" || cfg.Region == "" || cfg.CloudTasksQueue == "" || cfg.CloudTasksSAEmail == "" {
		return nil, fmt.Errorf("consumer wake-up: incomplete Cloud Tasks configuration")
	}
	queuePath := fmt.Sprintf("projects/%s/locations/%s/queues/%s",
		cfg.ProjectID, cfg.Region, cfg.CloudTasksQueue)
	url := fmt.Sprintf("https://%s-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/%s/jobs/rundi-consumer:run",
		cfg.Region, cfg.ProjectID)
	return &cloudtaskspb.CreateTaskRequest{
		Parent: queuePath,
		Task: &cloudtaskspb.Task{
			MessageType: &cloudtaskspb.Task_HttpRequest{
				HttpRequest: &cloudtaskspb.HttpRequest{
					HttpMethod: cloudtaskspb.HttpMethod_POST,
					Url:        url,
					Headers:    map[string]string{"Content-Type": "application/json"},
					Body:       []byte("{}"),
					AuthorizationHeader: &cloudtaskspb.HttpRequest_OauthToken{
						OauthToken: &cloudtaskspb.OAuthToken{
							ServiceAccountEmail: cfg.CloudTasksSAEmail,
							Scope:               "https://www.googleapis.com/auth/cloud-platform",
						},
					},
				},
			},
		},
	}, nil
}

// Enqueue agenda un POST JSON a {APIBaseURL}{path} tras `delay`.
// La tarea firma con OIDC del SA de Tasks (CLOUD_TASKS_SA_EMAIL).
func (p *Producer) Enqueue(ctx context.Context, path string, payload any, delay time.Duration) (string, error) {
	body, err := json.Marshal(payload)
	if err != nil {
		return "", err
	}
	queuePath := fmt.Sprintf("projects/%s/locations/%s/queues/%s",
		p.cfg.ProjectID, p.cfg.Region, p.cfg.CloudTasksQueue)

	task := &cloudtaskspb.Task{
		MessageType: &cloudtaskspb.Task_HttpRequest{
			HttpRequest: &cloudtaskspb.HttpRequest{
				HttpMethod: cloudtaskspb.HttpMethod_POST,
				Url:        p.cfg.APIBaseURL + path,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       body,
				AuthorizationHeader: &cloudtaskspb.HttpRequest_OidcToken{
					OidcToken: &cloudtaskspb.OidcToken{
						ServiceAccountEmail: p.cfg.CloudTasksSAEmail,
						// aud fijo = CLOUD_TASKS_AUDIENCE (verificado por el target);
						// vacío → Cloud Tasks usa la URL del request.
						Audience: p.cfg.CloudTasksAudience,
					},
				},
			},
		},
	}
	if delay > 0 {
		task.ScheduleTime = timestamppb.New(time.Now().Add(delay))
	}
	created, err := p.client.CreateTask(ctx, &cloudtaskspb.CreateTaskRequest{
		Parent: queuePath,
		Task:   task,
	})
	if err != nil {
		return "", fmt.Errorf("create task: %w", err)
	}
	return created.GetName(), nil
}
