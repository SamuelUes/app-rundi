package compliance

import (
	"context"
	"errors"
	"time"

	"cloud.google.com/go/firestore"
	grpccodes "google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"

	"github.com/rundi/functions-v2/internal/fs"
)

var errIncompleteEvaluation = errors.New("incomplete compliance evaluation")

// DailyDecisionFromEvaluation — convierte una evaluación autorizada en la
// decisión diaria almacenable. Exige generaciones de conductor y reglas
// presentes y vigencia hasta la próxima medianoche de Nicaragua; cualquier
// dato faltante o incoherente produce error y nada se cachea.
func DailyDecisionFromEvaluation(ev *Evaluation, serviceCodes []string) (DailyDecision, error) {
	if ev == nil || !ev.Allowed || ev.DriverID == nil || ev.VehicleID == nil ||
		ev.NicaraguaDay == "" || len(ev.InputGenerations) == 0 {
		return DailyDecision{}, errIncompleteEvaluation
	}
	evaluatedAt, err := time.Parse(time.RFC3339, ev.EvaluatedAt)
	if err != nil {
		return DailyDecision{}, errIncompleteEvaluation
	}
	day, end := NicaraguaDayWindow(evaluatedAt)
	if day != ev.NicaraguaDay {
		return DailyDecision{}, errIncompleteEvaluation
	}
	driverGeneration := ev.InputGenerations["driver:"+*ev.DriverID]
	rulesGeneration := ev.InputGenerations["rules:global"]
	if driverGeneration <= 0 || rulesGeneration <= 0 {
		return DailyDecision{}, errIncompleteEvaluation
	}
	d := DailyDecision{
		Allowed: true, Status: ev.Status, Reasons: ev.Reasons,
		Day: day, EvaluatedAt: evaluatedAt.UTC(), ExpiresAt: end,
		Context: DailyContext{
			DriverID: *ev.DriverID, VehicleID: *ev.VehicleID,
			ServiceCodes:     serviceCodes,
			DriverGeneration: driverGeneration, RulesGeneration: rulesGeneration,
			EngineVersion:    ev.RulesVersion,
			InputGenerations: ev.InputGenerations,
		},
	}
	if !recordableDailyDecision(d) {
		return DailyDecision{}, errIncompleteEvaluation
	}
	return d, nil
}

// DailyStore — persistencia de la decisión diaria en una colección interna de
// Firestore (SYSTEM_driver_daily_compliance); nunca legible por clientes.
type DailyStore struct {
	client *firestore.Client
}

func NewDailyStore(client *firestore.Client) *DailyStore {
	return &DailyStore{client: client}
}

// Save — escribe la decisión solo si es completa y autorizada; una escritura
// incompleta es un error y no deja documento utilizable.
func (s *DailyStore) Save(ctx context.Context, d DailyDecision) error {
	if !recordableDailyDecision(d) {
		return errIncompleteEvaluation
	}
	generations := make(map[string]int64, len(d.Context.InputGenerations))
	for key, generation := range d.Context.InputGenerations {
		generations[key] = generation
	}
	_, err := s.client.Collection(fs.ColDriverDailyCompliance).
		Doc(d.Context.DriverID).Set(ctx, map[string]any{
		"allowed":          d.Allowed,
		"status":           d.Status,
		"reasons":          d.Reasons,
		"day":              d.Day,
		"evaluatedAt":      d.EvaluatedAt,
		"expiresAt":        d.ExpiresAt,
		"driverId":         d.Context.DriverID,
		"vehicleId":        d.Context.VehicleID,
		"serviceCodes":     d.Context.ServiceCodes,
		"driverGeneration": d.Context.DriverGeneration,
		"rulesGeneration":  d.Context.RulesGeneration,
		"engineVersion":    d.Context.EngineVersion,
		"inputGenerations": generations,
	})
	return err
}

// Load — lee la decisión guardada del conductor. found=false cuando no hay
// documento; un documento malformado o incompleto es error, nunca autorización.
func (s *DailyStore) Load(ctx context.Context, driverID string) (d DailyDecision, found bool, err error) {
	snap, err := s.client.Collection(fs.ColDriverDailyCompliance).Doc(driverID).Get(ctx)
	if status.Code(err) == grpccodes.NotFound {
		return DailyDecision{}, false, nil
	}
	if err != nil {
		return DailyDecision{}, false, err
	}
	var doc dailyDecisionDoc
	if err := snap.DataTo(&doc); err != nil {
		return DailyDecision{}, false, err
	}
	d = doc.decision()
	if !recordableDailyDecision(d) {
		return DailyDecision{}, false, errors.New("stored daily compliance decision is incomplete")
	}
	return d, true, nil
}

type dailyDecisionDoc struct {
	Allowed          bool             `firestore:"allowed"`
	Status           string           `firestore:"status"`
	Reasons          []Reason         `firestore:"reasons"`
	Day              string           `firestore:"day"`
	EvaluatedAt      time.Time        `firestore:"evaluatedAt"`
	ExpiresAt        time.Time        `firestore:"expiresAt"`
	DriverID         string           `firestore:"driverId"`
	VehicleID        string           `firestore:"vehicleId"`
	ServiceCodes     []string         `firestore:"serviceCodes"`
	DriverGeneration int64            `firestore:"driverGeneration"`
	RulesGeneration  int64            `firestore:"rulesGeneration"`
	EngineVersion    string           `firestore:"engineVersion"`
	InputGenerations map[string]int64 `firestore:"inputGenerations"`
}

func (doc dailyDecisionDoc) decision() DailyDecision {
	return DailyDecision{
		Allowed: doc.Allowed, Status: doc.Status, Reasons: doc.Reasons,
		Day: doc.Day, EvaluatedAt: doc.EvaluatedAt, ExpiresAt: doc.ExpiresAt,
		Context: DailyContext{
			DriverID: doc.DriverID, VehicleID: doc.VehicleID,
			ServiceCodes:     doc.ServiceCodes,
			DriverGeneration: doc.DriverGeneration,
			RulesGeneration:  doc.RulesGeneration,
			EngineVersion:    doc.EngineVersion,
			InputGenerations: doc.InputGenerations,
		},
	}
}
