// Package taskqueue — emulador local compatible con el cliente gRPC de
// Cloud Tasks. No replica IAM ni los márgenes de SLA de Google; preserva la
// semántica necesaria para desarrollo: nombres deduplicados, ScheduleTime,
// borrado, persistencia local y reintentos de entregas fallidas.
package taskqueue

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"

	"cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
	"github.com/google/uuid"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
	"google.golang.org/protobuf/encoding/protojson"
	"google.golang.org/protobuf/proto"
	"google.golang.org/protobuf/types/known/emptypb"
	"google.golang.org/protobuf/types/known/timestamppb"
)

type storedTask struct {
	Task       json.RawMessage `json:"task"`
	NextRun    time.Time       `json:"nextRun"`
	Attempts   int             `json:"attempts"`
	Done       bool            `json:"done"`
	LastStatus int             `json:"lastStatus,omitempty"`
	LastError  string          `json:"lastError,omitempty"`
}

type Options struct {
	StatePath    string
	MaxAttempts  int
	RetryDelay   time.Duration
	Token        string
	HTTPClient   *http.Client
	JobBinaries  map[string]string
	JobEnvs      map[string]map[string]string
	JobTimeout   time.Duration
	TickInterval time.Duration
	PeriodicJobs map[string]time.Duration
	Now          func() time.Time
}

type Server struct {
	cloudtaskspb.UnimplementedCloudTasksServer
	opts Options

	mu       sync.Mutex
	tasks    map[string]*storedTask
	inFlight map[string]bool
	wake     chan struct{}
}

func NewServer(opts Options) (*Server, error) {
	if opts.StatePath == "" {
		return nil, fmt.Errorf("taskqueue: StatePath requerido")
	}
	if opts.MaxAttempts <= 0 {
		opts.MaxAttempts = 5
	}
	if opts.RetryDelay <= 0 {
		opts.RetryDelay = time.Second
	}
	if opts.HTTPClient == nil {
		opts.HTTPClient = &http.Client{Timeout: 30 * time.Second}
	}
	if opts.JobTimeout <= 0 {
		opts.JobTimeout = 10 * time.Minute
	}
	if opts.TickInterval <= 0 {
		opts.TickInterval = 100 * time.Millisecond
	}
	if opts.Now == nil {
		opts.Now = time.Now
	}
	if opts.JobBinaries == nil {
		opts.JobBinaries = map[string]string{
			"rundi-consumer":   "/out/consumer",
			"rundi-scheduler":  "/out/scheduler",
			"rundi-programmed": "/out/scheduler",
		}
	}
	if opts.JobEnvs == nil {
		opts.JobEnvs = map[string]map[string]string{
			"rundi-programmed": {"SCHEDULER_ONLY": "programmed"},
		}
	}

	s := &Server{
		opts:     opts,
		tasks:    map[string]*storedTask{},
		inFlight: map[string]bool{},
		wake:     make(chan struct{}, 1),
	}
	if err := s.load(); err != nil {
		return nil, err
	}
	return s, nil
}

func (s *Server) CreateTask(_ context.Context, req *cloudtaskspb.CreateTaskRequest) (*cloudtaskspb.Task, error) {
	if req.GetParent() == "" || req.GetTask().GetHttpRequest() == nil || req.GetTask().GetHttpRequest().GetUrl() == "" {
		return nil, status.Error(codes.InvalidArgument, "task requires parent and httpRequest.url")
	}
	t := proto.Clone(req.GetTask()).(*cloudtaskspb.Task)
	if t.GetName() == "" {
		t.Name = fmt.Sprintf("%s/tasks/%s", req.GetParent(), uuid.NewString())
	}
	if t.GetCreateTime() == nil {
		t.CreateTime = timestamppb.New(s.opts.Now())
	}
	next := s.opts.Now()
	if st := t.GetScheduleTime(); st != nil && st.AsTime().After(next) {
		next = st.AsTime()
	}

	s.mu.Lock()
	defer s.mu.Unlock()
	if _, exists := s.tasks[t.GetName()]; exists {
		return nil, status.Error(codes.AlreadyExists, "task name already exists")
	}
	raw, err := protojson.Marshal(t)
	if err != nil {
		return nil, status.Errorf(codes.Internal, "marshal task: %v", err)
	}
	s.tasks[t.GetName()] = &storedTask{Task: raw, NextRun: next}
	if err := s.saveLocked(); err != nil {
		delete(s.tasks, t.GetName())
		return nil, status.Errorf(codes.Internal, "persist task: %v", err)
	}
	s.signalLocked()
	return proto.Clone(t).(*cloudtaskspb.Task), nil
}

func (s *Server) GetTask(_ context.Context, req *cloudtaskspb.GetTaskRequest) (*cloudtaskspb.Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.tasks[req.GetName()]
	if !ok {
		return nil, status.Error(codes.NotFound, "task not found")
	}
	return decodeTask(st.Task)
}

