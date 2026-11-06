package compliance

import (
	"context"
	"errors"
	"fmt"
	"strings"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgconn"
)

var errMissingComplianceSignal = errors.New("missing compliance signal")

type signalKey struct{ kind, key string }

// signalMapKey — formato "kind:key" usado en DailyContext.InputGenerations.
func (k signalKey) signalMapKey() string { return k.kind + ":" + k.key }

// signalKeysForFacts — señales que debe capturar y verificar una evaluación.
// La normalización replica las consultas: placa compara lower() (índice literal
// sin comodines), licencia/vin/chasis/motor/póliza comparan igualdad exacta.
// Un valor vacío conserva su clave y la validación falla cerrada, igual que
// la consulta de duplicados lo emparejaría con otros vacíos.
func signalKeysForFacts(driverID string, f *Facts) []signalKey {
	keys := []signalKey{
		{kind: "rules", key: "global"},
		{kind: "driver", key: driverID},
	}
	if f == nil {
		return keys
	}
	if f.License != nil && f.License.LicenseNumber != nil {
		keys = append(keys, signalKey{kind: "license", key: *f.License.LicenseNumber})
	}
	if f.Vehicle != nil {
		keys = append(keys,
			signalKey{kind: "vehicle", key: f.Vehicle.ID},
			signalKey{kind: "plate", key: strings.ToLower(f.Vehicle.Plate)})
		for _, kv := range [][2]any{
			{"vin", f.Vehicle.Vin}, {"chasis", f.Vehicle.Chasis}, {"motor", f.Vehicle.Motor},
		} {
			if v := kv[1].(*string); v != nil {
				keys = append(keys, signalKey{kind: kv[0].(string), key: *v})
			}
		}
	}
	if f.RcInsurance != nil && f.RcInsurance.PolicyNumber != nil {
		keys = append(keys, signalKey{kind: "policy", key: *f.RcInsurance.PolicyNumber})
	}
	return keys
}

// signalTx — interfaz mínima para sembrar y leer señales dentro de una
// transacción (pgx.Tx la cumple; los tests la envuelven para cambiar de esquema).
type signalTx interface {
	ruleQueryer
	Exec(context.Context, string, ...any) (pgconn.CommandTag, error)
}

// normalizeSignalKeys — valida las claves y las separa en arrays paralelos para
// unnest; rechaza kinds desconocidos, claves vacías y duplicados (fail closed).
func normalizeSignalKeys(keys []signalKey) (kinds, values []string, err error) {
	if len(keys) == 0 || len(keys) > 64 {
		return nil, nil, errors.New("invalid compliance signal count")
	}
	kinds = make([]string, 0, len(keys))
	values = make([]string, 0, len(keys))
	seen := make(map[signalKey]bool, len(keys))
	for _, key := range keys {
		switch key.kind {
		case "driver", "vehicle", "rules", "license", "plate", "vin", "chasis", "motor", "policy":
		default:
			return nil, nil, errors.New("invalid compliance signal kind")
		}
		if key.key == "" || (key.kind == "rules" && key.key != "global") || seen[key] {
			return nil, nil, errors.New("invalid or duplicate compliance signal")
		}
		seen[key] = true
		kinds = append(kinds, key.kind)
		values = append(values, key.key)
	}
	return kinds, values, nil
}

// seedComplianceSignals — crea las señales que aún no existen (baseline en
// generación 1). Corre dentro de la misma tx que lee los hechos: una fila que
// falta significa que la entidad nunca mutó desde que existe la tabla; si una
// tx concurrente la crea primero, ON CONFLICT la deja intacta.
func seedComplianceSignals(ctx context.Context, db signalTx, keys []signalKey) error {
	kinds, values, err := normalizeSignalKeys(keys)
	if err != nil {
		return err
	}
	_, err = db.Exec(ctx, `INSERT INTO public.compliance_signals (kind,signal_key)
		SELECT kind,signal_key FROM unnest($1::text[],$2::text[]) AS s(kind,signal_key)
		ON CONFLICT (kind,signal_key) DO NOTHING`, kinds, values)
	if err != nil {
		return fmt.Errorf("seed compliance signals: %w", err)
	}
	return nil
}

// loadSignalGenerations — lee las generaciones vigentes en el snapshot de la tx
// y las devuelve en el formato "kind:key" de DailyContext.InputGenerations.
// Una clave sin fila queda ausente del mapa: la validación falla cerrada.
func loadSignalGenerations(ctx context.Context, db signalTx, keys []signalKey) (map[string]int64, error) {
	kinds, values, err := normalizeSignalKeys(keys)
	if err != nil {
		return nil, err
	}
	rows, err := db.Query(ctx, `SELECT s.kind,s.signal_key,s.generation
		FROM public.compliance_signals s
		JOIN unnest($1::text[], $2::text[]) AS requested(kind,signal_key)
		  ON s.kind=requested.kind COLLATE "C" AND s.signal_key=requested.signal_key COLLATE "C"`, kinds, values)
	if err != nil {
		return nil, fmt.Errorf("load compliance signals: %w", err)
	}
	defer rows.Close()
	generations := make(map[string]int64, len(keys))
	for rows.Next() {
		var key signalKey
		var generation int64
		if err := rows.Scan(&key.kind, &key.key, &generation); err != nil {
			return nil, err
		}
		if generation <= 0 {
			return nil, errors.New("invalid compliance generation")
		}
		generations[key.signalMapKey()] = generation
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return generations, nil
}

func lockComplianceSignals(ctx context.Context, tx pgx.Tx, keys []signalKey) (map[signalKey]int64, error) {
	kinds, values, err := normalizeSignalKeys(keys)
	if err != nil {
		return nil, err
	}
	rows, err := tx.Query(ctx, `SELECT s.kind,s.signal_key,s.generation
		FROM public.compliance_signals s
		JOIN unnest($1::text[], $2::text[]) AS requested(kind,signal_key)
		  ON s.kind=requested.kind COLLATE "C" AND s.signal_key=requested.signal_key COLLATE "C"
		ORDER BY s.kind COLLATE "C",s.signal_key COLLATE "C" FOR SHARE OF s`, kinds, values)
	if err != nil {
		return nil, fmt.Errorf("lock compliance signals: %w", err)
	}
	defer rows.Close()
	versions := make(map[signalKey]int64, len(keys))
	for rows.Next() {
		var key signalKey
		var generation int64
		if err := rows.Scan(&key.kind, &key.key, &generation); err != nil {
			return nil, err
		}
		if generation <= 0 {
			return nil, errors.New("invalid compliance generation")
		}
		versions[key] = generation
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(versions) != len(keys) {
		return nil, errMissingComplianceSignal
	}
	return versions, nil
}
