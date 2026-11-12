BEGIN;

ALTER TYPE public.biometric_type ADD VALUE IF NOT EXISTS 'device_credential';

ALTER TABLE public.drivers ADD COLUMN IF NOT EXISTS biometric_registration_id UUID;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_biometric_registration_id
  ON public.drivers (biometric_registration_id) WHERE biometric_registration_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_drivers_user_biometric_registration
  ON public.drivers (user_id, biometric_registration_id);

ALTER TABLE public.biometric_authentications ADD COLUMN IF NOT EXISTS biometric_registration_id UUID;
CREATE INDEX IF NOT EXISTS idx_biometric_auth_registration_id
  ON public.biometric_authentications (biometric_registration_id) WHERE biometric_registration_id IS NOT NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'biometric_authentications_driver_registration_fkey'
      AND conrelid = 'public.biometric_authentications'::regclass
  ) THEN
    ALTER TABLE public.biometric_authentications
      ADD CONSTRAINT biometric_authentications_driver_registration_fkey
      FOREIGN KEY (user_id, biometric_registration_id)
      REFERENCES public.drivers (user_id, biometric_registration_id);
  END IF;
END $$;

COMMIT;
