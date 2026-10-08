-- ============================================
-- ENUM TYPES PARA COLUMNAS DE STATUS / CATÁLOGOS
-- ============================================
-- Estandariza como enum types los VARCHAR de estado del esquema.
-- Dominios tomados de los CHECK constraints, COMMENT ON COLUMN y los
-- valores escritos por el backend (functions/src) — verificado 2026-10-06.
--
-- En Supabase UI los tipos aparecen en "Other types" al editar la columna.
--
-- Columnas que quedan en VARCHAR deliberadamente (vocabulario abierto):
--   driver_penalties.penalty_type
--   analytics_events.event_type, analytics_events.platform
--   biometric_authentications.user_type / .context
--   sms_verification_codes.context
--   cms_operator_actions.action_type
--   cards.card_brand, cards.bank_name
--   vehicles.lien
-- ============================================

-- --------------------------------------------
-- 1. CREAR ENUM TYPES
-- --------------------------------------------

-- drivers
CREATE TYPE public.driver_account_status AS ENUM
  ('pending', 'active', 'suspended', 'rejected');
COMMENT ON TYPE public.driver_account_status IS 'drivers.account_status — estado administrativo de la cuenta';

CREATE TYPE public.driver_documents_status AS ENUM
  ('pending', 'verified', 'active', 'suspended', 'rejected');
COMMENT ON TYPE public.driver_documents_status IS 'drivers.documents_status — incluye ''active'' observado en datos reales (fuera del COMMENT original)';

CREATE TYPE public.designated_role_request_status AS ENUM
  ('pending', 'requested', 'verified', 'rejected', 'revoked');
COMMENT ON TYPE public.designated_role_request_status IS 'drivers.designated_rol_requested — incluye ''requested'' que escribe el backend al registrar la solicitud';

-- vehicles
CREATE TYPE public.vehicle_body_type AS ENUM
  ('auto', 'moto', 'suv', 'pickup');
COMMENT ON TYPE public.vehicle_body_type IS 'vehicles.type';

CREATE TYPE public.vehicle_fuel_type AS ENUM
  ('Gasolina', 'Diesel', 'Eléctrico', 'Híbrido');
COMMENT ON TYPE public.vehicle_fuel_type IS 'vehicles.fuel_type — tarjeta de circulación NI';

CREATE TYPE public.vehicle_circulation_class AS ENUM
  ('PARTICULAR', 'PÚBLICO', 'OFICIAL');
COMMENT ON TYPE public.vehicle_circulation_class IS 'vehicles.vehicle_class';

CREATE TYPE public.vehicle_circulation_service AS ENUM
  ('PRIVADO', 'PÚBLICO', 'TAXI', 'ALQUILER');
COMMENT ON TYPE public.vehicle_circulation_service IS 'vehicles.service_type';

CREATE TYPE public.vehicle_insurance_company AS ENUM
  ('INISER', 'Seguros América', 'Lafise Seguros', 'Banpro Seguros',
   'ASSA', 'Mapfre', 'Seguros Atlántida', 'Otra');
COMMENT ON TYPE public.vehicle_insurance_company IS 'vehicles.insurance_company — aseguradoras de Nicaragua; ''Otra'' cubre valores fuera del catálogo';

-- rides
CREATE TYPE public.ride_status AS ENUM
  ('requested', 'driver_offered', 'accepted', 'driver_on_route', 'driver_arrived',
   'in_progress', 'pending_payment', 'rating_completed', 'rating_skipped',
   'completed', 'canceled');
COMMENT ON TYPE public.ride_status IS 'rides.status — mismo dominio que rides_status_check';

CREATE TYPE public.ride_canceled_by AS ENUM ('client', 'driver');
COMMENT ON TYPE public.ride_canceled_by IS 'rides.canceled_by — quién canceló el viaje';

CREATE TYPE public.ride_type AS ENUM ('normal', 'designated_driver');
COMMENT ON TYPE public.ride_type IS 'rides.ride_type';

