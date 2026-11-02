-- ============================================================================
-- 0006_compliance.sql — Compliance documental (portado de migration.sql)
-- 12 tablas: reglas + documentos + transversales + eventos.
-- Cambios vs fuente:
--   - ELIMINADOS catálogos sin consumidores: license_types, license_categories,
--     insurers, vehicle_types. El dominio de licencias/aseguradoras ya está en
--     los enums license_type / vehicle_insurance_company (y hardcodeado en la
--     app: constants/insuranceCompanies.ts). Se recrean cuando exista un
--     consumidor real (panel admin de catálogos).
--   - vehicle_insurance_policies.insurer_code queda texto autodeclarado
--     (verification_method='self_declared'); sin FK a tabla eliminada.
--   - document_path* = objectPath en Cloud Storage (GCS), sin RLS.
-- Convención v2: TODOS los timestamps son TIMESTAMPTZ.
-- ============================================================================

BEGIN;

-- ============================================
-- UPGRADE: si las tablas ya existían (deploy viejo) les faltan las columnas
-- modernas que los CREATE IF NOT EXISTS saltan — los índices/funcs de abajo
-- las referencian. Tolerante: to_regclass protege tablas ausentes.
-- ============================================
DO $$
BEGIN
  -- Patrón documental común (7 tablas de documentos)
  IF to_regclass('public.driver_licenses') IS NOT NULL THEN
    ALTER TABLE public.driver_licenses
      ADD COLUMN IF NOT EXISTS categories TEXT[] NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS reported_status VARCHAR(20),
      ADD COLUMN IF NOT EXISTS document_path_back VARCHAR(500),
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.vehicle_circulation_cards') IS NOT NULL THEN
    ALTER TABLE public.vehicle_circulation_cards
      ADD COLUMN IF NOT EXISTS document_path_back VARCHAR(500),
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.vehicle_insurance_policies') IS NOT NULL THEN
    ALTER TABLE public.vehicle_insurance_policies
      ADD COLUMN IF NOT EXISTS document_path_back VARCHAR(500),
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.vehicle_inspections') IS NOT NULL THEN
    ALTER TABLE public.vehicle_inspections
      ADD COLUMN IF NOT EXISTS result public.document_check_result,
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.vehicle_emission_certificates') IS NOT NULL THEN
    ALTER TABLE public.vehicle_emission_certificates
      ADD COLUMN IF NOT EXISTS result public.document_check_result,
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.vehicle_road_taxes') IS NOT NULL THEN
    ALTER TABLE public.vehicle_road_taxes
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.vehicle_revisado_stickers') IS NOT NULL THEN
    ALTER TABLE public.vehicle_revisado_stickers
      ADD COLUMN IF NOT EXISTS status public.document_status NOT NULL DEFAULT 'pending',
      ADD COLUMN IF NOT EXISTS verified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS verified_by TEXT,
      ADD COLUMN IF NOT EXISTS verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
      ADD COLUMN IF NOT EXISTS rejection_reason TEXT,
      ADD COLUMN IF NOT EXISTS review_notes TEXT,
      ADD COLUMN IF NOT EXISTS extracted_data JSONB,
      ADD COLUMN IF NOT EXISTS extraction_confidence NUMERIC(4,3),
      ADD COLUMN IF NOT EXISTS extracted_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS supersedes_id UUID,
      ADD COLUMN IF NOT EXISTS is_current BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
  END IF;
  IF to_regclass('public.license_category_rules') IS NOT NULL THEN
    ALTER TABLE public.license_category_rules
      ADD COLUMN IF NOT EXISTS service_code VARCHAR(30) NOT NULL DEFAULT '*',
      ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'BLOCKING',
      ADD COLUMN IF NOT EXISTS confirmed_by_source BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS legal_source VARCHAR(300),
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
  END IF;
  IF to_regclass('public.compliance_rules') IS NOT NULL THEN
    ALTER TABLE public.compliance_rules
      ADD COLUMN IF NOT EXISTS severity VARCHAR(20) NOT NULL DEFAULT 'WARNING',
      ADD COLUMN IF NOT EXISTS blocking BOOLEAN NOT NULL DEFAULT FALSE,
      ADD COLUMN IF NOT EXISTS enabled BOOLEAN NOT NULL DEFAULT TRUE,
      ADD COLUMN IF NOT EXISTS warning_days INTEGER,
      ADD COLUMN IF NOT EXISTS legal_basis VARCHAR(300),
      ADD COLUMN IF NOT EXISTS params JSONB NOT NULL DEFAULT '{}',
      ADD COLUMN IF NOT EXISTS description VARCHAR(400);
  END IF;
  IF to_regclass('public.compliance_evaluations') IS NOT NULL THEN
    ALTER TABLE public.compliance_evaluations
      ADD COLUMN IF NOT EXISTS service_code VARCHAR(30),
      ADD COLUMN IF NOT EXISTS evaluation_type VARCHAR(20) NOT NULL DEFAULT 'pair',
      ADD COLUMN IF NOT EXISTS rules_version VARCHAR(30),
      ADD COLUMN IF NOT EXISTS evaluated_by TEXT NOT NULL DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  IF to_regclass('public.document_alerts') IS NOT NULL THEN
    ALTER TABLE public.document_alerts
      ADD COLUMN IF NOT EXISTS driver_id UUID,
      ADD COLUMN IF NOT EXISTS vehicle_id UUID,
      ADD COLUMN IF NOT EXISTS due_date DATE,
      ADD COLUMN IF NOT EXISTS warning_days_used INTEGER,
      ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'open',
      ADD COLUMN IF NOT EXISTS notified_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
  END IF;
  IF to_regclass('public.compliance_events') IS NOT NULL THEN
    ALTER TABLE public.compliance_events
      ADD COLUMN IF NOT EXISTS driver_id UUID,
      ADD COLUMN IF NOT EXISTS vehicle_id UUID,
      ADD COLUMN IF NOT EXISTS actor_uid TEXT NOT NULL DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS actor_role VARCHAR(20) NOT NULL DEFAULT 'system',
      ADD COLUMN IF NOT EXISTS payload JSONB;
  END IF;
