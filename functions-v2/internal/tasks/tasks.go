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
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
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
// El task usa nombre por ventana de 30s: varios wakes en la misma ventana
// colapsan en uno solo (AlreadyExists = éxito), acotando las ejecuciones del
// job a ~2/minuto bajo carga y a 0 en reposo.
func (p *Producer) WakeConsumer(ctx context.Context) error {
	req, err := consumerWakeupRequest(p.cfg)
	if err != nil {
		return err
	}
	if _, err := p.client.CreateTask(ctx, req); err != nil {
		if status.Code(err) == codes.AlreadyExists {
			return nil
		}
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
	taskName := fmt.Sprintf("%s/tasks/consumer-wake-%d", queuePath, time.Now().Unix()/30)
	return jobRunRequest(cfg, queuePath, taskName, "rundi-consumer", nil)
}

// jobRunRequest construye el CreateTaskRequest que ejecuta un Cloud Run Job
// via run.googleapis.com jobs:run (OAuth del SA de Tasks, igual que los ticks
// de Cloud Scheduler). scheduleTime nil = inmediato.
func jobRunRequest(cfg *config.Config, queuePath, taskName, job string,
	scheduleTime *timestamppb.Timestamp) (*cloudtaskspb.CreateTaskRequest, error) {
	url := fmt.Sprintf("https://%s-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/%s/jobs/%s:run",
		cfg.Region, cfg.ProjectID, job)
	return &cloudtaskspb.CreateTaskRequest{
		Parent: queuePath,
		Task: &cloudtaskspb.Task{
			Name:         taskName,
			ScheduleTime: scheduleTime,
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

// programmedTaskNames — nombres deterministas por ride: re-creates dedupe; el
// cancel puede borrar los tasks pendientes por nombre.
func (p *Producer) programmedTaskNames(rideID string) (queuePath string, names []string, err error) {
	if p.cfg.ProjectID == "" || p.cfg.Region == "" || p.cfg.CloudTasksQueue == "" {
		return "", nil, fmt.Errorf("programmed promotion: incomplete Cloud Tasks configuration")
	}
	queuePath = fmt.Sprintf("projects/%s/locations/%s/queues/%s",
		p.cfg.ProjectID, p.cfg.Region, p.cfg.CloudTasksQueue)
	return queuePath, []string{
		fmt.Sprintf("%s/tasks/programmed-confirm-%s", queuePath, rideID),
		fmt.Sprintf("%s/tasks/programmed-promo-%s", queuePath, rideID),
	}, nil
}

// ScheduleProgrammedPromotion agenda dos ejecuciones de rundi-programmed por
// viaje, preservando la semántica del barrido v1 sin polling por minuto:
//   - confirm: en scheduledAt-10min — cancela si el cliente no confirmó.
//   - promo:   en scheduledAt — promueve a tiempo (gracia real, no tardía).
//
// Si el enqueue falla, el tick programado cubre ambos efectos.
func (p *Producer) ScheduleProgrammedPromotion(ctx context.Context, rideID string, at time.Time) error {
	queuePath, names, err := p.programmedTaskNames(rideID)
	if err != nil {
		return err
	}
	for i, name := range names {
		when := at
		if i == 0 {
			when = at.Add(-10 * time.Minute)
		}
		req, err := jobRunRequest(p.cfg, queuePath, name, "rundi-programmed", timestamppb.New(when))
		if err != nil {
			return err
		}
		if _, err := p.client.CreateTask(ctx, req); err != nil {
			if status.Code(err) == codes.AlreadyExists {
				continue
			}
			return fmt.Errorf("schedule programmed promotion: %w", err)
		}
	}
	return nil
}

// CancelProgrammedPromotion borra los tasks agendados de un ride cancelado
// (best-effort: si ya corrieron o no existen, Process es no-op sobre docs
// terminales).
func (p *Producer) CancelProgrammedPromotion(ctx context.Context, rideID string) error {
	_, names, err := p.programmedTaskNames(rideID)
	if err != nil {
		return err
	}
	var firstErr error
	for _, name := range names {
		if err := p.client.DeleteTask(ctx, &cloudtaskspb.DeleteTaskRequest{Name: name}); err != nil {
			if status.Code(err) == codes.NotFound {
				continue
			}
			if firstErr == nil {
				firstErr = fmt.Errorf("cancel programmed promotion: %w", err)
			}
		}
	}
	return firstErr
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
