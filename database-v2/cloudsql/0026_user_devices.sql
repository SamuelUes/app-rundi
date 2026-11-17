-- ============================================================================
-- 0026_user_devices.sql — reconocimiento de dispositivo para login directo
-- tras reinstalar la app.
--
-- El deviceId es estable entre instalaciones (UUID en iOS Keychain, que
-- sobrevive uninstall, o ANDROID_ID en Android). El secret lo genera el
-- cliente y solo vive en almacenamiento seguro del SO; aquí se guarda
-- únicamente sha256(secret). recognize (deviceId→usuario) es un hint de UX;
-- el minteo de custom token exige deviceId+secret válidos.
--
-- PK compuesta (device_id, user_id): un dispositivo puede tener varias
-- cuentas (teléfono compartido) y una cuenta varios dispositivos.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.user_devices (
  device_id VARCHAR(128) NOT NULL,
  user_id VARCHAR(255) NOT NULL REFERENCES public.users(id),
  secret_hash VARCHAR(128) NOT NULL,
  platform VARCHAR(32) NULL,
  app_version VARCHAR(128) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  revoked_at TIMESTAMPTZ NULL,
  CONSTRAINT user_devices_pkey PRIMARY KEY (device_id, user_id)
);

COMMENT ON TABLE public.user_devices IS
  'Credenciales de dispositivo para re-login tras reinstall. device_id estable (iOS Keychain UUID / ANDROID_ID) + sha256(secret). recognize = hint UX; token exige secret. No se proyecta a Firestore.';
COMMENT ON COLUMN public.user_devices.secret_hash IS
  'sha256 del secret generado en el dispositivo (122+ bits aleatorios — no requiere bcrypt).';
COMMENT ON COLUMN public.user_devices.last_seen_at IS
  'Última actividad autenticada del par dispositivo+usuario; desempata la cuenta mostrada en recognize (teléfono compartido).';

-- Cuenta más reciente por dispositivo para recognize.
CREATE INDEX IF NOT EXISTS idx_user_devices_active
  ON public.user_devices USING btree (device_id, last_seen_at DESC)
  WHERE revoked_at IS NULL;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_devices TO rundi_app;
  END IF;
END $$;

COMMIT;
