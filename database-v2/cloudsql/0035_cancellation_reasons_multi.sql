-- Razones múltiples por cancelación: una fila por (viaje, código).
-- El cliente puede omitir la pregunta ('skipped') — también cuenta para stats.
ALTER TABLE public.ride_cancellation_reasons
  DROP CONSTRAINT IF EXISTS ride_cancellation_reasons_pkey;
ALTER TABLE public.ride_cancellation_reasons
  DROP CONSTRAINT IF EXISTS ride_cancellation_reasons_reason_code_check;
ALTER TABLE public.ride_cancellation_reasons
  ADD CONSTRAINT ride_cancellation_reasons_pkey PRIMARY KEY (ride_id, reason_code);
ALTER TABLE public.ride_cancellation_reasons
  ADD CONSTRAINT ride_cancellation_reasons_reason_code_check
  CHECK (reason_code IN (
    'wait_too_long', 'price_too_high', 'plans_changed', 'wrong_details', 'other', 'skipped'
  ));
