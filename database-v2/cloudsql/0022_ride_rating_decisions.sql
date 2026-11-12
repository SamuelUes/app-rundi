BEGIN;

CREATE TABLE IF NOT EXISTS public.ride_rating_decisions (
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  actor_id text NOT NULL REFERENCES public.users(id),
  decision text NOT NULL CHECK (decision IN ('completed', 'skipped')),
  decided_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id, actor_id)
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.ride_rating_decisions TO rundi_app;
  END IF;
END $$;

WITH backfilled AS (
  INSERT INTO public.ride_rating_decisions (ride_id, actor_id, decision)
  SELECT r.id, r.client_id, 'completed'
  FROM public.rides r
  WHERE r.status = 'rating_completed'
    AND EXISTS (
      SELECT 1 FROM public.ratings rt
      WHERE rt.ride_id = r.id AND rt.from_user_id = r.client_id AND rt.deleted_at IS NULL
    )
  ON CONFLICT DO NOTHING
  RETURNING ride_id
)
UPDATE public.rides r SET version = r.version + 1
FROM backfilled b WHERE r.id = b.ride_id;

CREATE INDEX IF NOT EXISTS idx_rides_client_completed_rating
  ON public.rides (client_id, completed_at DESC, id DESC)
  WHERE completed_at IS NOT NULL AND deleted_at IS NULL;

INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'rating.pending_refresh', 'rating_pending', r.client_id, '{}'::jsonb
FROM public.rides r
WHERE r.completed_at IS NOT NULL AND r.deleted_at IS NULL
GROUP BY r.client_id
HAVING NOT EXISTS (
  SELECT 1 FROM public.outbox_events e
  WHERE e.aggregate_type = 'rating_pending' AND e.aggregate_id = r.client_id AND e.status = 'pending'
);

COMMIT;
