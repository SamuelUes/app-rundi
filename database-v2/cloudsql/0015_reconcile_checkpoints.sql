-- Durable, fenced progress for bounded reconciliation windows.
BEGIN;

CREATE TABLE IF NOT EXISTS public.reconcile_checkpoints (
  aggregate_type TEXT PRIMARY KEY,
  completed_through TIMESTAMPTZ NOT NULL,
  window_end TIMESTAMPTZ,
  cursor_updated_at TIMESTAMPTZ,
  cursor_id TEXT,
  lease_owner UUID,
  lease_until TIMESTAMPTZ,
  CHECK ((cursor_updated_at IS NULL) = (cursor_id IS NULL)),
  CHECK ((lease_owner IS NULL) = (lease_until IS NULL))
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.reconcile_checkpoints TO rundi_app;
  END IF;
END $$;

COMMIT;
