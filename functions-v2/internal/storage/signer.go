// Package storage — signed URLs de Cloud Storage para documentos privados.
// En Cloud Run no hay clave privada local: se firma vía IAM signBlob del SA
// (requiere roles/iam.serviceAccountTokenCreator sobre el propio SA).
// Local con ADC JSON (clave privada) firma directo.
package storage

import (
	"context"
	"encoding/base64"
	"fmt"
	"time"

	"cloud.google.com/go/compute/metadata"
	gstorage "cloud.google.com/go/storage"
	"google.golang.org/api/iamcredentials/v1"
	"google.golang.org/api/option"
)

type Signer struct {
	bucket  string
	saEmail string // "" → firma con clave privada del ADC
	sign    func([]byte) ([]byte, error)
}

// NewSigner — bucket = FIREBASE_STORAGE_BUCKET (docs privados en el mismo
// bucket del proyecto). saEmail opcional: si vacío se intenta metadata server.
func NewSigner(ctx context.Context, bucket, saEmail string) (*Signer, error) {
	if bucket == "" {
		return nil, fmt.Errorf("storage: bucket requerido (FIREBASE_STORAGE_BUCKET)")
	}
	s := &Signer{bucket: bucket}
	if saEmail == "" && metadata.OnGCE() {
		saEmail, _ = metadata.EmailWithContext(ctx, "default")
	}
	if saEmail != "" {
		iamSvc, err := iamcredentials.NewService(ctx, option.WithScopes(iamcredentials.CloudPlatformScope))
		if err != nil {
			return nil, fmt.Errorf("storage: iamcredentials: %w", err)
		}
		s.saEmail = saEmail
		s.sign = func(payload []byte) ([]byte, error) {
			resp, err := iamSvc.Projects.ServiceAccounts.SignBlob(
				"projects/-/serviceAccounts/"+saEmail,
				&iamcredentials.SignBlobRequest{
					Payload: base64.StdEncoding.EncodeToString(payload),
				},
			).Context(ctx).Do()
			if err != nil {
				return nil, err
			}
			return base64.StdEncoding.DecodeString(resp.SignedBlob)
		}
	}
	return s, nil
}

// SignURL — URL firmada V4 de lectura (TTL típico 15 min).
func (s *Signer) SignURL(objectPath string, ttl time.Duration) (string, error) {
	if objectPath == "" {
		return "", nil
	}
	opts := &gstorage.SignedURLOptions{
		Scheme:  gstorage.SigningSchemeV4,
		Method:  "GET",
		Expires: time.Now().Add(ttl),
	}
	if s.sign != nil {
		opts.GoogleAccessID = s.saEmail
		opts.SignBytes = s.sign
	}
	return gstorage.SignedURL(s.bucket, objectPath, opts)
}
