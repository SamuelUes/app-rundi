ALTER TABLE public.rides
  ADD COLUMN IF NOT EXISTS wallet_commission_enabled BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE public.rides
  ALTER COLUMN wallet_commission_enabled SET DEFAULT TRUE;