func (s *Server) ListTasks(_ context.Context, req *cloudtaskspb.ListTasksRequest) (*cloudtaskspb.ListTasksResponse, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	out := &cloudtaskspb.ListTasksResponse{}
	for name, st := range s.tasks {
		if req.GetParent() == "" || strings.HasPrefix(name, req.GetParent()+"/tasks/") {
			t, err := decodeTask(st.Task)
			if err != nil {
				return nil, status.Errorf(codes.Internal, "decode task: %v", err)
			}
			out.Tasks = append(out.Tasks, t)
		}
	}
	return out, nil
}

func (s *Server) DeleteTask(_ context.Context, req *cloudtaskspb.DeleteTaskRequest) (*emptypb.Empty, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if _, ok := s.tasks[req.GetName()]; !ok {
		return nil, status.Error(codes.NotFound, "task not found")
	}
	delete(s.tasks, req.GetName())
	if err := s.saveLocked(); err != nil {
		return nil, status.Errorf(codes.Internal, "persist delete: %v", err)
	}
	return &emptypb.Empty{}, nil
}

func (s *Server) RunTask(_ context.Context, req *cloudtaskspb.RunTaskRequest) (*cloudtaskspb.Task, error) {
	s.mu.Lock()
	defer s.mu.Unlock()
	st, ok := s.tasks[req.GetName()]
	if !ok {
		return nil, status.Error(codes.NotFound, "task not found")
	}
	st.NextRun = s.opts.Now()
	st.Done = false
	if err := s.saveLocked(); err != nil {
		return nil, status.Errorf(codes.Internal, "persist task: %v", err)
	}
	s.signalLocked()
	return decodeTask(st.Task)
}

func (s *Server) GetQueue(_ context.Context, req *cloudtaskspb.GetQueueRequest) (*cloudtaskspb.Queue, error) {
	return &cloudtaskspb.Queue{Name: req.GetName()}, nil
}

func (s *Server) ListQueues(_ context.Context, req *cloudtaskspb.ListQueuesRequest) (*cloudtaskspb.ListQueuesResponse, error) {
	name := strings.TrimSuffix(req.GetParent(), "/") + "/queues/default"
	return &cloudtaskspb.ListQueuesResponse{Queues: []*cloudtaskspb.Queue{{Name: name}}}, nil
}

// Run sirve el emulador hasta ctx.Done(). PeriodicJobs ejecuta los binarios
// locales en cadencias fijas (equivalente local de Cloud Scheduler).
func (s *Server) Run(ctx context.Context) error {
	for job, every := range s.opts.PeriodicJobs {
		if every <= 0 {
			continue
		}
		job, every := job, every
		go func() {
			ticker := time.NewTicker(every)
			defer ticker.Stop()
			for {
				select {
				case <-ctx.Done():
					return
				case <-ticker.C:
					if err := s.runJob(ctx, job); err != nil {
						slog.Warn("periodic local job failed", "job", job, "err", err)
					}
				}
			}
		}()
	}
	ticker := time.NewTicker(s.opts.TickInterval)
	defer ticker.Stop()
	for {
		s.dispatchDue(ctx)
		select {
		case <-ctx.Done():
			return nil
		case <-s.wake:
		case <-ticker.C:
		}
	}
}

func (s *Server) dispatchDue(parent context.Context) {
	for {
		s.mu.Lock()
		var selected *storedTask
		var selectedName string
		for name, st := range s.tasks {
			if st.Done || s.inFlight[name] || st.NextRun.After(s.opts.Now()) {
				continue
			}
			selected, selectedName = st, name
			break
		}
		if selected == nil {
			s.mu.Unlock()
			return
		}
		s.inFlight[selectedName] = true
		selected.Attempts++
		if err := s.saveLocked(); err != nil {
			slog.Error("persist task attempt", "task", selectedName, "err", err)
		}
		s.mu.Unlock()

		go func(name string) {
			err := s.dispatchOne(parent, name)
			s.mu.Lock()
			defer s.mu.Unlock()
			st := s.tasks[name]
			delete(s.inFlight, name)
			if st == nil {
				return
			}
			if err == nil {
				st.Done = true
				st.LastError = ""
			} else {
				st.LastError = err.Error()
				if st.Attempts >= s.opts.MaxAttempts {
					st.Done = true
				} else {
					st.NextRun = s.opts.Now().Add(s.opts.RetryDelay * time.Duration(st.Attempts))
				}
			}
			if saveErr := s.saveLocked(); saveErr != nil {
				slog.Error("persist task result", "task", name, "err", saveErr)
			}
		}(selectedName)
	}
}

func (s *Server) dispatchOne(ctx context.Context, name string) error {
	s.mu.Lock()
	st := s.tasks[name]
	if st == nil {
		s.mu.Unlock()
		return nil
	}
	t, err := decodeTask(st.Task)
	attempts := st.Attempts
	s.mu.Unlock()
	if err != nil {
		return err
	}
	if job, ok := jobNameFromRunURL(t.GetHttpRequest().GetUrl()); ok {
		return s.runJob(ctx, job)
	}
	return s.deliverHTTP(ctx, t, attempts)
}

