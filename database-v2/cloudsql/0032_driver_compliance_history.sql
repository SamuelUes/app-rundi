BEGIN;

-- Append-only archive of backend-owned Firestore compliance events.
CREATE TABLE IF NOT EXISTS public.driver_compliance_history (
  event_id UUID PRIMARY KEY,
  driver_uid TEXT NOT NULL,
  event_kind TEXT NOT NULL CHECK (event_kind IN (
    'documents_changed', 'session_activated', 'session_deactivated'
  )),
  revision BIGINT NOT NULL CHECK (revision > 0),
  snapshot JSONB NOT NULL CHECK (jsonb_typeof(snapshot) = 'object'),
  occurred_at TIMESTAMPTZ NOT NULL,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_driver_compliance_history_driver_time
  ON public.driver_compliance_history (driver_uid, occurred_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_driver_compliance_history_document_revision
  ON public.driver_compliance_history (driver_uid, revision)
  WHERE event_kind = 'documents_changed';

-- Only contiguous archived document revisions may be trusted by SQL gates.
CREATE TABLE IF NOT EXISTS public.driver_compliance_sync_checkpoints (
  driver_uid TEXT PRIMARY KEY,
  document_revision BIGINT NOT NULL DEFAULT 0 CHECK (document_revision >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT ON public.driver_compliance_history TO rundi_app;
    GRANT SELECT, INSERT, UPDATE ON public.driver_compliance_sync_checkpoints TO rundi_app;
  END IF;
END $$;

COMMIT;
