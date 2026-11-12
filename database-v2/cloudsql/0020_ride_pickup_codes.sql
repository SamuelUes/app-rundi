BEGIN;

CREATE TABLE IF NOT EXISTS public.ride_pickup_codes (
  ride_id uuid PRIMARY KEY REFERENCES public.rides(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.ride_pickup_codes TO rundi_app;
  END IF;
END $$;

-- Existing assigned rides need the same code as newly confirmed rides.
INSERT INTO public.ride_pickup_codes (ride_id, code)
SELECT r.id, lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 10000))::text, 4, '0')
FROM public.rides r
WHERE r.driver_id IS NOT NULL AND r.status IN ('accepted', 'driver_on_route', 'driver_arrived')
ON CONFLICT (ride_id) DO NOTHING;

INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'ride.pickup_code_reconcile', 'ride', r.id::text,
       jsonb_build_object('rideId', r.id::text, 'version', r.version)
FROM public.rides r
JOIN public.ride_pickup_codes c ON c.ride_id = r.id
WHERE r.status IN ('accepted', 'driver_on_route', 'driver_arrived')
  AND NOT EXISTS (
    SELECT 1 FROM public.outbox_events e
    WHERE e.event_type = 'ride.pickup_code_reconcile'
      AND e.aggregate_id = r.id::text AND e.status = 'pending'
  );

COMMIT;