CREATE TYPE public.ride_vehicle_type AS ENUM ('auto', 'moto', 'designated_driver');
COMMENT ON TYPE public.ride_vehicle_type IS 'rides.vehicle_type — normalizeVehicleType() converge a estos valores';

CREATE TYPE public.designated_driver_vehicle AS ENUM ('auto', 'moto');
COMMENT ON TYPE public.designated_driver_vehicle IS 'rides.designated_driver_vehicle — vehículo del cliente en conductor designado';

CREATE TYPE public.ride_payment_type AS ENUM ('cash', 'card_local', 'stripe');
COMMENT ON TYPE public.ride_payment_type IS 'rides.payment_type';

CREATE TYPE public.biometric_type AS ENUM
  ('fingerprint', 'face_id', 'biometric', 'NOT_SUPPORTED');
COMMENT ON TYPE public.biometric_type IS 'biometría: fingerprint | face_id; ''biometric'' genérico y ''NOT_SUPPORTED'' llegan desde RTDB paymentStatus';

CREATE TYPE public.ride_location_type AS ENUM
  ('origin', 'waypoint', 'destination', 'tracking');
COMMENT ON TYPE public.ride_location_type IS 'ride_locations.location_type — ''tracking'' lo usa get_ride_tracking()';

-- payments
CREATE TYPE public.payment_status AS ENUM
  ('pending', 'pending_confirmation', 'payment_in_progress', 'in_progress',
   'processing', 'pending_capture', 'payment_completed', 'completed',
   'confirmed', 'failed', 'canceled');
COMMENT ON TYPE public.payment_status IS 'payments.status — incluye estados intermedios de RTDB paymentStatus porque savePaymentToSupabase copia el status crudo';

CREATE TYPE public.commission_status AS ENUM ('pending', 'paid');
COMMENT ON TYPE public.commission_status IS 'payments.commission_status — liquidación de comisión del conductor';

CREATE TYPE public.payment_method AS ENUM ('cash', 'card');
COMMENT ON TYPE public.payment_method IS 'payments.payment_method';

CREATE TYPE public.payment_provider AS ENUM ('cash', 'local');
COMMENT ON TYPE public.payment_provider IS 'payments.payment_provider';

CREATE TYPE public.local_bank AS ENUM ('bac', 'banpro', 'lafise', 'ficohsa', 'avanz');
COMMENT ON TYPE public.local_bank IS 'payments.local_bank — bancos locales de Nicaragua';

CREATE TYPE public.payment_auth_method AS ENUM ('biometric', 'sms', 'manual', 'code');
COMMENT ON TYPE public.payment_auth_method IS 'payments.authentication_method — ''code'' lo escribe generateCashCode vía RTDB';

-- drivers_recharges (billetera PuntoExpress)
CREATE TYPE public.recharge_movement_type AS ENUM
  ('recharge', 'deduction', 'commission_deduction', 'adjustment');
COMMENT ON TYPE public.recharge_movement_type IS 'drivers_recharges.recharge_type — ''commission_deduction'' lo usa DriverRechargeRepository';

CREATE TYPE public.recharge_source AS ENUM
  ('manual', 'webhook', 'puntoexpress_webhook', 'ride_payment_completion', 'system');
COMMENT ON TYPE public.recharge_source IS 'drivers_recharges.source — origen del movimiento de fondos';

CREATE TYPE public.recharge_status AS ENUM ('pending', 'confirmed', 'failed');
COMMENT ON TYPE public.recharge_status IS 'drivers_recharges.status';

-- driver_penalties (legacy)
CREATE TYPE public.penalty_status AS ENUM ('pending', 'applied', 'canceled');
COMMENT ON TYPE public.penalty_status IS 'driver_penalties.status — tabla legacy reemplazada por drivers_recharges';

