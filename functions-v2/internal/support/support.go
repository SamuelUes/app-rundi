// Package support — support_complaints (quejas de soporte) + chat del caso.
// Port de api/support_complaints.ts: create con dedupe open/in_progress,
// joinSupportChat validando participantes del caso, update solo staff,
// soft-delete por visibility='only_platform'/deleted_at.
package support

import (
	"context"
	"errors"
	"fmt"
	"time"

	"cloud.google.com/go/firestore"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/rundi/functions-v2/internal/apperr"
	"github.com/rundi/functions-v2/internal/fs"
)

type Service struct {
	pool *pgxpool.Pool
	fs   *firestore.Client
}

func NewService(pool *pgxpool.Pool, fsClient *firestore.Client) *Service {
	return &Service{pool: pool, fs: fsClient}
}

type Complaint struct {
	ID              string     `json:"id"`
	RideID          *string    `json:"rideId,omitempty"`
	ClientID        *string    `json:"clientId,omitempty"`
	DriverID        *string    `json:"driverId,omitempty"`
	CreatedBy       string     `json:"createdByUserId"`
	CreatedByRole   string     `json:"createdByRole"`
	AssignedTo      *string    `json:"assignedToUserId,omitempty"`
	Category        string     `json:"category"`
	Status          string     `json:"status"`
	Priority        *string    `json:"priority,omitempty"`
	Title           string     `json:"title"`
	Description     *string    `json:"description,omitempty"`
	ResolutionNotes *string    `json:"resolutionNotes,omitempty"`
	ChatLogURL      *string    `json:"chatLogUrl,omitempty"`
	ResolvedAt      *time.Time `json:"resolvedAt,omitempty"`
	CreatedAt       time.Time  `json:"createdAt"`
	UpdatedAt       time.Time  `json:"updatedAt"`
}

const complaintCols = `id::text, ride_id::text, client_id, driver_id,
	created_by_user_id, created_by_role, assigned_to_user_id, category,
	status::text, priority, title, description, resolution_notes,
	chat_log_url, resolved_at, created_at, updated_at`

func scanComplaint(row pgx.Row) (*Complaint, error) {
	var c Complaint
	var rideID *string
	err := row.Scan(&c.ID, &rideID, &c.ClientID, &c.DriverID, &c.CreatedBy,
		&c.CreatedByRole, &c.AssignedTo, &c.Category, &c.Status, &c.Priority,
		&c.Title, &c.Description, &c.ResolutionNotes, &c.ChatLogURL,
		&c.ResolvedAt, &c.CreatedAt, &c.UpdatedAt)
	c.RideID = rideID
	return &c, err
}

type CreateRequest struct {
	Title       string  `json:"title"`
	Category    string  `json:"category"`
	Priority    string  `json:"priority,omitempty"`
	Description string  `json:"description,omitempty"`
	RideID      *string `json:"rideId,omitempty"`
}

// CreateComplaint — dedupe: mismo user + ride + open/in_progress → devuelve
// la existente (misma semántica v1).
func (s *Service) CreateComplaint(ctx context.Context, uid, role string, in CreateRequest) (*Complaint, error) {
	if in.Title == "" {
		return nil, apperr.New(400, "título requerido")
	}
	if in.Category == "" {
		in.Category = "service"
	}
	switch role {
	case "client", "driver", "operator", "admin":
	default:
		role = "client"
	}
	var clientID, driverID *string
	if role == "client" {
		clientID = &uid
	} else if role == "driver" {
		driverID = &uid
	}
	if in.RideID != nil {
		row := s.pool.QueryRow(ctx, `
			SELECT `+complaintCols+` FROM public.support_complaints
			WHERE created_by_user_id = $1 AND ride_id = $2::uuid
			  AND status IN ('open', 'in_progress') AND deleted_at IS NULL
			ORDER BY created_at DESC LIMIT 1`, uid, *in.RideID)
		if existing, err := scanComplaint(row); err == nil {
			return existing, nil
		}
	}
	var prio, desc *string
	if in.Priority != "" {
		prio = &in.Priority
	}
	if in.Description != "" {
		desc = &in.Description
	}
	row := s.pool.QueryRow(ctx, `
		INSERT INTO public.support_complaints
			(ride_id, client_id, driver_id, created_by_user_id, created_by_role,
			 category, status, priority, title, description)
		VALUES ($1::uuid, $2, $3, $4, $5, $6, 'open', $7, $8, $9)
		RETURNING `+complaintCols,
		in.RideID, clientID, driverID, uid, role,
		in.Category, prio, in.Title, desc)
	return scanComplaint(row)
}

// ListComplaints — los míos (creador/cliente/driver/asignado); staff ve todas.
func (s *Service) ListComplaints(ctx context.Context, uid, role, status string, limit int) ([]Complaint, error) {
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	staff := role == "admin" || role == "operator"
	q := `SELECT ` + complaintCols + ` FROM public.support_complaints WHERE deleted_at IS NULL`
	args := []any{}
	if !staff {
		args = append(args, uid)
		q += fmt.Sprintf(` AND (created_by_user_id = $%d OR client_id = $%d
			OR driver_id = $%d OR assigned_to_user_id = $%d)`, len(args), len(args), len(args), len(args))
	}
	if status != "" {
		args = append(args, status)
		q += fmt.Sprintf(` AND status = $%d`, len(args))
	}
	args = append(args, limit)
	q += fmt.Sprintf(` ORDER BY created_at DESC LIMIT $%d`, len(args))

	rows, err := s.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []Complaint
	for rows.Next() {
		c, err := scanComplaint(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *c)
	}
	return out, rows.Err()
}

