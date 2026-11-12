-- ============================================================================
-- 0017_driver_sessions.sql — control de autorización de disponibilidad.
--
-- Una fila por conductor: NO es el estado online/offline (ese vive en
-- Firestore REALTIME_drivers_live). Es el control SQL que cercan ofertas,
-- asignación, barrido de medianoche y finalización de viaje:
--   * session_seq  — generación monotona; un evento atrasado no revive una
--                    sesión reemplazada ni apaga una más reciente.
--   * session_id   — autorización vigente (NULL cuando debe reactivar).
--   * reactivation_required — TRUE tras completar viaje, vencer el día o
--                    revocar; bloquea nuevas ofertas hasta reactivar.
--   * day / expires_at — día calendario Nicaragua de la autorización y su
--                    instante exclusivo de vencimiento (medianoche o antes).
--   * input_generations — mapa "kind:key"→generación registrado al autorizar;
--                    el gate lo compara con compliance_signals bajo FOR SHARE.
-- ============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.driver_sessions (
  driver_id UUID NOT NULL REFERENCES public.drivers(id),
  session_seq BIGINT NOT NULL DEFAULT 0 CHECK (session_seq >= 0),
  session_id UUID NULL,
  day TEXT NULL,
  vehicle_id UUID NULL,
  service_codes TEXT[] NULL,
  input_generations JSONB NULL,
  reactivation_required BOOLEAN NOT NULL DEFAULT TRUE,
  authorized_at TIMESTAMPTZ NULL,
  expires_at TIMESTAMPTZ NULL,
  revoked_at TIMESTAMPTZ NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT driver_sessions_pkey PRIMARY KEY (driver_id),
  CHECK (session_id IS NULL OR
         (day IS NOT NULL AND expires_at IS NOT NULL AND input_generations IS NOT NULL))
);

COMMENT ON TABLE public.driver_sessions IS
  'Control SQL de autorización de disponibilidad por conductor. No es el estado operativo online/offline (Firestore); cercan ofertas, asignación, barrido de medianoche y finalización.';
COMMENT ON COLUMN public.driver_sessions.session_seq IS
  'Generación monotona por conductor; ordena eventos de activación/desactivación y descarta transiciones atrasadas.';
COMMENT ON COLUMN public.driver_sessions.reactivation_required IS
  'TRUE cuando el conductor debe reactivar explícitamente (día vencido, viaje completado, revocación o nunca activado).';

-- El barrido nocturno revisa sesiones vigentes cuyo día ya no autoriza.
CREATE INDEX IF NOT EXISTS idx_driver_sessions_expiry
  ON public.driver_sessions USING btree (expires_at)
  WHERE session_id IS NOT NULL AND reactivation_required = FALSE;

DO $$
BEGIN
  IF to_regprocedure('public.update_updated_at_column()') IS NOT NULL THEN
    EXECUTE $t$DROP TRIGGER IF EXISTS update_driver_sessions_updated_at ON public.driver_sessions$t$;
    EXECUTE $t$CREATE TRIGGER update_driver_sessions_updated_at BEFORE UPDATE ON public.driver_sessions
      FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column()$t$;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'rundi_app') THEN
    GRANT SELECT, INSERT, UPDATE ON public.driver_sessions TO rundi_app;
  END IF;
END $$;

COMMIT;