-- emergency_calls
CREATE TYPE public.emergency_type AS ENUM ('police', 'ambulance');
COMMENT ON TYPE public.emergency_type IS 'emergency_calls.emergency_type — police (118) | ambulance (102)';

CREATE TYPE public.emergency_call_status AS ENUM ('initiated', 'completed', 'canceled');
COMMENT ON TYPE public.emergency_call_status IS 'emergency_calls.call_status';

-- designated_driver_inspections
CREATE TYPE public.inspection_status AS ENUM ('pending', 'completed', 'failed');
COMMENT ON TYPE public.inspection_status IS 'designated_driver_inspections.status';

-- services
CREATE TYPE public.service_code AS ENUM
  ('normal', 'motorcycle', 'designated_driver_auto', 'designated_driver_moto',
   'night', 'designated_driver');
COMMENT ON TYPE public.service_code IS 'services.code — ''designated_driver'' es el código legado en get_driver_commission_rate()';

-- support_call_sessions (WebRTC)
CREATE TYPE public.support_call_direction AS ENUM
  ('operator_to_client', 'client_to_operator');
COMMENT ON TYPE public.support_call_direction IS 'support_call_sessions.direction y cms_complaints.call_direction';

CREATE TYPE public.support_call_status AS ENUM
  ('initiated', 'ringing_client', 'ringing_operator', 'accepted',
   'rejected', 'missed', 'connected', 'ended');
COMMENT ON TYPE public.support_call_status IS 'support_call_sessions.status y cms_complaints.call_status';

-- cms_complaints
CREATE TYPE public.complaint_status AS ENUM
  ('open', 'in_progress', 'resolved', 'rejected');
COMMENT ON TYPE public.complaint_status IS 'cms_complaints.status';

CREATE TYPE public.complaint_priority AS ENUM ('low', 'normal', 'high', 'urgent');
COMMENT ON TYPE public.complaint_priority IS 'cms_complaints.priority';

CREATE TYPE public.complaint_category AS ENUM
  ('service', 'driver', 'payment', 'app', 'other');
COMMENT ON TYPE public.complaint_category IS 'cms_complaints.category';

CREATE TYPE public.complaint_visibility AS ENUM ('All', 'only_platform');
COMMENT ON TYPE public.complaint_visibility IS 'cms_complaints.show — ''only_platform'' oculta el ticket en la app';

-- roles compartidos
CREATE TYPE public.app_role AS ENUM
  ('client', 'driver', 'operator', 'admin', 'system');
COMMENT ON TYPE public.app_role IS 'Rol de usuario/actor: emergency_calls.user_role, cms_complaints.created_by_role, cms_operator_actions.user_role, audit_log.actor_role';

-- cms_operator_actions
CREATE TYPE public.operator_target_type AS ENUM
  ('ride', 'driver', 'client', 'payment', 'service', 'complaint', 'other');
COMMENT ON TYPE public.operator_target_type IS 'cms_operator_actions.target_type';

-- audit_log
CREATE TYPE public.audit_action AS ENUM
  ('create', 'update', 'delete', 'restore', 'cancel', 'complete');
COMMENT ON TYPE public.audit_action IS 'audit_log.action';

CREATE TYPE public.audit_entity_type AS ENUM
  ('ride', 'driver', 'payment', 'rating', 'vehicle', 'complaint', 'user');
COMMENT ON TYPE public.audit_entity_type IS 'audit_log.entity_type';

CREATE TYPE public.audit_source AS ENUM ('api', 'trigger', 'scheduled', 'manual');
COMMENT ON TYPE public.audit_source IS 'audit_log.source';

