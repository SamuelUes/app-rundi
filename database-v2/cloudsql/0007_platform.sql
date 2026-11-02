-- ============================================================================
-- 0007_platform.sql — soporte/operación/analytics/auditoría + call_sessions.
-- Fuente: supabase-only.sql §8,§15-§17,§24-§25. Crea el trigger de auditoría
-- de rides (función definida en 0003) una vez existe audit_log.
-- Cambios:
--   * cms_complaints → support_complaints (columna show → visibility)
--   * cms_operator_actions → operator_actions
--   * support_call_sessions + ride_call_sessions → call_sessions UNIFICADA
--     (call_type discrimina; CHECK coherencia direction↔type)
--   * enums aplicados: complaint_*, operator_target_type, audit_*,
--     call_session_type/call_direction/call_status, app_role en actores
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- ============================================
-- ANALYTICS_EVENTS
-- ============================================
CREATE TABLE IF NOT EXISTS public.analytics_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NULL,
  event_type VARCHAR(50) NOT NULL,
  event_data JSONB NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  platform VARCHAR(20) NULL,
  app_version VARCHAR(20) NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT analytics_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_analytics_events_user_id ON public.analytics_events USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_analytics_events_type ON public.analytics_events USING btree (event_type);
CREATE INDEX IF NOT EXISTS idx_analytics_events_created_at ON public.analytics_events USING btree (created_at DESC);

-- ============================================
-- AUDIT_LOG — append-only
-- ============================================
CREATE TABLE IF NOT EXISTS public.audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  actor_uid TEXT NOT NULL,
  actor_role public.app_role NOT NULL,
  action public.audit_action NOT NULL,
  entity_type public.audit_entity_type NOT NULL,
  entity_id TEXT NOT NULL,
  changes JSONB NULL,
  ip_address INET NULL,
  user_agent TEXT NULL,
  source public.audit_source NULL DEFAULT 'api',
  request_id VARCHAR(64) NULL,                  -- correlación con API/outbox
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT audit_log_pkey PRIMARY KEY (id)
);

-- UPGRADE: request_id si audit_log ya existía.
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);

COMMENT ON TABLE public.audit_log IS 'Append-only. Escriben triggers y backend (rol rundi_app); NUNCA el cliente.';