END $$;

-- --- Reglas legales (leídas por el compliance engine de functions-v2) ---
CREATE TABLE IF NOT EXISTS public.license_category_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_type VARCHAR(30) NOT NULL,             -- 'auto','moto','suv','sedan','pickup', '*' = cualquiera
  service_code VARCHAR(30) NOT NULL DEFAULT '*',
  required_categories TEXT[] NOT NULL,
  severity VARCHAR(20) NOT NULL DEFAULT 'BLOCKING'
    CHECK (severity IN ('BLOCKING', 'WARNING', 'REQUIRES_REVIEW')),
  confirmed_by_source BOOLEAN NOT NULL DEFAULT FALSE,
  legal_source VARCHAR(300) NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT license_category_rules_pkey PRIMARY KEY (id),
  CONSTRAINT license_category_rules_uq UNIQUE (vehicle_type, service_code)
);

-- --- Documentos de conductor ---
CREATE TABLE IF NOT EXISTS public.driver_licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  license_number VARCHAR(50) NULL,
  license_type public.license_type NOT NULL DEFAULT 'ordinaria',
  categories TEXT[] NOT NULL DEFAULT '{}',
  issue_date DATE NULL,
  expiry_date DATE NULL,
  reported_status VARCHAR(20) NULL
    CHECK (reported_status IN ('valid', 'suspended', 'canceled')),
  document_path VARCHAR(500) NULL,               -- objectPath GCS (frente)
  document_path_back VARCHAR(500) NULL,          -- objectPath GCS (reverso)
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,                          -- Firebase UID admin/operador
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT driver_licenses_pkey PRIMARY KEY (id),
  CONSTRAINT driver_licenses_driver_id_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers (id) ON DELETE CASCADE,
  CONSTRAINT driver_licenses_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.driver_licenses (id) ON DELETE SET NULL,
  CONSTRAINT driver_licenses_dates_valid CHECK (issue_date IS NULL OR expiry_date IS NULL OR issue_date <= expiry_date)
);