func (s *Server) deliverHTTP(ctx context.Context, t *cloudtaskspb.Task, attempts int) error {
	reqPB := t.GetHttpRequest()
	method := http.MethodPost
	switch reqPB.GetHttpMethod() {
	case cloudtaskspb.HttpMethod_GET:
		method = http.MethodGet
	case cloudtaskspb.HttpMethod_PUT:
		method = http.MethodPut
	case cloudtaskspb.HttpMethod_PATCH:
		method = http.MethodPatch
	case cloudtaskspb.HttpMethod_DELETE:
		method = http.MethodDelete
	case cloudtaskspb.HttpMethod_HEAD:
		method = http.MethodHead
	case cloudtaskspb.HttpMethod_OPTIONS:
		method = http.MethodOptions
	}
	req, err := http.NewRequestWithContext(ctx, method, reqPB.GetUrl(), bytes.NewReader(reqPB.GetBody()))
	if err != nil {
		return err
	}
	for k, v := range reqPB.GetHeaders() {
		req.Header.Set(k, v)
	}
	queue := t.GetName()
	if idx := strings.Index(queue, "/tasks/"); idx >= 0 {
		queue = queue[:idx]
	}
	req.Header.Set("X-CloudTasks-TaskName", t.GetName())
	req.Header.Set("X-CloudTasks-QueueName", queue)
	req.Header.Set("X-CloudTasks-TaskExecutionCount", fmt.Sprintf("%d", max(attempts-1, 0)))
	if s.opts.Token != "" {
		req.Header.Set("Authorization", "Bearer "+s.opts.Token)
	}
	res, err := s.opts.HTTPClient.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	_, _ = io.Copy(io.Discard, io.LimitReader(res.Body, 1<<20))
	if res.StatusCode >= 200 && res.StatusCode <= 299 {
		return nil
	}
	return fmt.Errorf("http status %d", res.StatusCode)
}

var runJobPattern = regexp.MustCompile(`/jobs/([^/:]+):run$`)

func jobNameFromRunURL(raw string) (string, bool) {
	u, err := url.Parse(raw)
	if err != nil || !strings.HasSuffix(u.Host, "run.googleapis.com") {
		return "", false
	}
	match := runJobPattern.FindStringSubmatch(u.EscapedPath())
	if len(match) != 2 {
		return "", false
	}
	name, err := url.PathUnescape(match[1])
	return name, err == nil
}

func (s *Server) runJob(ctx context.Context, job string) error {
	bin := s.opts.JobBinaries[job]
	if bin == "" {
		return fmt.Errorf("local job %q is not mapped", job)
	}
	cctx, cancel := context.WithTimeout(ctx, s.opts.JobTimeout)
	defer cancel()
	cmd := exec.CommandContext(cctx, bin)
	cmd.Env = os.Environ()
	for k, v := range s.opts.JobEnvs[job] {
		cmd.Env = append(cmd.Env, k+"="+v)
	}
	out, err := cmd.CombinedOutput()
	if len(out) > 0 {
		slog.Info("local job output", "job", job, "output", string(out))
	}
	if err != nil {
		return fmt.Errorf("job %s: %w", job, err)
	}
	return nil
}

func (s *Server) signalLocked() {
	select {
	case s.wake <- struct{}{}:
	default:
	}
}

func (s *Server) load() error {
	data, err := os.ReadFile(s.opts.StatePath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var items []storedTask
	if err := json.Unmarshal(data, &items); err != nil {
		return fmt.Errorf("taskqueue state: %w", err)
	}
	for _, st := range items {
		st := st
		t, err := decodeTask(st.Task)
		if err != nil || t.GetName() == "" {
			continue
		}
		s.tasks[t.GetName()] = &st
	}
	return nil
}

func (s *Server) saveLocked() error {
	items := make([]storedTask, 0, len(s.tasks))
	for _, st := range s.tasks {
		items = append(items, *st)
	}
	data, err := json.MarshalIndent(items, "", "  ")
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(s.opts.StatePath), 0o755); err != nil {
		return err
	}
	tmp := s.opts.StatePath + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, s.opts.StatePath)
}

func decodeTask(raw json.RawMessage) (*cloudtaskspb.Task, error) {
	var t cloudtaskspb.Task
	if err := protojson.Unmarshal(raw, &t); err != nil {
		return nil, err
	}
	return &t, nil
}

func ListenAndServe(ctx context.Context, addr string, srv *Server) error {
	lis, err := net.Listen("tcp", addr)
	if err != nil {
		return err
	}
	grpcSrv := grpc.NewServer()
	cloudtaskspb.RegisterCloudTasksServer(grpcSrv, srv)
	go func() {
		<-ctx.Done()
		grpcSrv.GracefulStop()
	}()
	return grpcSrv.Serve(lis)
}
