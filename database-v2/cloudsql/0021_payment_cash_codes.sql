BEGIN;

-- Código de confirmación de pago en efectivo (espejo de ride_pickup_codes):
-- el cliente lo ostenta (private/cash, solo él lo lee) y el conductor lo
-- digita para confirmar que recibió el efectivo. failed_attempts/locked_until
-- igualan la política anti-fuerza-bruta del pickup code.
CREATE TABLE IF NOT EXISTS public.payment_cash_codes (
  ride_id uuid PRIMARY KEY REFERENCES public.rides(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (code ~ '^[0-9]{4}$'),
  failed_attempts integer NOT NULL DEFAULT 0 CHECK (failed_attempts >= 0),
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.payment_cash_codes TO rundi_app;
  END IF;
END $$;

-- Backfill: pagos cash aún pendientes necesitan código como los nuevos.
INSERT INTO public.payment_cash_codes (ride_id, code)
SELECT p.ride_id, lpad(((('x' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 8))::bit(32)::bigint % 10000))::text, 4, '0')
FROM public.payments p
WHERE p.payment_method = 'cash'
  AND p.status IN ('pending', 'pending_confirmation')
ON CONFLICT (ride_id) DO NOTHING;

INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload)
SELECT 'payment.cash_code', 'payment', p.id::text,
       jsonb_build_object('paymentId', p.id::text, 'rideId', p.ride_id::text)
FROM public.payments p
JOIN public.payment_cash_codes c ON c.ride_id = p.ride_id
WHERE p.status IN ('pending', 'pending_confirmation')
  AND NOT EXISTS (
    SELECT 1 FROM public.outbox_events e
    WHERE e.event_type = 'payment.cash_code'
      AND e.aggregate_id = p.id::text AND e.status = 'pending'
  );

COMMIT;
