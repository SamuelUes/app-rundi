BEGIN;

-- 0033 — cerco del espejo SQL de sesiones Firestore (_fs).
--
-- Las sesiones `_fs` (input_generations->>'_fs' = '1') son autorizadas por
-- Firestore; su fila en driver_sessions solo es el cerrojo transaccional de
-- aceptar/negociar viajes. Cualquier señal de compliance contra conductor o
-- vehículo debe revocarla DE FORMA EAGER dentro de la misma tx que muta el
-- dato (serializable contra el check FOR SHARE del ride), y encolar un
-- resync perezoso de los inputs de Firestore vía outbox.

CREATE OR REPLACE FUNCTION public.fs_availability_invalidate(p_driver uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_catalog
AS $$
DECLARE
  v_uid text;
BEGIN
  IF p_driver IS NULL THEN
    RETURN;
  END IF;
  UPDATE public.driver_sessions
     SET session_seq = session_seq + 1,
         session_id = NULL,
         reactivation_required = TRUE,
         revoked_at = clock_timestamp()
   WHERE driver_id = p_driver
     AND session_id IS NOT NULL
     AND COALESCE(input_generations ->> '_fs', '') = '1';
  SELECT user_id INTO v_uid FROM public.drivers WHERE id = p_driver;
  IF v_uid IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.outbox_events
     WHERE status = 'pending'
       AND event_type = 'driver.fs_inputs_stale'
       AND aggregate_id = p_driver::text
  ) THEN
    INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
    VALUES ('driver.fs_inputs_stale', 'driver', p_driver::text,
            jsonb_build_object('driverUid', v_uid, 'driverId', p_driver::text));
  END IF;
END
$$;

-- Reemplazo de compliance_bump: misma firma y triggers, añade el cerco _fs y
-- el evento de cambio de reglas (invalida la política Firestore entera).
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
      IF kind = 'driver' OR kind = 'vehicle' THEN
        IF kv ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
          IF kind = 'driver' THEN
            PERFORM public.fs_availability_invalidate(kv::uuid);
          ELSE
            PERFORM public.fs_availability_invalidate(
              (SELECT driver_id FROM public.vehicles WHERE id = kv::uuid));
          END IF;
        END IF;
      ELSIF kind = 'rules' THEN
        IF NOT EXISTS (SELECT 1 FROM public.outbox_events
                       WHERE status = 'pending'
                         AND event_type = 'compliance.rules_changed') THEN
          INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
          VALUES ('compliance.rules_changed', 'compliance', 'global', '{}'::jsonb);
        END IF;
      END IF;
    END IF;
    IF TG_OP <> 'INSERT' THEN
      kv := CASE WHEN col LIKE '=%' THEN substr(col, 2) ELSE o ->> col END;
      IF kv IS NOT NULL AND kv <> ''
         AND (TG_OP = 'DELETE'
              OR (o ->> col) IS DISTINCT FROM (n ->> col)) THEN
        PERFORM public.compliance_signal_bump(
          kind, CASE WHEN kind = 'plate' THEN lower(kv) ELSE kv END);
        IF kind = 'driver' OR kind = 'vehicle' THEN
          IF kv ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' THEN
            IF kind = 'driver' THEN
              PERFORM public.fs_availability_invalidate(kv::uuid);
            ELSE
              PERFORM public.fs_availability_invalidate(
                (SELECT driver_id FROM public.vehicles WHERE id = kv::uuid));
            END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT EXECUTE ON FUNCTION public.fs_availability_invalidate(uuid) TO rundi_app;
  END IF;
END $$;

COMMIT;
