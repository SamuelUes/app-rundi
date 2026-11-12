BEGIN;

CREATE TABLE IF NOT EXISTS public.compliance_signals (
  kind TEXT COLLATE "C" NOT NULL,
  signal_key TEXT COLLATE "C" NOT NULL,
  generation BIGINT NOT NULL DEFAULT 1 CHECK (generation > 0),
  PRIMARY KEY (kind, signal_key),
  CHECK (kind IN ('driver', 'vehicle', 'rules', 'license', 'plate', 'vin', 'chasis', 'motor', 'policy')),
  CHECK (signal_key <> '' AND (kind <> 'rules' OR signal_key = 'global'))
);

-- Tablas creadas por una 0016 anterior sin el kind 'vehicle'.
ALTER TABLE public.compliance_signals
  DROP CONSTRAINT IF EXISTS compliance_signals_kind_check;
ALTER TABLE public.compliance_signals
  ADD CONSTRAINT compliance_signals_kind_check
  CHECK (kind IN ('driver', 'vehicle', 'rules', 'license', 'plate', 'vin', 'chasis', 'motor', 'policy'));

INSERT INTO public.compliance_signals (kind, signal_key)
VALUES ('rules', 'global')
ON CONFLICT (kind, signal_key) DO NOTHING;

-- compliance_signal_bump — única vía de incremento; crea la señal si falta.
CREATE OR REPLACE FUNCTION public.compliance_signal_bump(p_kind text, p_key text)
RETURNS void
LANGUAGE sql
SET search_path = public, pg_catalog
AS $$
  INSERT INTO public.compliance_signals (kind, signal_key)
  VALUES (p_kind, p_key)
  ON CONFLICT (kind, signal_key)
  DO UPDATE SET generation = public.compliance_signals.generation + 1;
$$;

-- compliance_bump — trigger genérico. Cada argumento es 'kind:columna' (valor
-- del registro) o 'kind:=constante' (literal). En UPDATE toca siempre las
-- claves del NEW y las del OLD solo cuando el valor cambió; en DELETE, las
-- del OLD. 'plate' se normaliza con lower(), como la consulta de duplicados.
CREATE OR REPLACE FUNCTION public.compliance_bump()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := to_jsonb(OLD);
  i int;
  kind text;
  col text;
  kv text;
BEGIN
  FOR i IN 0 .. TG_NARGS - 1 LOOP
    kind := split_part(TG_ARGV[i], ':', 1);
    col  := split_part(TG_ARGV[i], ':', 2);
    IF TG_OP <> 'DELETE' THEN
      kv := CASE WHEN col LIKE '=%' THEN substr(col, 2) ELSE n ->> col END;
      IF kv IS NOT NULL AND kv <> '' THEN
        PERFORM public.compliance_signal_bump(
          kind, CASE WHEN kind = 'plate' THEN lower(kv) ELSE kv END);
      END IF;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      kv := CASE WHEN col LIKE '=%' THEN substr(col, 2) ELSE o ->> col END;
      IF kv IS NOT NULL AND kv <> ''
         AND (TG_OP = 'DELETE'
              OR (o ->> col) IS DISTINCT FROM (n ->> col)) THEN
        PERFORM public.compliance_signal_bump(
          kind, CASE WHEN kind = 'plate' THEN lower(kv) ELSE kv END);
      END IF;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$$;

-- Triggers sobre tablas reales; se omiten si el esquema aún no las tiene
-- (permite aplicar la migración en entornos parciales o de prueba).
DO $$
BEGIN
  IF to_regclass('public.drivers') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_drivers_ins
      AFTER INSERT OR DELETE ON public.drivers
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:id')$t$;
    -- UPDATE restringido: un UPDATE de saldo/rating/ubicación no invalida.
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_drivers_upd
      AFTER UPDATE ON public.drivers
      FOR EACH ROW
      WHEN (OLD.account_status IS DISTINCT FROM NEW.account_status
         OR OLD.documents_status IS DISTINCT FROM NEW.documents_status
         OR OLD.deleted_at IS DISTINCT FROM NEW.deleted_at)
      EXECUTE FUNCTION public.compliance_bump('driver:id')$t$;
  END IF;
  IF to_regclass('public.driver_licenses') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_licenses
      AFTER INSERT OR UPDATE OR DELETE ON public.driver_licenses
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:driver_id','license:license_number')$t$;
  END IF;
  IF to_regclass('public.vehicles') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_vehicles
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicles
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:driver_id','vehicle:id','plate:plate','vin:vin','chasis:chasis','motor:motor')$t$;
  END IF;
  IF to_regclass('public.vehicle_circulation_cards') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_circulation
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_circulation_cards
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id')$t$;
  END IF;
  IF to_regclass('public.vehicle_insurance_policies') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_insurance
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_insurance_policies
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id','policy:policy_number')$t$;
  END IF;
  IF to_regclass('public.vehicle_inspections') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_inspections
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_inspections
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id')$t$;
  END IF;
  IF to_regclass('public.vehicle_emission_certificates') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_emissions
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_emission_certificates
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id')$t$;
  END IF;
  IF to_regclass('public.vehicle_road_taxes') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_roadtax
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_road_taxes
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id')$t$;
  END IF;
  IF to_regclass('public.vehicle_revisado_stickers') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_revisado
      AFTER INSERT OR UPDATE OR DELETE ON public.vehicle_revisado_stickers
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('vehicle:vehicle_id')$t$;
  END IF;
  IF to_regclass('public.compliance_rules') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_rules
      AFTER INSERT OR UPDATE OR DELETE ON public.compliance_rules
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('rules:=global')$t$;
  END IF;
  IF to_regclass('public.license_category_rules') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_catrules
      AFTER INSERT OR UPDATE OR DELETE ON public.license_category_rules
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('rules:=global')$t$;
  END IF;
  IF to_regclass('public.driver_services') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_driver_services
      AFTER INSERT OR UPDATE OR DELETE ON public.driver_services
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('driver:driver_id')$t$;
  END IF;
  IF to_regclass('public.services') IS NOT NULL THEN
    EXECUTE $t$CREATE OR REPLACE TRIGGER compliance_signals_services
      AFTER INSERT OR UPDATE OR DELETE ON public.services
      FOR EACH ROW EXECUTE FUNCTION public.compliance_bump('rules:=global')$t$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.compliance_signals TO rundi_app;
    GRANT EXECUTE ON FUNCTION public.compliance_signal_bump(text, text) TO rundi_app;
  END IF;
END $$;

COMMIT;