CREATE INDEX IF NOT EXISTS idx_audit_log_actor_uid ON public.audit_log USING btree (actor_uid);
CREATE INDEX IF NOT EXISTS idx_audit_log_entity ON public.audit_log USING btree (entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_action ON public.audit_log USING btree (action);
CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON public.audit_log USING btree (created_at DESC);

-- Trigger de auditoría de rides (función en 0003_rides.sql)
DROP TRIGGER IF EXISTS trigger_audit_ride_status ON public.rides;
CREATE TRIGGER trigger_audit_ride_status
AFTER UPDATE OF status ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.audit_ride_status_change();

-- ============================================
-- SUPPORT_COMPLAINTS (antes cms_complaints) — tickets de soporte.
-- Paneles de administración leen vía API; SAAS_* en Firestore para dashboards.
-- ============================================
CREATE TABLE IF NOT EXISTS public.support_complaints (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  ride_id UUID NULL,
  client_id VARCHAR(255) NULL,
  driver_id VARCHAR(255) NULL,
  created_by_user_id VARCHAR(255) NOT NULL,
  created_by_role public.app_role NOT NULL,
  assigned_to_user_id VARCHAR(255) NULL,
  category public.complaint_category NOT NULL,
  status public.complaint_status NOT NULL DEFAULT 'open',
  priority public.complaint_priority NULL,
  title TEXT NOT NULL,
  description TEXT NULL,
  resolution_notes TEXT NULL,
  chat_log_url TEXT NULL,
  visibility public.complaint_visibility NOT NULL DEFAULT 'All',   -- antes "show"
  resolved_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT support_complaints_pkey PRIMARY KEY (id),
  CONSTRAINT support_complaints_ride_fkey FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL,
  CONSTRAINT support_complaints_client_fkey FOREIGN KEY (client_id) REFERENCES public.users(id) ON DELETE SET NULL,
  CONSTRAINT support_complaints_driver_fkey FOREIGN KEY (driver_id) REFERENCES public.drivers(user_id) ON DELETE SET NULL,
  CONSTRAINT support_complaints_creator_fkey FOREIGN KEY (created_by_user_id) REFERENCES public.users(id) ON DELETE RESTRICT,
  CONSTRAINT support_complaints_assignee_fkey FOREIGN KEY (assigned_to_user_id) REFERENCES public.users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_support_complaints_ride_id ON public.support_complaints USING btree (ride_id) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_complaints_client_id ON public.support_complaints USING btree (client_id) WHERE client_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_complaints_driver_id ON public.support_complaints USING btree (driver_id) WHERE driver_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_support_complaints_status ON public.support_complaints USING btree (status);
CREATE INDEX IF NOT EXISTS idx_support_complaints_created_at ON public.support_complaints USING btree (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_complaints_deleted_at ON public.support_complaints USING btree (deleted_at) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS update_support_complaints_updated_at ON public.support_complaints;
CREATE TRIGGER update_support_complaints_updated_at BEFORE UPDATE ON public.support_complaints
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================
-- OPERATOR_ACTIONS (antes cms_operator_actions) — acciones de soporte/ops.
-- ============================================
CREATE TABLE IF NOT EXISTS public.operator_actions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  user_id VARCHAR(255) NOT NULL,                -- Firebase UID del operador/admin
  user_role public.app_role NOT NULL,
  action_type VARCHAR(50) NOT NULL,
  target_type public.operator_target_type NULL,
  target_id VARCHAR(255) NULL,
  metadata JSONB NULL,
  ip_address VARCHAR(45) NULL,
  user_agent TEXT NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  CONSTRAINT operator_actions_pkey PRIMARY KEY (id),
  CONSTRAINT operator_actions_user_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS idx_operator_actions_user_id ON public.operator_actions USING btree (user_id);
CREATE INDEX IF NOT EXISTS idx_operator_actions_action_type ON public.operator_actions USING btree (action_type);
CREATE INDEX IF NOT EXISTS idx_operator_actions_target ON public.operator_actions USING btree (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_operator_actions_created_at ON public.operator_actions USING btree (created_at DESC);

-- ============================================
-- CALL_SESSIONS — histórico unificado de llamadas (señalización viva en
-- REALTIME_calls). Antes support_call_sessions + ride_call_sessions
-- (idénticas salvo direction/complaint_id). call_type discrimina el dominio.
-- ============================================
CREATE TABLE IF NOT EXISTS public.call_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  call_id VARCHAR(64) NOT NULL,
  call_type public.call_session_type NOT NULL,
  ride_id VARCHAR(255) NULL,                    -- firebase_ride_id (clave viva)
  complaint_id VARCHAR(255) NULL,               -- solo call_type='support'
  operator_uid VARCHAR(255) NULL,               -- solo call_type='support'
  client_uid VARCHAR(255) NOT NULL,
  driver_uid VARCHAR(255) NULL,                 -- solo call_type='ride'
  direction public.call_direction NOT NULL,
  status public.call_status NOT NULL DEFAULT 'initiated',
  recording_url TEXT NULL,
  signaling_notes JSONB NULL,
  created_at TIMESTAMPTZ NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NULL DEFAULT NOW(),
  connected_at TIMESTAMPTZ NULL,
  ended_at TIMESTAMPTZ NULL,
  CONSTRAINT call_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT call_sessions_call_id_key UNIQUE (call_id),
  CONSTRAINT call_sessions_type_shape_check CHECK (
    (call_type = 'ride'    AND driver_uid IS NOT NULL) OR
    (call_type = 'support' AND operator_uid IS NOT NULL)
  ),
  CONSTRAINT call_sessions_direction_coherence CHECK (
    (call_type = 'ride'    AND direction IN ('client_to_driver','driver_to_client')) OR
    (call_type = 'support' AND direction IN ('operator_to_client','client_to_operator'))
  ),
  CONSTRAINT call_sessions_times_order CHECK (connected_at IS NULL OR ended_at IS NULL OR connected_at <= ended_at)
);
COMMENT ON TABLE public.call_sessions IS 'Histórico de llamadas ride↔support (LiveKit). ride_id es firebase_ride_id (doc vivo), consistente con la fuente RTDB/Firestore original.';

CREATE INDEX IF NOT EXISTS idx_call_sessions_client ON public.call_sessions(client_uid, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_call_sessions_driver ON public.call_sessions(driver_uid, created_at DESC) WHERE driver_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_sessions_ride ON public.call_sessions(ride_id, created_at DESC) WHERE ride_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_sessions_operator ON public.call_sessions(operator_uid, created_at DESC) WHERE operator_uid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_call_sessions_type ON public.call_sessions(call_type, created_at DESC);

COMMIT;
