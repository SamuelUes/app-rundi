-- Materialized asynchronously from the transactional outbox.
CREATE TABLE IF NOT EXISTS public.ride_cancellation_reasons (
  ride_id UUID PRIMARY KEY REFERENCES public.rides(id) ON DELETE CASCADE,
  reason_code TEXT NOT NULL CHECK (reason_code IN (
    'wait_too_long', 'price_too_high', 'plans_changed', 'wrong_details', 'other'
  )),
  canceled_at TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ride_cancellation_reasons_date
  ON public.ride_cancellation_reasons (canceled_at, reason_code);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT ON public.ride_cancellation_reasons TO rundi_app;
  END IF;
END $$;
