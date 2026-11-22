-- La tarjeta de circulación NI no tiene fecha de vencimiento (solo "Emisión").
-- declared_valid_until / registration_expiry eran columnas zombie que el OCR
-- no puede leer del documento real; la fecha que sí existe vive en
-- issued_at / vehicles.emission_date.
ALTER TABLE public.vehicle_circulation_cards
  DROP COLUMN IF EXISTS declared_valid_until;
ALTER TABLE public.vehicles
  DROP COLUMN IF EXISTS registration_expiry;
