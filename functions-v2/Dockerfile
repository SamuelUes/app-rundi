# Multi-servicio: --build-arg SERVICE=api|consumer|scheduler
FROM golang:1.26 AS build
ARG SERVICE=api
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 go build -ldflags="-s -w" -o /bin/app ./cmd/${SERVICE}

FROM gcr.io/distroless/static-debian12
USER nonroot:nonroot
COPY --from=build /bin/app /app
ENTRYPOINT ["/app"]
