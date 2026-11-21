BEGIN;

-- Each driver's row serializes revisions in commit order, including deletion.
CREATE TABLE IF NOT EXISTS public.driver_document_projection_versions (
  user_id TEXT PRIMARY KEY,
  revision BIGINT NOT NULL CHECK (revision > 0)
);

CREATE OR REPLACE FUNCTION public.queue_driver_documents(p_uid text)
RETURNS void LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE v_revision bigint;
BEGIN
  IF p_uid IS NULL OR p_uid = '' THEN RETURN; END IF;
  INSERT INTO public.driver_document_projection_versions (user_id, revision)
  VALUES (p_uid, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET revision = public.driver_document_projection_versions.revision + 1
  RETURNING revision INTO v_revision;
  INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
  VALUES ('driver.documents_changed', 'driver_documents', p_uid,
          jsonb_build_object('version', v_revision));
END $$;

CREATE OR REPLACE FUNCTION public.queue_changed_driver_documents()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_catalog AS $$
DECLARE
  n jsonb := to_jsonb(NEW);
  o jsonb := to_jsonb(OLD);
  uids text[];
  u text;
BEGIN
  IF TG_TABLE_NAME = 'drivers' THEN
    uids := ARRAY[o->>'user_id', n->>'user_id'];
  ELSIF TG_TABLE_NAME = 'driver_licenses' OR TG_TABLE_NAME = 'vehicles' THEN
    SELECT array_agg(user_id) INTO uids FROM public.drivers
      WHERE id::text IN (o->>'driver_id', n->>'driver_id');
  ELSE
    SELECT array_agg(d.user_id) INTO uids FROM public.vehicles v
      JOIN public.drivers d ON d.id = v.driver_id
      WHERE v.id::text IN (o->>'vehicle_id', n->>'vehicle_id');
  END IF;
  -- A consistent lock order avoids deadlocks if ownership changes.
  FOR u IN SELECT DISTINCT uid FROM unnest(uids) AS uid WHERE uid IS NOT NULL ORDER BY uid LOOP
    PERFORM public.queue_driver_documents(u);
  END LOOP;
  RETURN COALESCE(NEW, OLD);
END $$;

CREATE OR REPLACE TRIGGER driver_documents_drivers
AFTER INSERT OR DELETE OR UPDATE OF user_id, deleted_at ON public.drivers
FOR EACH ROW EXECUTE FUNCTION public.queue_changed_driver_documents();

CREATE OR REPLACE TRIGGER driver_documents_licenses
AFTER INSERT OR UPDATE OR DELETE ON public.driver_licenses
FOR EACH ROW EXECUTE FUNCTION public.queue_changed_driver_documents();

CREATE OR REPLACE TRIGGER driver_documents_vehicles
AFTER INSERT OR DELETE OR UPDATE OF driver_id, is_active, deleted_at, plate, type, year, brand, model, color
ON public.vehicles FOR EACH ROW EXECUTE FUNCTION public.queue_changed_driver_documents();

DO $$
DECLARE tbl text;
BEGIN
  FOREACH tbl IN ARRAY ARRAY[
    'vehicle_circulation_cards', 'vehicle_insurance_policies', 'vehicle_inspections',
    'vehicle_emission_certificates', 'vehicle_road_taxes', 'vehicle_revisado_stickers'
  ] LOOP
    EXECUTE format('CREATE OR REPLACE TRIGGER driver_documents_changed
      AFTER INSERT OR UPDATE OR DELETE ON public.%I
      FOR EACH ROW EXECUTE FUNCTION public.queue_changed_driver_documents()', tbl);
  END LOOP;
END $$;

-- One initial event per existing driver, only on the first application.
WITH seeded AS (
  INSERT INTO public.driver_document_projection_versions (user_id, revision)
  SELECT user_id, 1 FROM public.drivers WHERE deleted_at IS NULL
  ON CONFLICT (user_id) DO NOTHING
  RETURNING user_id, revision
)
INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'driver.documents_changed', 'driver_documents', user_id,
       jsonb_build_object('version', revision) FROM seeded;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.driver_document_projection_versions TO rundi_app;
  END IF;
END $$;
COMMIT;
