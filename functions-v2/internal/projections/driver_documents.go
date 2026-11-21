package projections

import (
	"context"
	"fmt"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5/pgxpool"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/compliancedocs"
	"github.com/rundi/functions-v2/internal/fs"
)

// projectDriverDocuments reads a consistent SQL snapshot, then fences older
// concurrent projections using the per-driver revision.
func projectDriverDocuments(ctx context.Context, pool *pgxpool.Pool, client *firestore.Client, uid string) (int64, error) {
	var revision int64
	err := pool.QueryRow(ctx, `
		SELECT rev.revision FROM public.driver_document_projection_versions rev
		WHERE rev.user_id = $1`, uid).Scan(&revision)
	if err != nil {
		return -1, fmt.Errorf("load driver documents revision: %w", err)
	}
	data, err := compliancedocs.LoadDriverDocumentData(ctx, pool, uid)
	if err != nil {
		return -1, err
	}
	data["revision"] = revision
	data["updatedAt"] = firestore.ServerTimestamp
	ref := client.Collection(fs.ColDriversLive).Doc(uid).Collection("private").Doc("documents")
	return revision, writeDriverDocuments(ctx, client, ref, revision, data)
}

func writeDriverDocuments(ctx context.Context, client *firestore.Client, ref *firestore.DocumentRef, revision int64, data map[string]any) error {
	return client.RunTransaction(ctx, func(ctx context.Context, tx *firestore.Transaction) error {
		current, err := tx.Get(ref)
		if err != nil && status.Code(err) != codes.NotFound {
			return err
		}
		if err == nil {
			if current.Data()["source"] == "firestore" {
				return nil
			}
			if old, ok := current.Data()["revision"].(int64); ok && old > revision {
				return nil
			}
		}
		return tx.Set(ref, data)
	})
}