type UpdateRequest struct {
	Status           string  `json:"status,omitempty"`
	Priority         string  `json:"priority,omitempty"`
	AssignedToUserID *string `json:"assignedToUserId,omitempty"`
	ResolutionNotes  *string `json:"resolutionNotes,omitempty"`
}

// UpdateComplaint — solo staff (operator/admin); resolved→resolved_at;
// asignación registra operator_actions (auditoría v1).
func (s *Service) UpdateComplaint(ctx context.Context, id, actorUID, actorRole string, in UpdateRequest) (*Complaint, error) {
	if actorRole != "operator" && actorRole != "admin" {
		return nil, apperr.ErrForbidden
	}
	sets := []string{}
	args := []any{id}
	if in.Status != "" {
		switch in.Status {
		case "open", "in_progress", "resolved", "rejected":
			args = append(args, in.Status)
			sets = append(sets, fmt.Sprintf("status = $%d", len(args)))
			if in.Status == "resolved" {
				sets = append(sets, "resolved_at = NOW()")
			}
		default:
			return nil, apperr.New(400, "status inválido")
		}
	}
	if in.Priority != "" {
		args = append(args, in.Priority)
		sets = append(sets, fmt.Sprintf("priority = $%d", len(args)))
	}
	if in.AssignedToUserID != nil {
		args = append(args, *in.AssignedToUserID)
		sets = append(sets, fmt.Sprintf("assigned_to_user_id = NULLIF($%d, '')", len(args)))
	}
	if in.ResolutionNotes != nil {
		args = append(args, *in.ResolutionNotes)
		sets = append(sets, fmt.Sprintf("resolution_notes = NULLIF($%d, '')", len(args)))
	}
	if len(sets) == 0 {
		return nil, apperr.New(400, "nada que actualizar")
	}
	q := `UPDATE public.support_complaints SET ` + join(sets, ", ") + `
		WHERE id = $1::uuid AND deleted_at IS NULL RETURNING ` + complaintCols
	row := s.pool.QueryRow(ctx, q, args...)
	c, err := scanComplaint(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, apperr.New(404, "complaint not found")
	}
	if err != nil {
		return nil, err
	}
	// Auditoría de asignación/cambio (operator_actions de v1).
	_, _ = s.pool.Exec(ctx, `
		INSERT INTO public.operator_actions (user_id, user_role, action_type, target_type, target_id, metadata)
		VALUES ($1, $2, 'complaint_update', 'complaint', $3, $4)`,
		actorUID, actorRole, id, fmt.Sprintf(`{"fields":%q}`, join(sets, ",")))
	// Si se asignó operador → puede entrar al chat del caso.
	if in.AssignedToUserID != nil && *in.AssignedToUserID != "" {
		_ = s.joinChatInternal(ctx, id, *in.AssignedToUserID)
	}
	return c, nil
}

// DeleteComplaint — soft delete: participante o staff → visibility='only_platform';
// admin además marca deleted_at (v1: solo oculta en app).
func (s *Service) DeleteComplaint(ctx context.Context, id, uid, role string) error {
	staff := role == "admin" || role == "operator"
	tag, err := s.pool.Exec(ctx, `
		UPDATE public.support_complaints
		SET visibility = 'only_platform',
		    deleted_at = CASE WHEN $3 THEN NOW() ELSE deleted_at END
		WHERE id = $1::uuid AND deleted_at IS NULL
		  AND ($3 OR created_by_user_id = $2 OR client_id = $2
		       OR driver_id = $2 OR assigned_to_user_id = $2)`,
		id, uid, staff)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return apperr.ErrForbidden
	}
	return nil
}

// JoinChat — valida participante del caso y crea/mergea el doc
// REALTIME_chats/support-{complaintId} con TODOS los participantes.
func (s *Service) JoinChat(ctx context.Context, complaintID, uid string) (string, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT created_by_user_id, client_id, driver_id, assigned_to_user_id
		FROM public.support_complaints WHERE id = $1::uuid AND deleted_at IS NULL`,
		complaintID)
	var createdBy string
	var clientID, driverID, assignedTo *string
	if err := row.Scan(&createdBy, &clientID, &driverID, &assignedTo); err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", apperr.New(404, "complaint not found")
		}
		return "", err
	}
	parts := []string{createdBy}
	for _, p := range []*string{clientID, driverID, assignedTo} {
		if p != nil && *p != "" && *p != createdBy {
			parts = append(parts, *p)
		}
	}
	in := false
	for _, p := range parts {
		if p == uid {
			in = true
			break
		}
	}
	if !in {
		return "", apperr.ErrForbidden
	}
	chatID := "support-" + complaintID
	_, err := s.fs.Collection(fs.ColChats).Doc(chatID).Set(ctx, map[string]any{
		"participants": parts,
		"complaintId":  complaintID,
		"type":         "support",
	}, firestore.MergeAll)
	return chatID, err
}

// joinChatInternal — asignación admin: añade al operador a participants.
func (s *Service) joinChatInternal(ctx context.Context, complaintID, operatorUID string) error {
	chatID := "support-" + complaintID
	_, err := s.fs.Collection(fs.ColChats).Doc(chatID).Set(ctx, map[string]any{
		"participants": firestore.ArrayUnion(operatorUID),
		"complaintId":  complaintID,
		"type":         "support",
	}, firestore.MergeAll)
	return err
}

func join(xs []string, sep string) string {
	out := ""
	for i, x := range xs {
		if i > 0 {
			out += sep
		}
		out += x
	}
	return out
}
