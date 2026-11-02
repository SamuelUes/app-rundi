-- ============================================================================
-- 0001_enums.sql — Tipos ENUM unificados para Cloud SQL PostgreSQL 17
-- Fuente: database/status-enum-types.sql + database/migration.sql (compliance)
-- Idempotente: CREATE TYPE envuelto en DO ... EXCEPTION WHEN duplicate_object.
-- SIN dependencias de Supabase (no auth.*, no roles anon/authenticated).
--
-- Regla: solo existen enums que están aplicados a columnas reales. Los
-- catálogos legales amplios (clases de circulación, aseguradoras, tipos de
-- combustible) se manejan como VARCHAR/CHECK en su tabla porque el dominio
-- real es más amplio que el enum y lo ingresa OCR/usuario.
-- ============================================================================

BEGIN;

-- --- Identidad / conductores ---
DO $$ BEGIN CREATE TYPE public.driver_account_status AS ENUM
  ('pending', 'active', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.driver_documents_status AS ENUM
  ('pending', 'verified', 'active', 'suspended', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.designated_role_request_status AS ENUM
  ('pending', 'requested', 'verified', 'rejected', 'revoked');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;


-- -- --- Vehículos (catálogos tarjeta de circulación NI) ---
-- DO $$ BEGIN CREATE TYPE public.vehicle_body_type AS ENUM
--   ('auto', 'moto', 'suv', 'pickup');
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DO $$ BEGIN CREATE TYPE public.vehicle_fuel_type AS ENUM
--   ('Gasolina', 'Diesel', 'Eléctrico', 'Híbrido');
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DO $$ BEGIN CREATE TYPE public.vehicle_circulation_class AS ENUM
--   ('PARTICULAR', 'PÚBLICO', 'OFICIAL');
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DO $$ BEGIN CREATE TYPE public.vehicle_circulation_service AS ENUM
--   ('PRIVADO', 'PÚBLICO', 'TAXI', 'ALQUILER');
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- DO $$ BEGIN CREATE TYPE public.vehicle_insurance_company AS ENUM
--   ('INISER', 'Seguros América', 'Lafise Seguros', 'Banpro Seguros',
--    'ASSA', 'Mapfre', 'Seguros Atlántida', 'Otra');
-- EXCEPTION WHEN duplicate_object THEN NULL; END $$;


DO $$ BEGIN CREATE TYPE public.app_role AS ENUM
  ('client', 'driver', 'designated_driver', 'operator', 'admin', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.app_role IS 'Roles de la plataforma (5 roles funcionales + system). actor_role usa subconjunto client|driver|operator|admin|system';

-- --- Viajes ---
DO $$ BEGIN CREATE TYPE public.ride_status AS ENUM
  ('requested', 'driver_offered', 'accepted', 'driver_on_route', 'driver_arrived',
   'in_progress', 'pending_payment', 'rating_completed', 'rating_skipped',
   'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.ride_status IS 'Dominio SQL de rides.status. RTDB usaba además ''searching''/''pending_rating'' (estado derivado/live, no terminal): mapearlos en trips_live, no aquí.';

DO $$ BEGIN CREATE TYPE public.ride_canceled_by AS ENUM ('client', 'driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ride_follower_status AS ENUM
  ('active', 'completed', 'abandoned', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ride_type AS ENUM ('normal', 'designated_driver');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.designated_driver_vehicle AS ENUM ('auto', 'moto');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ride_payment_type AS ENUM ('cash', 'card_local', 'stripe');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.ride_payment_type IS '''stripe'' queda solo por compatibilidad histórica; no emitir nuevos valores.';

DO $$ BEGIN CREATE TYPE public.biometric_type AS ENUM
  ('fingerprint', 'face_id', 'biometric', 'NOT_SUPPORTED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.ride_location_type AS ENUM
  ('origin', 'waypoint', 'destination');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.ride_location_type IS 'Ruta contratada únicamente. Las muestras GPS (antes type=''tracking'') viven en ride_track_points.';

-- --- Ofertas a conductores (auditoría §7.1 del doc) ---
DO $$ BEGIN CREATE TYPE public.ride_offer_kind AS ENUM
  ('offer', 'counter_offer');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.ride_offer_kind IS 'offer = despachada por matching; counter_offer = contraoferta de precio del conductor.';

DO $$ BEGIN CREATE TYPE public.ride_offer_status AS ENUM
  ('sent', 'accepted', 'rejected', 'expired', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Pagos ---
DO $$ BEGIN CREATE TYPE public.payment_status AS ENUM
  ('pending', 'pending_confirmation', 'payment_in_progress', 'in_progress',
   'processing', 'pending_capture', 'payment_completed', 'completed',
   'confirmed', 'failed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.commission_status AS ENUM ('pending', 'paid');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.payment_method AS ENUM ('cash', 'card');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.payment_provider AS ENUM ('cash', 'local');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.local_bank AS ENUM
  ('bac', 'banpro', 'lafise', 'ficohsa', 'avanz');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.payment_auth_method AS ENUM
  ('biometric', 'sms', 'manual', 'code');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Billetera del conductor (driver_wallet_movements) ---
DO $$ BEGIN CREATE TYPE public.wallet_movement_type AS ENUM
  ('recharge', 'deduction', 'commission_deduction', 'adjustment');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.wallet_movement_source AS ENUM
  ('manual', 'webhook', 'puntoexpress_webhook', 'ride_payment_completion', 'system');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.wallet_movement_status AS ENUM
  ('pending', 'confirmed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Emergencias / inspecciones ---
DO $$ BEGIN CREATE TYPE public.emergency_type AS ENUM ('police', 'ambulance');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.emergency_call_status AS ENUM
  ('initiated', 'completed', 'canceled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.inspection_status AS ENUM
  ('pending', 'completed', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Llamadas / soporte ---
DO $$ BEGIN CREATE TYPE public.call_session_type AS ENUM ('ride', 'support');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.call_direction AS ENUM
  ('client_to_driver', 'driver_to_client', 'operator_to_client', 'client_to_operator');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.call_direction IS 'Unifica support_call_direction y ride_call_direction; la coherencia con call_session_type se valida por CHECK en call_sessions.';

DO $$ BEGIN CREATE TYPE public.call_status AS ENUM
  ('initiated', 'ringing_client', 'ringing_operator', 'ringing_driver',
   'accepted', 'rejected', 'missed', 'connected', 'ended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.call_status IS 'Unifica support_call_status y ride_call_status (ringing_client|ringing_driver según direction)';

DO $$ BEGIN CREATE TYPE public.complaint_status AS ENUM
  ('open', 'in_progress', 'resolved', 'rejected');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.complaint_priority AS ENUM
  ('low', 'normal', 'high', 'urgent');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.complaint_category AS ENUM
  ('service', 'driver', 'payment', 'app', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.complaint_visibility AS ENUM
  ('All', 'only_platform');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.operator_target_type AS ENUM
  ('ride', 'driver', 'client', 'payment', 'service', 'complaint', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Auditoría ---
DO $$ BEGIN CREATE TYPE public.audit_action AS ENUM
  ('create', 'update', 'delete', 'restore', 'cancel', 'complete');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.audit_entity_type AS ENUM
  ('ride', 'driver', 'driver_service', 'payment', 'rating', 'vehicle',
   'complaint', 'user');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.audit_source AS ENUM
  ('api', 'trigger', 'scheduled', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Compliance documental (de migration.sql) ---
DO $$ BEGIN CREATE TYPE public.document_status AS ENUM
  ('pending', 'in_review', 'verified', 'rejected', 'requires_review', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.verification_method AS ENUM
  ('manual', 'ocr', 'api', 'migrated', 'self_declared');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.license_type AS ENUM
  ('ordinaria', 'profesional', 'menor_de_edad', 'especial', 'permiso');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.insurance_coverage_type AS ENUM
  ('rc_obligatorio', 'pasajeros', 'danios_propios', 'licencia_conductor', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.document_check_result AS ENUM
  ('approved', 'rejected', 'conditional');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.driver_compliance_status AS ENUM
  ('pending_documents', 'under_review', 'verified', 'expiring',
   'non_compliant', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN CREATE TYPE public.vehicle_compliance_status AS ENUM
  ('pending_verification', 'active', 'non_compliant',
   'expired_documents', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- --- Outbox (FASE 1 doc §6.1) ---
DO $$ BEGIN CREATE TYPE public.outbox_status AS ENUM
  ('pending', 'published', 'failed');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
COMMENT ON TYPE public.outbox_status IS 'pending → published (proyección ok) | failed (terminal tras max_attempts; dead-letter para alertas/reproceso manual).';

COMMIT;
