-- Preserve the two required documents and their attestation alongside the four seats.
ALTER TABLE public.designated_driver_inspections
  ADD COLUMN IF NOT EXISTS insurance_document_photo VARCHAR(500),
  ADD COLUMN IF NOT EXISTS registration_document_photo VARCHAR(500),
  ADD COLUMN IF NOT EXISTS documents_confirmed BOOLEAN NOT NULL DEFAULT FALSE;
