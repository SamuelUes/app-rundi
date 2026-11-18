package fs

import (
	"context"
	"fmt"
	"path"
	"strings"
	"time"

	"cloud.google.com/go/firestore"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

func ValidArrivalPhotoPath(uid, objectPath string) bool {
	prefix := "rides-documents/rides-inspection/designated-arrival/" + uid + "/"
	return uid != "" && len(objectPath) <= 500 && strings.HasPrefix(objectPath, prefix) &&
		path.Clean(objectPath) == objectPath && len(objectPath) > len(prefix) &&
		!strings.Contains(strings.TrimPrefix(objectPath, prefix), "/")
}

func FreshArrivalPhoto(data map[string]any, uid string, now time.Time) string {
	objectPath, _ := data["path"].(string)
	takenAt, ok := data["takenAt"].(time.Time)
	if !ok || takenAt.After(now) || now.Sub(takenAt) > 12*time.Hour || !ValidArrivalPhotoPath(uid, objectPath) {
		return ""
	}
	return objectPath
}

// ReadFreshArrivalPhoto returns an empty path if the driver has no reusable photo.
func ReadFreshArrivalPhoto(ctx context.Context, client *firestore.Client, uid string) (string, error) {
	if client == nil || uid == "" {
		return "", nil
	}
	snap, err := client.Collection(ColArrivalPhotos).Doc(uid).Get(ctx)
	if status.Code(err) == codes.NotFound {
		return "", nil
	}
	if err != nil {
		return "", fmt.Errorf("read arrival photo: %w", err)
	}
	return FreshArrivalPhoto(snap.Data(), uid, time.Now()), nil
}
