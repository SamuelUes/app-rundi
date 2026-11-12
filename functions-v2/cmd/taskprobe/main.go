// cmd/taskprobe — utilidad de desarrollo local: encola un task HTTP arbitrario
// en el emulador Cloud Tasks del stack Docker (o en Cloud Tasks real si se le
// da un endpoint Google con credenciales — no usar así fuera de local).
//
// Uso dentro del repo (el emulador corre en localhost:8090):
//
//	go run ./cmd/taskprobe -queue local-queue -url http://api:8080/health -method GET
//	go run ./cmd/taskprobe -url http://api:8080/tasks/delayed-ride-status \
//	  -body '{"rideId":"x","expectedStatus":"requested"}' -delay 10s
package main

import (
	"context"
	"flag"
	"fmt"
	"log/slog"
	"os"
	"time"

	cloudtasks "cloud.google.com/go/cloudtasks/apiv2"
	"cloud.google.com/go/cloudtasks/apiv2/cloudtaskspb"
	"google.golang.org/api/option"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/protobuf/types/known/timestamppb"
)

func main() {
	var (
		addr    = flag.String("addr", "127.0.0.1:8090", "emulador gRPC host:port")
		project = flag.String("project", "demo-rundi", "proyecto")
		region  = flag.String("region", "local", "región")
		queue   = flag.String("queue", "local-queue", "cola")
		url     = flag.String("url", "", "URL destino del task (requerido)")
		method  = flag.String("method", "POST", "método HTTP")
		body    = flag.String("body", "{}", "cuerpo JSON del request")
		delay   = flag.Duration("delay", 0, "delay antes de ejecutar")
	)
	flag.Parse()
	if *url == "" {
		slog.Error("-url requerida")
		os.Exit(2)
	}

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	c, err := cloudtasks.NewClient(ctx,
		option.WithEndpoint(*addr),
		option.WithoutAuthentication(),
		option.WithGRPCDialOption(grpc.WithTransportCredentials(insecure.NewCredentials())))
	if err != nil {
		slog.Error("client", "err", err)
		os.Exit(1)
	}
	defer c.Close()

	httpMethod := cloudtaskspb.HttpMethod_POST
	switch *method {
	case "GET":
		httpMethod = cloudtaskspb.HttpMethod_GET
	case "PUT":
		httpMethod = cloudtaskspb.HttpMethod_PUT
	case "PATCH":
		httpMethod = cloudtaskspb.HttpMethod_PATCH
	case "DELETE":
		httpMethod = cloudtaskspb.HttpMethod_DELETE
	}
	task := &cloudtaskspb.Task{
		MessageType: &cloudtaskspb.Task_HttpRequest{
			HttpRequest: &cloudtaskspb.HttpRequest{
				HttpMethod: httpMethod,
				Url:        *url,
				Headers:    map[string]string{"Content-Type": "application/json"},
				Body:       []byte(*body),
			},
		},
	}
	if *delay > 0 {
		task.ScheduleTime = timestamppb.New(time.Now().Add(*delay))
	}
	parent := fmt.Sprintf("projects/%s/locations/%s/queues/%s", *project, *region, *queue)
	created, err := c.CreateTask(ctx, &cloudtaskspb.CreateTaskRequest{Parent: parent, Task: task})
	if err != nil {
		slog.Error("create task", "err", err)
		os.Exit(1)
	}
	fmt.Println(created.GetName())
}
