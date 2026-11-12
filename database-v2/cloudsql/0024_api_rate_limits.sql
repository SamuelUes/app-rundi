BEGIN;

CREATE TABLE IF NOT EXISTS public.api_rate_limits (
  policy text NOT NULL,
  subject_hash bytea NOT NULL,
  theoretical_arrival timestamptz NOT NULL,
  last_seen timestamptz NOT NULL,
  allowed boolean NOT NULL,
  PRIMARY KEY (policy, subject_hash)
);

CREATE INDEX IF NOT EXISTS idx_api_rate_limits_last_seen
  ON public.api_rate_limits (last_seen);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.api_rate_limits TO rundi_app;
  END IF;
END $$;

COMMIT;
