package taskqueue

import (
	"context"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"sync/atomic"
	"testing"
	"time"

	"cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func TestCreateTaskDeduplicatesAndPersists(t *testing.T) {
	statePath := filepath.Join(t.TempDir(), "tasks.json")
	srv, err := NewServer(Options{StatePath: statePath, Token: "local-token"})
	if err != nil {
		t.Fatal(err)
	}
	parent := "projects/demo/locations/local/queues/q"
	req := &cloudtaskspb.CreateTaskRequest{
		Parent: parent,
		Task: &cloudtaskspb.Task{
			Name:         parent + "/tasks/one",
			ScheduleTime: timestamppb.New(time.Now().Add(time.Hour)),
			MessageType: &cloudtaskspb.Task_HttpRequest{HttpRequest: &cloudtaskspb.HttpRequest{
				HttpMethod: cloudtaskspb.HttpMethod_POST,
				Url:        "http://example.test/task",
			}},
		},
	}
	created, err := srv.CreateTask(context.Background(), req)
	if err != nil {
		t.Fatal(err)
	}
	if created.GetScheduleTime().AsTime().Before(time.Now().Add(50 * time.Minute)) {
		t.Fatal("schedule time was not preserved")
	}
	if _, err := srv.CreateTask(context.Background(), req); status.Code(err) != codes.AlreadyExists {
		t.Fatalf("duplicate code = %v", status.Code(err))
	}
	reloaded, err := NewServer(Options{StatePath: statePath})
	if err != nil {
		t.Fatal(err)
	}
	got, err := reloaded.GetTask(context.Background(), &cloudtaskspb.GetTaskRequest{Name: created.GetName()})
	if err != nil || got.GetHttpRequest().GetUrl() != "http://example.test/task" {
		t.Fatalf("reloaded task = %#v err=%v", got, err)
	}
}

func TestDelayedTaskRetriesAndStopsAfterSuccess(t *testing.T) {
	var calls atomic.Int32
	target := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer local-token" ||
			r.Header.Get("X-CloudTasks-TaskName") == "" {
			t.Errorf("missing local task headers")
		}
		if calls.Add(1) == 1 {
			w.WriteHeader(http.StatusInternalServerError)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer target.Close()

	statePath := filepath.Join(t.TempDir(), "tasks.json")
	now := time.Now()
	srv, err := NewServer(Options{
		StatePath: statePath, Token: "local-token",
		MaxAttempts: 3, RetryDelay: 10 * time.Millisecond,
		HTTPClient: target.Client(), TickInterval: time.Millisecond,
	})
	if err != nil {
		t.Fatal(err)
	}
	parent := "projects/demo/locations/local/queues/q"
	_, err = srv.CreateTask(context.Background(), &cloudtaskspb.CreateTaskRequest{
		Parent: parent,
		Task: &cloudtaskspb.Task{
			Name:         parent + "/tasks/retry",
			ScheduleTime: timestamppb.New(now.Add(25 * time.Millisecond)),
			MessageType: &cloudtaskspb.Task_HttpRequest{HttpRequest: &cloudtaskspb.HttpRequest{
				HttpMethod: cloudtaskspb.HttpMethod_POST,
				Url:        target.URL,
				Body:       []byte(`{"ok":true}`),
			}},
		},
	})
	if err != nil {
		t.Fatal(err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	go func() { _ = srv.Run(ctx) }()
	time.Sleep(15 * time.Millisecond)
	if got := calls.Load(); got != 0 {
		t.Fatalf("task delivered before schedule; calls=%d", got)
	}
	deadline := time.Now().Add(2 * time.Second)
	for calls.Load() < 2 && time.Now().Before(deadline) {
		time.Sleep(5 * time.Millisecond)
	}
	if calls.Load() != 2 {
		t.Fatalf("expected 1 failed + 1 retried delivery, got %d", calls.Load())
	}
}
