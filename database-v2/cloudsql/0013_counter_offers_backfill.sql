-- Reproject existing open counteroffers through the normal outbox consumer.
INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'ride.offers_reconcile', 'ride', r.id::text,
       jsonb_build_object('rideId', r.id::text, 'version', r.version)
FROM public.rides r
WHERE r.status IN ('requested', 'driver_offered')
  AND r.driver_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.ride_offers o
    WHERE o.ride_id = r.id AND o.kind = 'counter_offer' AND o.status = 'sent'
  );
