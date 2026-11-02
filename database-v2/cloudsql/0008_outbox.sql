-- ============================================================================
-- 0008_outbox.sql — Transactional Outbox (doc §6.1) + roles BD mínimo privilegio.
-- Reemplaza el outbox rudimentario RTDB (pendingArchive/archiveClaims).
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- ============================================
-- OUTBOX_EVENTS
-- Por cada comando SQL-authoritative: insertar el evento EN LA MISMA
-- TRANSACCIÓN que la mutación de negocio. El sweeper (cmd/consumer):
--
--   1. Claim en TX corta: UPDATE ... WHERE event_id IN (SELECT ... FOR UPDATE
--      SKIP LOCKED) RETURNING → attempts+1 y next_attempt_at=lease (invisible
--      para otros sweeps mientras se procesa; COMMIT antes del trabajo externo).
--   2. Proyecta a Firestore (DATA-MAIN_*/REALTIME_*) con idempotencia
--      (version estrictamente mayor, compare-and-set) FUERA de la TX.
--   3. UPDATE status='published' + published_at  |  error →
--      next_attempt_at = NOW() + backoff exponencial; si attempts alcanza
--      max_attempts → status='failed' + failed_at (dead-letter: alertar y
--      reprocesar manualmente, NUNCA reintentar en caliente infinitamente).
--   4. Eventos no procesados se liberan (next_attempt_at=NOW()); si el
--      sweeper muere, el lease expira y otro los retoma (handlers idempotentes).
--
-- Retención: el scheduler borra status='published' con published_at viejo
-- (índice idx_outbox_published_cleanup); los 'failed' NO se borran por job
-- — requieren revisión humana.
-- ============================================
CREATE TABLE IF NOT EXISTS public.outbox_events (
  event_id UUID NOT NULL DEFAULT gen_random_uuid(),
  event_type VARCHAR(100) NOT NULL,             -- p.ej. 'ride.status_changed', 'payment.completed'
  aggregate_type VARCHAR(50) NOT NULL,          -- 'ride' | 'payment' | 'driver' | ...
  aggregate_id TEXT NOT NULL,                   -- UUID o Firebase UID según agregado
  payload JSONB NOT NULL,
  schema_version INTEGER NOT NULL DEFAULT 1,    -- versionado de payload
  status public.outbox_status NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 15,     -- al alcanzarlo → failed (dead-letter)
  next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error TEXT NULL,
  request_id VARCHAR(64) NULL,                  -- correlación con API
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ NULL,
  failed_at TIMESTAMPTZ NULL,                   -- cuándo pasó a dead-letter
  CONSTRAINT outbox_events_pkey PRIMARY KEY (event_id),
  CONSTRAINT outbox_attempts_nonneg CHECK (attempts >= 0),
  CONSTRAINT outbox_terminal_state_check CHECK (
    (status = 'published' AND published_at IS NOT NULL) OR
    (status = 'failed'    AND failed_at IS NOT NULL) OR
    status = 'pending'
  )
);

-- UPGRADE: columnas nuevas si outbox_events ya existía (deploy viejo).
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS schema_version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS attempts INTEGER NOT NULL DEFAULT 0;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 15;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS last_error TEXT;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;

COMMENT ON TABLE public.outbox_events IS 'Transactional Outbox: evento insertado en la misma TX que la mutación. Sweeper publica a Firestore con idempotencia; processed_events dedup en Firestore SYSTEM_.';
COMMENT ON COLUMN public.outbox_events.next_attempt_at IS 'Backoff exponencial gestionado por el sweeper (functions-v2).';
COMMENT ON COLUMN public.outbox_events.max_attempts IS 'Intentos antes de dead-letter (status=''failed'' + failed_at).';

-- Claim del sweeper: filtra status='pending' y ordena por created_at → el
-- índice parcial sirve el ORDER BY y mantiene chico el árbol.
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events(created_at)
  WHERE status = 'pending';
-- Retención: DELETE de publicados por antigüedad.
CREATE INDEX IF NOT EXISTS idx_outbox_published_cleanup ON public.outbox_events(published_at)
  WHERE status = 'published';
-- Dead-letter monitoring: alertas sobre eventos fallidos.
CREATE INDEX IF NOT EXISTS idx_outbox_failed ON public.outbox_events(failed_at)
  WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS idx_outbox_aggregate ON public.outbox_events(aggregate_type, aggregate_id);
CREATE INDEX IF NOT EXISTS idx_outbox_created_at ON public.outbox_events(created_at DESC);


-- ============================================
-- SEED de eventos outbox: proyectar el catálogo sembrado (0005) a Firestore
-- al arrancar el sweeper. version=0 → aplica siempre que el doc no tenga
-- una versión mayor. Requiere outbox_events — por eso vive aquí y no en 0005.
-- ============================================
-- Outbox: proyectar el catálogo a Firestore al arrancar el sweeper
-- (version=0 → aplica siempre que el doc no tenga una versión mayor).
INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload, schema_version, status)
SELECT 'service.upserted', 'service', s.code,
       jsonb_build_object('code', s.code, 'version', 0), 1, 'pending'
FROM public.services s
WHERE NOT EXISTS (SELECT 1 FROM public.outbox_events e
                  WHERE e.aggregate_type = 'service' AND e.aggregate_id = s.code
                    AND e.status = 'pending');

INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload, schema_version, status)
SELECT 'feature.upserted', 'feature', f.code,
       jsonb_build_object('code', f.code, 'version', 0), 1, 'pending'
FROM public.features f
WHERE NOT EXISTS (SELECT 1 FROM public.outbox_events e
                  WHERE e.aggregate_type = 'feature' AND e.aggregate_id = f.code
                    AND e.status = 'pending');

INSERT INTO public.outbox_events (event_type, aggregate_type, aggregate_id, payload, schema_version, status)
SELECT 'surge_rules.changed', 'pricing', 'surge',
       jsonb_build_object('version', 0), 1, 'pending'
WHERE NOT EXISTS (SELECT 1 FROM public.outbox_events e
                  WHERE e.aggregate_type = 'pricing' AND e.aggregate_id = 'surge'
                    AND e.status = 'pending');


COMMIT;