-- --------------------------------------------
-- 2. PRE-FLIGHT: abortar si hay datos fuera de dominio
-- --------------------------------------------
DO $$
DECLARE
  r RECORD;
  offenders TEXT;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('drivers',                        'account_status',             'driver_account_status'),
      ('drivers',                        'documents_status',           'driver_documents_status'),
      ('drivers',                        'designated_rol_requested',   'designated_role_request_status'),
      ('vehicles',                       'type',                       'vehicle_body_type'),
      ('vehicles',                       'fuel_type',                  'vehicle_fuel_type'),
      ('vehicles',                       'vehicle_class',              'vehicle_circulation_class'),
      ('vehicles',                       'service_type',               'vehicle_circulation_service'),
      ('vehicles',                       'insurance_company',          'vehicle_insurance_company'),
      ('rides',                          'status',                     'ride_status'),
      ('rides',                          'canceled_by',                'ride_canceled_by'),
      ('rides',                          'ride_type',                  'ride_type'),
      ('rides',                          'vehicle_type',               'ride_vehicle_type'),
      ('rides',                          'designated_driver_vehicle',  'designated_driver_vehicle'),
      ('rides',                          'payment_type',               'ride_payment_type'),
      ('rides',                          'biometric_acceptance_type',  'biometric_type'),
      ('ride_locations',                 'location_type',              'ride_location_type'),
      ('payments',                       'status',                     'payment_status'),
      ('payments',                       'commission_status',          'commission_status'),
      ('payments',                       'payment_method',             'payment_method'),
      ('payments',                       'payment_provider',           'payment_provider'),
      ('payments',                       'local_bank',                 'local_bank'),
      ('payments',                       'biometric_type',             'biometric_type'),
      ('payments',                       'authentication_method',      'payment_auth_method'),
      ('drivers_recharges',              'recharge_type',              'recharge_movement_type'),
      ('drivers_recharges',              'source',                     'recharge_source'),
      ('drivers_recharges',              'status',                     'recharge_status'),
      ('driver_penalties',               'status',                     'penalty_status'),
      ('emergency_calls',                'user_role',                  'app_role'),
      ('emergency_calls',                'emergency_type',             'emergency_type'),
      ('emergency_calls',                'call_status',                'emergency_call_status'),
      ('designated_driver_inspections',  'status',                     'inspection_status'),
      ('services',                       'code',                       'service_code'),
      ('biometric_authentications',      'biometric_type',             'biometric_type'),
      ('support_call_sessions',          'direction',                  'support_call_direction'),
      ('support_call_sessions',          'status',                     'support_call_status'),
      ('cms_complaints',                 'created_by_role',            'app_role'),
      ('cms_complaints',                 'category',                   'complaint_category'),
      ('cms_complaints',                 'status',                     'complaint_status'),
      ('cms_complaints',                 'priority',                   'complaint_priority'),
      ('cms_complaints',                 'show',                       'complaint_visibility'),
      ('cms_complaints',                 'call_status',                'support_call_status'),
      ('cms_complaints',                 'call_direction',             'support_call_direction'),
      ('cms_operator_actions',           'user_role',                  'app_role'),
      ('cms_operator_actions',           'target_type',                'operator_target_type'),
      ('audit_log',                      'actor_role',                 'app_role'),
      ('audit_log',                      'action',                     'audit_action'),
      ('audit_log',                      'entity_type',                'audit_entity_type'),
      ('audit_log',                      'source',                     'audit_source')
    ) AS t(tbl, col, enm)
  LOOP
    EXECUTE format(
      'SELECT string_agg(DISTINCT quote_literal(v), '', '') FROM (
         SELECT %I::text AS v
         FROM public.%I
         WHERE %I IS NOT NULL
           AND BTRIM(%I) <> ''''
           AND %I::text <> ALL (SELECT unnest(ENUM_RANGE(NULL::public.%I))::text)
       ) s',
      r.col, r.tbl, r.col, r.col, r.col, r.enm)
    INTO offenders;

    IF offenders IS NOT NULL THEN
      RAISE EXCEPTION 'public.%.% tiene valores fuera del enum %: %',
        r.tbl, r.col, r.enm, offenders;
    END IF;
  END LOOP;
END $$;

-- --------------------------------------------
-- 3. DROP DE VISTAS DEPENDIENTES
--    rides_with_complete_route usa r.* (bloquea cualquier columna de rides);
--    services_stats usa rides.status / payments.*; driver_active_services
--    usa services.code. Se recrean idénticas en el paso 5.
-- --------------------------------------------

DROP VIEW IF EXISTS public.rides_with_complete_route;
DROP VIEW IF EXISTS public.services_stats;
DROP VIEW IF EXISTS public.driver_active_services;

-- trigger_audit_ride_status es AFTER UPDATE OF status: depende de rides.status
-- y bloquea el ALTER. La función audit_ride_status_change() se conserva.
DROP TRIGGER IF EXISTS trigger_audit_ride_status ON public.rides;

-- El índice parcial WHERE commission_status = 'pending' bloquea la conversión
-- de payments.commission_status (el literal re-castea a enum en el predicado).
-- Se recrea en el paso 5.
DROP INDEX IF EXISTS public.idx_payments_commission_status;

-- --------------------------------------------
-- 4. CONVERTIR COLUMNAS A ENUM
--    (NULLIF(BTRIM(...),'') normaliza strings vacíos a NULL en columnas nullable)
-- --------------------------------------------

ALTER TABLE public.drivers
  ALTER COLUMN account_status DROP DEFAULT,
  ALTER COLUMN documents_status DROP DEFAULT,
  ALTER COLUMN designated_rol_requested DROP DEFAULT,
  ALTER COLUMN account_status TYPE public.driver_account_status
    USING NULLIF(BTRIM(account_status), '')::public.driver_account_status,
  ALTER COLUMN documents_status TYPE public.driver_documents_status
    USING NULLIF(BTRIM(documents_status), '')::public.driver_documents_status,
  ALTER COLUMN designated_rol_requested TYPE public.designated_role_request_status
    USING NULLIF(BTRIM(designated_rol_requested), '')::public.designated_role_request_status,
  ALTER COLUMN account_status SET DEFAULT 'pending'::public.driver_account_status,
  ALTER COLUMN documents_status SET DEFAULT 'pending'::public.driver_documents_status,
  ALTER COLUMN designated_rol_requested SET DEFAULT 'pending'::public.designated_role_request_status;

ALTER TABLE public.vehicles
  ALTER COLUMN type DROP DEFAULT,
  ALTER COLUMN type TYPE public.vehicle_body_type
    USING NULLIF(BTRIM(type), '')::public.vehicle_body_type,
  ALTER COLUMN fuel_type TYPE public.vehicle_fuel_type
    USING NULLIF(BTRIM(fuel_type), '')::public.vehicle_fuel_type,
  ALTER COLUMN vehicle_class TYPE public.vehicle_circulation_class
    USING NULLIF(BTRIM(vehicle_class), '')::public.vehicle_circulation_class,
  ALTER COLUMN service_type TYPE public.vehicle_circulation_service
    USING NULLIF(BTRIM(service_type), '')::public.vehicle_circulation_service,
  ALTER COLUMN insurance_company TYPE public.vehicle_insurance_company
    USING NULLIF(BTRIM(insurance_company), '')::public.vehicle_insurance_company,
  ALTER COLUMN type SET DEFAULT 'auto'::public.vehicle_body_type;

ALTER TABLE public.rides
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN ride_type DROP DEFAULT,
  ALTER COLUMN vehicle_type DROP DEFAULT,
  ALTER COLUMN payment_type DROP DEFAULT,
  ALTER COLUMN status TYPE public.ride_status
    USING NULLIF(BTRIM(status), '')::public.ride_status,
  ALTER COLUMN canceled_by TYPE public.ride_canceled_by
    USING NULLIF(BTRIM(canceled_by), '')::public.ride_canceled_by,
  ALTER COLUMN ride_type TYPE public.ride_type
    USING NULLIF(BTRIM(ride_type), '')::public.ride_type,
  ALTER COLUMN vehicle_type TYPE public.ride_vehicle_type
    USING NULLIF(BTRIM(vehicle_type), '')::public.ride_vehicle_type,
  ALTER COLUMN designated_driver_vehicle TYPE public.designated_driver_vehicle
    USING NULLIF(BTRIM(designated_driver_vehicle), '')::public.designated_driver_vehicle,
  ALTER COLUMN payment_type TYPE public.ride_payment_type
    USING NULLIF(BTRIM(payment_type), '')::public.ride_payment_type,
  ALTER COLUMN biometric_acceptance_type TYPE public.biometric_type
    USING NULLIF(BTRIM(biometric_acceptance_type), '')::public.biometric_type,
  ALTER COLUMN status SET DEFAULT 'requested'::public.ride_status,
  ALTER COLUMN ride_type SET DEFAULT 'normal'::public.ride_type,
  ALTER COLUMN vehicle_type SET DEFAULT 'auto'::public.ride_vehicle_type,
  ALTER COLUMN payment_type SET DEFAULT 'cash'::public.ride_payment_type;

ALTER TABLE public.ride_locations
  ALTER COLUMN location_type TYPE public.ride_location_type
    USING BTRIM(location_type)::public.ride_location_type;

ALTER TABLE public.payments
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN authentication_method DROP DEFAULT,
  ALTER COLUMN status TYPE public.payment_status
    USING NULLIF(BTRIM(status), '')::public.payment_status,
  ALTER COLUMN commission_status TYPE public.commission_status
    USING NULLIF(BTRIM(commission_status), '')::public.commission_status,
  ALTER COLUMN payment_method TYPE public.payment_method
    USING NULLIF(BTRIM(payment_method), '')::public.payment_method,
  ALTER COLUMN payment_provider TYPE public.payment_provider
    USING NULLIF(BTRIM(payment_provider), '')::public.payment_provider,
  ALTER COLUMN local_bank TYPE public.local_bank
    USING NULLIF(BTRIM(local_bank), '')::public.local_bank,
  ALTER COLUMN biometric_type TYPE public.biometric_type
    USING NULLIF(BTRIM(biometric_type), '')::public.biometric_type,
  ALTER COLUMN authentication_method TYPE public.payment_auth_method
    USING NULLIF(BTRIM(authentication_method), '')::public.payment_auth_method,
  ALTER COLUMN status SET DEFAULT 'pending'::public.payment_status,
  ALTER COLUMN authentication_method SET DEFAULT 'manual'::public.payment_auth_method;

ALTER TABLE public.drivers_recharges
  ALTER COLUMN recharge_type DROP DEFAULT,
  ALTER COLUMN source DROP DEFAULT,
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN recharge_type TYPE public.recharge_movement_type
    USING BTRIM(recharge_type)::public.recharge_movement_type,
  ALTER COLUMN source TYPE public.recharge_source
    USING BTRIM(source)::public.recharge_source,
  ALTER COLUMN status TYPE public.recharge_status
    USING BTRIM(status)::public.recharge_status,
  ALTER COLUMN recharge_type SET DEFAULT 'recharge'::public.recharge_movement_type,
  ALTER COLUMN source SET DEFAULT 'manual'::public.recharge_source,
  ALTER COLUMN status SET DEFAULT 'confirmed'::public.recharge_status;

ALTER TABLE public.driver_penalties
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.penalty_status
    USING NULLIF(BTRIM(status), '')::public.penalty_status,
  ALTER COLUMN status SET DEFAULT 'pending'::public.penalty_status;

ALTER TABLE public.emergency_calls
  ALTER COLUMN call_status DROP DEFAULT,
  ALTER COLUMN user_role TYPE public.app_role
    USING BTRIM(user_role)::public.app_role,
  ALTER COLUMN emergency_type TYPE public.emergency_type
    USING BTRIM(emergency_type)::public.emergency_type,
  ALTER COLUMN call_status TYPE public.emergency_call_status
    USING NULLIF(BTRIM(call_status), '')::public.emergency_call_status,
  ALTER COLUMN call_status SET DEFAULT 'initiated'::public.emergency_call_status;

ALTER TABLE public.designated_driver_inspections
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN status TYPE public.inspection_status
    USING NULLIF(BTRIM(status), '')::public.inspection_status,
  ALTER COLUMN status SET DEFAULT 'completed'::public.inspection_status;

ALTER TABLE public.services
  ALTER COLUMN code TYPE public.service_code
    USING BTRIM(code)::public.service_code;

ALTER TABLE public.biometric_authentications
  ALTER COLUMN biometric_type TYPE public.biometric_type
    USING BTRIM(biometric_type)::public.biometric_type;

ALTER TABLE public.support_call_sessions
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN direction TYPE public.support_call_direction
    USING BTRIM(direction)::public.support_call_direction,
  ALTER COLUMN status TYPE public.support_call_status
    USING BTRIM(status)::public.support_call_status,
  ALTER COLUMN status SET DEFAULT 'initiated'::public.support_call_status;

ALTER TABLE public.cms_complaints
  ALTER COLUMN status DROP DEFAULT,
  ALTER COLUMN show DROP DEFAULT,
  ALTER COLUMN created_by_role TYPE public.app_role
    USING BTRIM(created_by_role)::public.app_role,
  ALTER COLUMN category TYPE public.complaint_category
    USING BTRIM(category)::public.complaint_category,
  ALTER COLUMN status TYPE public.complaint_status
    USING BTRIM(status)::public.complaint_status,
  ALTER COLUMN priority TYPE public.complaint_priority
    USING NULLIF(BTRIM(priority), '')::public.complaint_priority,
  ALTER COLUMN show TYPE public.complaint_visibility
    USING BTRIM(show)::public.complaint_visibility,
  ALTER COLUMN call_status TYPE public.support_call_status
    USING NULLIF(BTRIM(call_status), '')::public.support_call_status,
  ALTER COLUMN call_direction TYPE public.support_call_direction
    USING NULLIF(BTRIM(call_direction), '')::public.support_call_direction,
  ALTER COLUMN status SET DEFAULT 'open'::public.complaint_status,
  ALTER COLUMN show SET DEFAULT 'All'::public.complaint_visibility;

ALTER TABLE public.cms_operator_actions
  ALTER COLUMN user_role TYPE public.app_role
    USING BTRIM(user_role)::public.app_role,
  ALTER COLUMN target_type TYPE public.operator_target_type
    USING NULLIF(BTRIM(target_type), '')::public.operator_target_type;

ALTER TABLE public.audit_log
  ALTER COLUMN source DROP DEFAULT,
  ALTER COLUMN actor_role TYPE public.app_role
    USING BTRIM(actor_role)::public.app_role,
  ALTER COLUMN action TYPE public.audit_action
    USING BTRIM(action)::public.audit_action,
  ALTER COLUMN entity_type TYPE public.audit_entity_type
    USING BTRIM(entity_type)::public.audit_entity_type,
  ALTER COLUMN source TYPE public.audit_source
    USING NULLIF(BTRIM(source), '')::public.audit_source,
  ALTER COLUMN source SET DEFAULT 'api'::public.audit_source;

-- --------------------------------------------
-- 5. RECREAR VISTAS (idénticas a supabase-only.sql)
-- --------------------------------------------

CREATE VIEW public.rides_with_complete_route AS
SELECT
  r.*,
  -- Origen
  rl_origin.id          AS origin_location_id_detail,
  rl_origin.latitude    AS origin_latitude,
  rl_origin.longitude   AS origin_longitude,
  rl_origin.address     AS origin_address,
  -- Destino
  rl_dest.id            AS destination_location_id_detail,
  rl_dest.latitude      AS destination_latitude,
  rl_dest.longitude     AS destination_longitude,
  rl_dest.address       AS destination_address,
  -- Paradas intermedias
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', w.id,
        'lat', w.latitude,
        'lng', w.longitude,
        'address', w.address,
        'location_order', w.location_order
      )
      ORDER BY w.location_order
    )
    FROM public.ride_locations w
    WHERE w.ride_id = r.id
      AND w.location_type = 'waypoint'
  ), '[]'::json) AS waypoints
FROM public.rides r
LEFT JOIN public.ride_locations rl_origin
  ON rl_origin.ride_id = r.id AND rl_origin.location_type = 'origin'
LEFT JOIN public.ride_locations rl_dest
  ON rl_dest.ride_id = r.id AND rl_dest.location_type = 'destination';

COMMENT ON VIEW public.rides_with_complete_route IS 'Vista de viajes con origen, destino y paradas intermedias normalizadas en ride_locations';

CREATE VIEW public.driver_active_services AS
SELECT
  d.id              AS driver_id,
  d.user_id         AS driver_uid,
  s.id              AS service_id,
  s.code            AS service_code,
  s.name            AS service_name,
  COALESCE(ds.custom_commission_rate, s.commission_rate) AS commission_rate,
  ds.is_active,
  ds.is_approved,
  ds.assigned_at,
  ds.expires_at
FROM public.driver_services ds
JOIN public.drivers d   ON ds.driver_id = d.id
JOIN public.services s  ON ds.service_id = s.id
WHERE ds.is_active = TRUE
  AND ds.is_approved = TRUE;

COMMENT ON VIEW public.driver_active_services IS 'Servicios activos asignados a cada conductor con comisión efectiva';

CREATE VIEW public.services_stats AS
SELECT
  s.id                                 AS service_id,
  s.code                               AS service_code,
  s.name                               AS service_name,
  COUNT(DISTINCT r.id)                 AS total_rides,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) AS completed_rides,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) AS total_revenue,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.commission ELSE 0 END), 0) AS total_commission,
  COALESCE(AVG(CASE WHEN p.status = 'completed' THEN p.amount END), 0) AS average_fare
FROM public.services s
LEFT JOIN public.rides r
  ON r.service_id = s.id
LEFT JOIN public.payments p
  ON p.ride_id = r.id
GROUP BY s.id, s.code, s.name;

COMMENT ON VIEW public.services_stats IS 'Estadísticas agregadas por servicio: viajes, ingresos y comisiones';

-- Restaurar opciones de seguridad del esquema remoto
ALTER VIEW public.rides_with_complete_route SET (security_invoker = true);
ALTER VIEW public.driver_active_services SET (security_invoker = true, security_barrier = true);
ALTER VIEW public.services_stats SET (security_invoker = true, security_barrier = true);

-- Recrear el trigger de auditoría de rides.status
CREATE TRIGGER trigger_audit_ride_status
AFTER UPDATE OF status ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.audit_ride_status_change();

-- Recrear el índice parcial de comisiones pendientes (predicado ya sobre enum)
CREATE INDEX IF NOT EXISTS idx_payments_commission_status
  ON public.payments USING btree (commission_status)
  WHERE commission_status = 'pending'::public.commission_status;

-- --------------------------------------------
-- 6. ELIMINAR CHECK CONSTRAINTS REDUNDANTES
--    (el enum type ya garantiza el dominio)
-- --------------------------------------------

ALTER TABLE public.rides DROP CONSTRAINT IF EXISTS rides_status_check;
ALTER TABLE public.rides DROP CONSTRAINT IF EXISTS rides_canceled_by_check;
ALTER TABLE public.support_call_sessions DROP CONSTRAINT IF EXISTS support_call_sessions_direction_check;
ALTER TABLE public.support_call_sessions DROP CONSTRAINT IF EXISTS support_call_sessions_status_check;
