BEGIN;

-- 0034 — el cerco _fs también cubre filas ya revocadas (conductor offline).
--
-- Antes la invalidación exigía session_id IS NOT NULL: una fila-espejo
-- revocada quedaba con reactivation_required = FALSE y el próximo
-- openFSMirror la reabría sobre inputs potencialmente obsoletos si el
-- resync perezoso (driver.fs_inputs_stale → consumer) aún no aterrizaba.
-- Ahora toda fila _fs no marcada se marca, vivo o no: la marca es el
-- registro durable de "mutación posterior a tu última autorización" y la
-- limpia únicamente SyncFirestoreInputs tras reevaluar. El resync sigue
-- encolándose igual (deduplicado por evento pendiente por conductor).

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
     AND reactivation_required = FALSE
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

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT EXECUTE ON FUNCTION public.fs_availability_invalidate(uuid) TO rundi_app;
  END IF;
END $$;

COMMIT;
