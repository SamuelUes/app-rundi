-- The consumer rebuilds the public projection from current SQL data.
INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'driver_public.reconcile', 'driver_public', d.user_id, '{}'::jsonb
FROM public.drivers d
WHERE d.deleted_at IS NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.outbox_events e
    WHERE e.aggregate_type = 'driver_public' AND e.aggregate_id = d.user_id AND e.status = 'pending'
  );
