package main

import (
	"context"
	"log/slog"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// Update only documents that have not changed since the sweep selected them.
func updateScannedDocuments(ctx context.Context, c *firestore.Client, snapshots []*firestore.DocumentSnapshot, updates []firestore.Update) []*firestore.DocumentSnapshot {
	if len(snapshots) == 0 {
		return nil
	}
	type queued struct {
		snapshot *firestore.DocumentSnapshot
		job      *firestore.BulkWriterJob
	}
	writer := c.BulkWriter(ctx)
	jobs := make([]queued, 0, len(snapshots))
	for _, snapshot := range snapshots {
		if snapshot.UpdateTime.IsZero() {
			slog.Warn("sweep update missing version", "doc", snapshot.Ref.Path)
			continue
		}
		job, err := writer.Update(snapshot.Ref, updates, firestore.LastUpdateTime(snapshot.UpdateTime))
		if err != nil {
			slog.Warn("sweep update enqueue", "doc", snapshot.Ref.Path, "err", err)
			continue
		}
		jobs = append(jobs, queued{snapshot: snapshot, job: job})
	}
	writer.End()
	var changed []*firestore.DocumentSnapshot
	for _, pending := range jobs {
		if _, err := pending.job.Results(); err != nil {
			if status.Code(err) != codes.FailedPrecondition && status.Code(err) != codes.NotFound {
				slog.Warn("sweep update", "doc", pending.snapshot.Ref.Path, "err", err)
			}
			continue
		}
		changed = append(changed, pending.snapshot)
	}
	return changed
}