CREATE INDEX IF NOT EXISTS idx_driver_licenses_driver ON public.driver_licenses(driver_id, is_current);

-- --- Documentos de vehículo (patrón uniforme) ---
CREATE TABLE IF NOT EXISTS public.vehicle_circulation_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  card_number VARCHAR(60) NULL,
  issued_at DATE NULL,
  declared_valid_until DATE NULL,
  declared_plate VARCHAR(20) NULL,
  declared_vin VARCHAR(50) NULL,
  declared_chasis VARCHAR(50) NULL,
  declared_motor VARCHAR(50) NULL,
  declared_brand VARCHAR(50) NULL,
  declared_model VARCHAR(50) NULL,
  declared_year INTEGER NULL,
  declared_color VARCHAR(30) NULL,
  declared_vehicle_class VARCHAR(30) NULL,
  declared_service_type VARCHAR(30) NULL,
  declared_owner_name VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  document_path_back VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicle_circulation_cards_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_circulation_cards_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_circulation_cards_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_circulation_cards (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_circulation_cards_vehicle ON public.vehicle_circulation_cards(vehicle_id, is_current);

CREATE TABLE IF NOT EXISTS public.vehicle_insurance_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  policy_number VARCHAR(60) NULL,
  insurer_code VARCHAR(60) NULL,                 -- autodeclarado (catálogo insurers eliminado; enum vehicle_insurance_company es el dominio de referencia)
  insurer_name VARCHAR(100) NULL,
  coverage_type public.insurance_coverage_type NOT NULL DEFAULT 'rc_obligatorio',
  effective_from DATE NULL,
  effective_until DATE NULL,
  insured_plate VARCHAR(20) NULL,
  insured_vin VARCHAR(50) NULL,
  insured_motor VARCHAR(50) NULL,
  insured_chasis VARCHAR(50) NULL,
  policyholder_name VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicle_insurance_policies_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_insurance_policies_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_insurance_policies_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_insurance_policies (id) ON DELETE SET NULL,
  CONSTRAINT vehicle_insurance_dates_valid CHECK (effective_from IS NULL OR effective_until IS NULL OR effective_from <= effective_until)
);

CREATE INDEX IF NOT EXISTS idx_insurance_policies_vehicle ON public.vehicle_insurance_policies(vehicle_id, is_current);

CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  inspected_at DATE NULL,
  result public.document_check_result NULL,
  certificate_number VARCHAR(60) NULL,
  valid_until DATE NULL,
  issuer VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicle_inspections_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_inspections_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_inspections_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_inspections (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_vehicle_inspections_vehicle ON public.vehicle_inspections(vehicle_id, is_current);

CREATE TABLE IF NOT EXISTS public.vehicle_emission_certificates (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  tested_at DATE NULL,
  result public.document_check_result NULL,
  certificate_number VARCHAR(60) NULL,
  valid_until DATE NULL,
  issuer VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicle_emission_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_emission_certificates_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_emission_certificates_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_emission_certificates (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_emission_certs_vehicle ON public.vehicle_emission_certificates(vehicle_id, is_current);

CREATE TABLE IF NOT EXISTS public.vehicle_road_taxes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  municipality VARCHAR(100) NULL,
  paid_at DATE NULL,
  receipt_number VARCHAR(60) NULL,
  exempt BOOLEAN NOT NULL DEFAULT FALSE,
  exempt_reason VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicle_road_taxes_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_road_taxes_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_road_taxes_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_road_taxes (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_road_taxes_vehicle ON public.vehicle_road_taxes(vehicle_id, is_current);

CREATE TABLE IF NOT EXISTS public.vehicle_revisado_stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  sticker_year INTEGER NULL CHECK (sticker_year >= 2000 AND sticker_year <= 2100),
  issued_at DATE NULL,
  valid_until DATE NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMPTZ NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMPTZ NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMPTZ NULL,
  CONSTRAINT vehicle_revisado_stickers_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_revisado_stickers_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_revisado_stickers_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_revisado_stickers (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_revisado_stickers_vehicle ON public.vehicle_revisado_stickers(vehicle_id, is_current);

-- --- Transversales ---
CREATE TABLE IF NOT EXISTS public.compliance_rules (
  code VARCHAR(60) NOT NULL,
  entity_scope VARCHAR(20) NOT NULL
    CHECK (entity_scope IN ('driver', 'vehicle', 'pair', 'document')),
  severity VARCHAR(20) NOT NULL
    CHECK (severity IN ('BLOCKING', 'WARNING', 'REQUIRES_REVIEW')),
  blocking BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  warning_days INTEGER NULL,
  legal_basis VARCHAR(300) NULL,
  params JSONB NOT NULL DEFAULT '{}',
  description VARCHAR(400) NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_rules_pkey PRIMARY KEY (code)
);

CREATE TABLE IF NOT EXISTS public.compliance_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NULL,
  vehicle_id UUID NULL,
  service_code VARCHAR(30) NULL,
  evaluation_type VARCHAR(20) NOT NULL DEFAULT 'pair'
    CHECK (evaluation_type IN ('driver', 'vehicle', 'pair')),
  allowed BOOLEAN NOT NULL,
  status VARCHAR(30) NOT NULL,
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,
  rules_version VARCHAR(30) NULL,
  evaluated_by TEXT NOT NULL DEFAULT 'system',
  evaluated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT compliance_evaluations_driver_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers (id) ON DELETE SET NULL,
  CONSTRAINT compliance_evaluations_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_compliance_eval_driver ON public.compliance_evaluations(driver_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_compliance_eval_vehicle ON public.compliance_evaluations(vehicle_id, evaluated_at DESC);

CREATE TABLE IF NOT EXISTS public.document_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  document_table VARCHAR(40) NOT NULL,
  document_id UUID NOT NULL,
  driver_id UUID NULL,
  vehicle_id UUID NULL,
  alert_type VARCHAR(30) NOT NULL
    CHECK (alert_type IN ('expiring_soon', 'expired', 'rejected', 'requires_review')),
  due_date DATE NULL,
  warning_days_used INTEGER NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'acknowledged', 'resolved', 'dismissed')),
  notified_at TIMESTAMPTZ NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT document_alerts_pkey PRIMARY KEY (id),
  CONSTRAINT document_alerts_driver_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers (id) ON DELETE SET NULL,
  CONSTRAINT document_alerts_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE SET NULL,
  CONSTRAINT document_alerts_uq UNIQUE NULLS NOT DISTINCT
    (document_table, document_id, alert_type, due_date)
);

DROP TRIGGER IF EXISTS update_document_alerts_updated_at ON public.document_alerts;
CREATE TRIGGER update_document_alerts_updated_at BEFORE UPDATE ON public.document_alerts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE IF NOT EXISTS public.compliance_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  entity_table VARCHAR(40) NOT NULL,
  entity_id UUID NOT NULL,
  driver_id UUID NULL,
  vehicle_id UUID NULL,
  event VARCHAR(40) NOT NULL
    CHECK (event IN ('submitted', 'updated', 'verified', 'rejected', 'superseded',
                     'expired_detected', 'alert_emitted', 'review_requested',
                     'status_changed', 'evaluated')),
  actor_uid TEXT NOT NULL DEFAULT 'system',
  actor_role VARCHAR(20) NOT NULL DEFAULT 'system',
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_events_pkey PRIMARY KEY (id)
);

CREATE INDEX IF NOT EXISTS idx_compliance_events_entity ON public.compliance_events(entity_table, entity_id);
CREATE INDEX IF NOT EXISTS idx_compliance_events_driver ON public.compliance_events(driver_id, created_at DESC);

-- ============================================
-- Crew: búsqueda exacta por licencia normalizada (backend-only)
-- Requiere driver_licenses — por eso vive aquí y no en 0005.
-- ============================================
-- upgrade: el OUT cambió vs legacy (designated_rol_requested → designated_role_status)
DROP FUNCTION IF EXISTS public.find_designated_drivers_by_license(text);
CREATE OR REPLACE FUNCTION public.find_designated_drivers_by_license(p_license_normalized TEXT)
RETURNS TABLE (
  user_id VARCHAR, license_number VARCHAR, average_rating NUMERIC,
  designated_role_status public.designated_role_request_status,
  account_status public.driver_account_status
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT DISTINCT
    d.user_id,
    COALESCE(dl.license_number, d.license_number)::VARCHAR,
    d.average_rating,
    d.designated_role_status::text::public.designated_role_request_status,
    d.account_status::text::public.driver_account_status
  FROM public.drivers d
  LEFT JOIN public.driver_licenses dl
    ON dl.driver_id = d.id AND dl.is_current = TRUE AND dl.deleted_at IS NULL
  WHERE d.deleted_at IS NULL
    AND length(p_license_normalized) >= 4
    AND (
      regexp_replace(upper(COALESCE(d.license_number, '')), '[^A-Z0-9]', '', 'g') = p_license_normalized
      OR regexp_replace(upper(COALESCE(dl.license_number, '')), '[^A-Z0-9]', '', 'g') = p_license_normalized
    )
  LIMIT 5;
$$;
COMMENT ON FUNCTION public.find_designated_drivers_by_license(TEXT) IS 'Crew search: solo backend (rol rundi_app). Requiere driver_licenses.';

-- ============================================
-- SEED — reglas legales (fuente: migration.sql §9-10, LEGAL_REQUIREMENTS.md).
-- Solo reglas CONFIRMADAS como BLOCKING; el resto REQUIRES_REVIEW/WARNING.
-- Idempotente: ON CONFLICT actualiza a los valores canónicos.
-- ============================================

-- Matriz categoría↔vehículo (license_category_rules; catálogos license_*
-- eliminados — las categorías viven como TEXT[] en driver_licenses).
INSERT INTO public.license_category_rules
  (vehicle_type, service_code, required_categories, severity, confirmed_by_source, legal_source, notes)
VALUES
  ('moto',   '*', ARRAY['1','2','3'], 'BLOCKING', TRUE,  'PN material educativo oficial', 'Motocicleta/cuadraciclo habilitada por cat 1-3 (cat 3 incluye toda motocicleta)'),
  ('auto',   '*', ARRAY['3'],         'BLOCKING', TRUE,  'PN material educativo oficial', 'Vehículo liviano requiere categoría 3'),
  ('sedan',  '*', ARRAY['3'],         'BLOCKING', TRUE,  'PN material educativo oficial', 'Sedan = vehículo liviano'),
  ('suv',    '*', ARRAY['3'],         'BLOCKING', TRUE,  'PN material educativo oficial', 'SUV liviano requiere categoría 3'),
  ('pickup', '*', ARRAY['3'],         'WARNING',  FALSE, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Pickup puede ser liviano o carga según tonelaje; revisar'),
  ('bus',    '*', ARRAY['4b','5b'],   'REQUIRES_REVIEW', FALSE, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Selectivo por capacidad de pasajeros'),
  ('*',      '*', ARRAY[]::TEXT[],    'REQUIRES_REVIEW', FALSE, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Catch-all: tipo de vehículo sin regla confirmada')
ON CONFLICT (vehicle_type, service_code) DO UPDATE SET
  required_categories = EXCLUDED.required_categories,
  severity = EXCLUDED.severity,
  confirmed_by_source = EXCLUDED.confirmed_by_source,
  legal_source = EXCLUDED.legal_source,
  notes = EXCLUDED.notes,
  updated_at = NOW();

-- Reglas del compliance engine (leídas por functions-v2/internal/compliance)
INSERT INTO public.compliance_rules
  (code, entity_scope, severity, blocking, warning_days, legal_basis, description, params)
VALUES
  ('LICENSE_MISSING',                 'driver', 'BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 133.5', 'Sin licencia vigente registrada', '{}'),
  ('LICENSE_PENDING_VERIFICATION',    'driver', 'REQUIRES_REVIEW', FALSE, NULL, 'RUNDI_POLICY', 'Licencia cargada pendiente de revisión manual', '{}'),
  ('LICENSE_REJECTED',                'driver', 'BLOCKING',        TRUE,  NULL, 'RUNDI_POLICY', 'Licencia rechazada en revisión', '{}'),
  ('LICENSE_EXPIRED',                 'driver', 'BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 140', 'Licencia vencida (vigencia 5 años)', '{}'),
  ('LICENSE_EXPIRING_SOON',           'driver', 'WARNING',         FALSE, 30,   'RUNDI_POLICY', 'Licencia próxima a vencer', '{}'),
  ('LICENSE_NOT_YET_VALID',           'driver', 'BLOCKING',        TRUE,  NULL, 'Integridad de fechas', 'Licencia con emisión futura', '{}'),
  ('LICENSE_INVALID_DATE_RANGE',      'driver', 'BLOCKING',        TRUE,  NULL, 'Integridad de fechas', 'issue_date > expiry_date', '{}'),
  ('LICENSE_TYPE_ORDINARY_FOR_PAID_WORK', 'driver', 'WARNING',     FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Licencia ordinaria para trabajo remunerado (revisar si se exige profesional)', '{}'),
  ('LICENSE_REPORTED_SUSPENDED',      'driver', 'BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 143', 'Licencia reportada suspendida/cancelada', '{}'),
  ('LICENSE_CATEGORY_MISMATCH',       'pair',   'BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 21/140', 'Categoría de licencia incompatible con vehículo/servicio (solo reglas confirmadas)', '{}'),
  ('LICENSE_CATEGORY_UNVERIFIED',     'pair',   'REQUIRES_REVIEW', FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Compatibilidad categoría-vehículo no confirmada por fuente oficial', '{}'),
  ('CIRCULATION_CARD_MISSING',        'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Arts. 3.25/133.5', 'Sin licencia de circulación registrada', '{}'),
  ('CIRCULATION_DATA_MISMATCH',       'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'Ley 431 Arts. 63.5/164', 'Datos declarados de la tarjeta no coinciden con el vehículo', '{}'),
  ('SERVICE_TYPE_NOT_PUBLIC',         'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Vehículo con servicio registral PRIVADO operando viajes', '{}'),
  ('INSURANCE_MISSING',               'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Arts. 63/133.4', 'Sin póliza RC obligatoria vigente', '{}'),
  ('INSURANCE_PENDING_VERIFICATION',  'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'RUNDI_POLICY', 'Póliza pendiente de revisión', '{}'),
  ('INSURANCE_EXPIRED',               'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 68', 'Póliza vencida (vigencia 1 año)', '{}'),
  ('INSURANCE_EXPIRING_SOON',         'vehicle','WARNING',         FALSE, 30,   'RUNDI_POLICY', 'Póliza próxima a vencer', '{}'),
  ('INSURANCE_NOT_YET_ACTIVE',        'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 68', 'Póliza con inicio de vigencia futuro', '{}'),
  ('INSURANCE_INVALID_DATE_RANGE',    'vehicle','BLOCKING',        TRUE,  NULL, 'Integridad de fechas', 'effective_from > effective_until', '{}'),
  ('INSURANCE_VEHICLE_MISMATCH',      'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'Ley 431 Art. 63.5', 'Identificadores de la póliza no coinciden con el vehículo', '{}'),
  ('INSURANCE_PASSENGER_COVERAGE_MISSING','vehicle','REQUIRES_REVIEW',FALSE,NULL,'Ley 431 Art. 69.II.4', 'Sin cobertura de pasajeros identificada para vehículo de servicio de pasajeros', '{}'),
  ('INSURANCE_POLICY_DUPLICATE',      'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'Integridad interna', 'Misma póliza en varios vehículos', '{}'),
  ('INSPECTION_MISSING',              'vehicle','BLOCKING',        TRUE,  NULL, 'PN trámite revisado; exención 2 años nuevos', 'Sin ITM vigente (y exención no aplica)', '{"vehicle_age_exemption_years":2}'),
  ('INSPECTION_EXPIRED',              'vehicle','BLOCKING',        TRUE,  NULL, 'PN trámite revisado', 'ITM vencida', '{}'),
  ('INSPECTION_FAILED',               'vehicle','BLOCKING',        TRUE,  NULL, 'PN trámite revisado', 'ITM con resultado no aprobado', '{}'),
  ('INSPECTION_EXPIRING_SOON',        'vehicle','WARNING',         FALSE, 30,   'RUNDI_POLICY', 'ITM próxima a vencer', '{}'),
  ('EMISSIONS_MISSING',               'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Arts. 60-62; exención 2 años nuevos', 'Sin certificado de emisiones vigente', '{"vehicle_age_exemption_years":2}'),
  ('EMISSIONS_EXPIRED',               'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 62', 'Certificado de emisiones vencido (vigencia 1 año)', '{}'),
  ('EMISSIONS_FAILED',                'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Arts. 60-62', 'Emisiones con resultado no aprobado', '{}'),
  ('EMISSIONS_EXPIRING_SOON',         'vehicle','WARNING',         FALSE, 30,   'RUNDI_POLICY', 'Certificado próximo a vencer', '{}'),
  ('ROAD_TAX_MISSING',                'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Arts. 11-12', 'Sin rodamiento del año corriente (bloquea tras Q1)', '{"grace_end_month":3,"grace_end_day":31}'),
  ('ROAD_TAX_GRACE_PERIOD',           'vehicle','WARNING',         FALSE, NULL, 'Ley 431 Art. 11', 'Año corriente aún en trimestre de pago sin rodamiento registrado', '{}'),
  ('ROAD_TAX_EXEMPT_UNVERIFIED',      'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'Ley 431 Art. 11', 'Exención de rodamiento sin verificar', '{}'),
  ('REVISADO_MISSING',                'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'PN trámite revisado; Ley 431 Art. 133.3', 'Sin calcomanía de revisado registrada (informativo si componentes vigentes)', '{}'),
  ('IDENTIFIER_MISMATCH',             'pair',   'REQUIRES_REVIEW', FALSE, NULL, 'Ley 431 Arts. 63.5/164', 'Placa/VIN/motor/chasis inconsistente entre documentos', '{}'),
  ('DUPLICATE_LICENSE',               'driver', 'REQUIRES_REVIEW', FALSE, NULL, 'Integridad interna', 'Número de licencia usada por otro conductor', '{}'),
  ('DUPLICATE_PLATE',                 'vehicle','BLOCKING',        TRUE,  NULL, 'Integridad interna', 'Placa duplicada en otro vehículo vigente', '{}'),
  ('DUPLICATE_VIN',                   'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'Integridad interna', 'VIN/chasis/motor duplicado', '{}'),
  ('INVALID_DATE_RANGE',              'document','BLOCKING',       TRUE,  NULL, 'Integridad de fechas', 'Rango de fechas imposible en documento', '{}'),
  ('FOREIGN_PLATE_PUBLIC_SERVICE',    'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 134', 'Placa extranjera prestando servicio público', '{}'),
  ('PUBLIC_TRANSPORT_CONCESSION_MISSING','pair','REQUIRES_REVIEW', FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Concesión/permiso de transporte público no determinada', '{}'),
  ('REQUIRES_MANUAL_REVIEW',          'document','REQUIRES_REVIEW',FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Documento requiere revisión manual (catch-all)', '{}')
ON CONFLICT (code) DO UPDATE SET
  entity_scope = EXCLUDED.entity_scope,
  severity = EXCLUDED.severity,
  blocking = EXCLUDED.blocking,
  warning_days = EXCLUDED.warning_days,
  legal_basis = EXCLUDED.legal_basis,
  description = EXCLUDED.description,
  params = EXCLUDED.params,
  updated_at = NOW();

COMMIT;

