-- ============================================================================
-- migration.sql — Sistema de compliance documental de conductores y vehículos
-- Proyecto: Rundi · Fecha: 2026-10-16
-- Base: database/LEGAL_REQUIREMENTS.md + database/COMPLIANCE_ARCHITECTURE.md
--
-- SEGURO / IDEMPOTENTE:
--   - No elimina ni renombra columnas legacy (license_*, registration_*,
--     insurance_*). Solo crea objetos nuevos y columnas nuevas.
--   - CREATE TYPE envuelto en DO ... EXCEPTION WHEN duplicate_object.
--   - CREATE TABLE/INDEX IF NOT EXISTS, DROP POLICY IF EXISTS + CREATE POLICY.
--   - Backfill con NOT EXISTS para no duplicar en re-ejecuciones.
--
-- ORDEN: enums → catálogos → columnas derivadas → tablas de documentos →
--        transversales → índices → triggers → RLS → seeds → backfill →
--        validación → storage privado.
-- ============================================================================

BEGIN;

-- ============================================================================
-- 1. ENUM TYPES
-- ============================================================================

DO $$ BEGIN
  CREATE TYPE public.document_status AS ENUM
    ('pending', 'in_review', 'verified', 'rejected', 'requires_review', 'expired');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.verification_method AS ENUM
    ('manual', 'ocr', 'api', 'migrated', 'self_declared');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.license_type AS ENUM
    ('ordinaria', 'profesional', 'menor_de_edad', 'especial', 'permiso');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.insurance_coverage_type AS ENUM
    ('rc_obligatorio', 'pasajeros', 'danios_propios', 'licencia_conductor', 'otro');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.document_check_result AS ENUM
    ('approved', 'rejected', 'conditional');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.driver_compliance_status AS ENUM
    ('pending_documents', 'under_review', 'verified', 'expiring',
     'non_compliant', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.vehicle_compliance_status AS ENUM
    ('pending_verification', 'active', 'non_compliant',
     'expired_documents', 'suspended');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ============================================================================
-- 2. CATÁLOGOS DE REFERENCIA (abiertos — NO enums cerrados; ver ARQUITECTURA B.1)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.license_types (
  code VARCHAR(20) NOT NULL,
  description VARCHAR(200) NULL,
  default_validity_months INTEGER NULL,          -- 60 (5 años), 3 (permiso); NULL = por regla especial
  legal_source VARCHAR(200) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT license_types_pkey PRIMARY KEY (code)
);
COMMENT ON TABLE public.license_types IS 'Catálogo de tipos de licencia de conducir (Ley 431 Art. 140/147)';

CREATE TABLE IF NOT EXISTS public.license_categories (
  code VARCHAR(4) NOT NULL,
  description VARCHAR(300) NULL,
  legal_source VARCHAR(300) NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT license_categories_pkey PRIMARY KEY (code)
);
COMMENT ON TABLE public.license_categories IS 'Catálogo oficial de categorías de licencia (PN/DSTN): 1,2,3,4a,4b,5a,5b,6a,6b,7,8';

CREATE TABLE IF NOT EXISTS public.license_category_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_type VARCHAR(30) NOT NULL,             -- 'auto','moto','suv','sedan','pickup', '*' = cualquiera
  service_code VARCHAR(30) NOT NULL DEFAULT '*', -- '*' = aplica a todos los servicios
  required_categories TEXT[] NOT NULL,           -- categorías que habilitan ese vehículo/servicio
  severity VARCHAR(20) NOT NULL DEFAULT 'BLOCKING'
    CHECK (severity IN ('BLOCKING', 'WARNING', 'REQUIRES_REVIEW')),
  confirmed_by_source BOOLEAN NOT NULL DEFAULT FALSE, -- FALSE => jamás BLOCKING automático
  legal_source VARCHAR(300) NULL,
  notes TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT license_category_rules_pkey PRIMARY KEY (id),
  CONSTRAINT license_category_rules_uq UNIQUE (vehicle_type, service_code)
);
COMMENT ON TABLE public.license_category_rules IS 'Matriz categoría de licencia ↔ tipo de vehículo ↔ servicio. Reglas como datos, no hardcodeadas';
COMMENT ON COLUMN public.license_category_rules.confirmed_by_source IS 'TRUE solo si LEGAL_REQUIREMENTS.md la marca CONFIRMED_BY_OFFICIAL_SOURCE; si es FALSE el engine la degrada a REQUIRES_REVIEW';

CREATE TABLE IF NOT EXISTS public.insurers (
  code VARCHAR(60) NOT NULL,
  name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT insurers_pkey PRIMARY KEY (code)
);
COMMENT ON TABLE public.insurers IS 'Catálogo abierto de aseguradoras (datos reales como BAC quedan fuera de enums cerrados)';

CREATE TABLE IF NOT EXISTS public.vehicle_types (
  code VARCHAR(30) NOT NULL,
  description VARCHAR(100) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT vehicle_types_pkey PRIMARY KEY (code)
);
COMMENT ON TABLE public.vehicle_types IS 'Catálogo abierto de tipos de vehículo (acepta valores reales como sedan)';

-- ============================================================================
-- 3. COLUMNAS DERIVADAS (snapshot de compliance; recalculadas por el engine)
-- ============================================================================

ALTER TABLE public.drivers
  ADD COLUMN IF NOT EXISTS compliance_status public.driver_compliance_status
    NOT NULL DEFAULT 'pending_documents';
COMMENT ON COLUMN public.drivers.compliance_status IS
  'Estado derivado recalculado por el compliance engine. documents_status legacy se mantiene para compatibilidad';

ALTER TABLE public.vehicles
  ADD COLUMN IF NOT EXISTS compliance_status public.vehicle_compliance_status
    NOT NULL DEFAULT 'pending_verification';
COMMENT ON COLUMN public.vehicles.compliance_status IS
  'Estado derivado recalculado por el compliance engine a partir de sus documentos';

-- ============================================================================
-- 4. TABLAS DE DOCUMENTOS
--    Columnas comunes: status/verified_*/verification_method/rejection_reason/
--    review_notes/document_path(+_back)/extracted_*/supersedes_id/is_current/
--    timestamps/deleted_at
-- ============================================================================

-- 4.1 Licencias de conducir (historial completo por conductor)
CREATE TABLE IF NOT EXISTS public.driver_licenses (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NOT NULL,
  license_number VARCHAR(50) NULL,
  license_type public.license_type NOT NULL DEFAULT 'ordinaria',
  categories TEXT[] NOT NULL DEFAULT '{}',
  issue_date DATE NULL,
  expiry_date DATE NULL,                          -- 5 años (permiso: 90 días); NULL si no legible
  reported_status VARCHAR(20) NULL                -- suspendida/cancelada según autoridad (dato administrativo)
    CHECK (reported_status IN ('valid', 'suspended', 'canceled')),
  document_path VARCHAR(500) NULL,                -- frente
  document_path_back VARCHAR(500) NULL,           -- reverso
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,                          -- Firebase UID del admin/operador
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,                      -- reservado para OCR
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,                        -- licencia que este documento reemplaza (renovación)
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT driver_licenses_pkey PRIMARY KEY (id),
  CONSTRAINT driver_licenses_driver_id_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers (id) ON DELETE CASCADE,
  CONSTRAINT driver_licenses_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.driver_licenses (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.driver_licenses IS
  'Historial de licencias de conducir. is_current marca la vigente; supersedes_id encadena renovaciones';
COMMENT ON COLUMN public.driver_licenses.status IS
  'Una foto nunca implica verified; solo revisión manual (o regla confirmada) puede verificar';

-- 4.2 Licencia de circulación (documento permanente; Art. 9 Ley 431)
CREATE TABLE IF NOT EXISTS public.vehicle_circulation_cards (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  card_number VARCHAR(60) NULL,                   -- número declarado en la tarjeta/registro
  issued_at DATE NULL,                            -- fecha de emisión de la tarjeta vigente
  declared_valid_until DATE NULL,                 -- dato declarado (legacy registration_expiry); NO es vencimiento legal
  -- Snapshot identificativo tal como aparece en la tarjeta:
  declared_plate VARCHAR(20) NULL,
  declared_vin VARCHAR(50) NULL,
  declared_chasis VARCHAR(50) NULL,
  declared_motor VARCHAR(50) NULL,
  declared_brand VARCHAR(50) NULL,
  declared_model VARCHAR(50) NULL,
  declared_year INTEGER NULL,
  declared_color VARCHAR(30) NULL,
  declared_vehicle_class VARCHAR(30) NULL,        -- PARTICULAR/ESTATAL/MUNICIPAL/...
  declared_service_type VARCHAR(30) NULL,         -- PRIVADO/PUBLICO/TAXI/...
  declared_owner_name VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  document_path_back VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT vehicle_circulation_cards_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_circulation_cards_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_circulation_cards_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_circulation_cards (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.vehicle_circulation_cards IS
  'Licencias de circulación (documento permanente; se renueva por cambio de dueño/domicilio/deterioro, no por fecha)';
COMMENT ON COLUMN public.vehicle_circulation_cards.declared_valid_until IS
  'Fecha declarada en el documento si la trae; NO implica vencimiento legal de la circulación';

-- 4.3 Pólizas de seguro (múltiples coberturas por vehículo)
CREATE TABLE IF NOT EXISTS public.vehicle_insurance_policies (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  policy_number VARCHAR(60) NULL,
  insurer_code VARCHAR(60) NULL,
  insurer_name VARCHAR(100) NULL,                 -- snapshot tal como aparece en la póliza
  coverage_type public.insurance_coverage_type NOT NULL DEFAULT 'rc_obligatorio',
  effective_from DATE NULL,
  effective_until DATE NULL,
  -- Identificadores del vehículo asegurado según la póliza (Art. 63.5 Ley 431):
  insured_plate VARCHAR(20) NULL,
  insured_vin VARCHAR(50) NULL,
  insured_motor VARCHAR(50) NULL,
  insured_chasis VARCHAR(50) NULL,
  policyholder_name VARCHAR(200) NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT vehicle_insurance_policies_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_insurance_policies_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_insurance_policies_insurer_fkey FOREIGN KEY (insurer_code)
    REFERENCES public.insurers (code) ON DELETE SET NULL,
  CONSTRAINT vehicle_insurance_policies_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_insurance_policies (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.vehicle_insurance_policies IS
  'Pólizas por cobertura: rc_obligatorio (Ley 431 Art. 63), pasajeros (Art. 69.II), daños propios, licencia, otro';

-- 4.4 Inspección técnico-mecánica (ITM)
CREATE TABLE IF NOT EXISTS public.vehicle_inspections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  inspected_at DATE NULL,
  result public.document_check_result NULL,
  certificate_number VARCHAR(60) NULL,
  valid_until DATE NULL,
  issuer VARCHAR(200) NULL,                       -- taller autorizado
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT vehicle_inspections_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_inspections_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_inspections_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_inspections (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.vehicle_inspections IS 'Inspección técnico-mecánica (ITM), requisito de calcomanía de revisado';

-- 4.5 Certificado de control de emisiones (Art. 60-62 Ley 431; vigencia 1 año)
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
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT vehicle_emission_certificates_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_emission_certificates_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_emission_certificates_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_emission_certificates (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.vehicle_emission_certificates IS 'Certificado de control de emisiones de gases (vigencia legal: 1 año)';

-- 4.6 Impuesto municipal de rodamiento (por año fiscal)
CREATE TABLE IF NOT EXISTS public.vehicle_road_taxes (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  tax_year INTEGER NOT NULL CHECK (tax_year >= 2000 AND tax_year <= 2100),
  municipality VARCHAR(100) NULL,
  paid_at DATE NULL,
  receipt_number VARCHAR(60) NULL,
  exempt BOOLEAN NOT NULL DEFAULT FALSE,
  exempt_reason VARCHAR(200) NULL,                -- jubilado / discapacidad (Art. 11)
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT vehicle_road_taxes_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_road_taxes_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_road_taxes_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_road_taxes (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.vehicle_road_taxes IS
  'Impuesto municipal de rodamiento por año (Art. 11-12; pago durante el primer trimestre)';

-- 4.7 Calcomanía de revisado (evidencia anual; su vigencia deriva de ITM+emisiones+seguro+rodamiento)
CREATE TABLE IF NOT EXISTS public.vehicle_revisado_stickers (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  vehicle_id UUID NOT NULL,
  sticker_year INTEGER NULL CHECK (sticker_year >= 2000 AND sticker_year <= 2100),
  issued_at DATE NULL,
  valid_until DATE NULL,
  document_path VARCHAR(500) NULL,
  status public.document_status NOT NULL DEFAULT 'pending',
  verified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  verified_by TEXT NULL,
  verification_method public.verification_method NOT NULL DEFAULT 'self_declared',
  rejection_reason TEXT NULL,
  review_notes TEXT NULL,
  extracted_data JSONB NULL,
  extraction_confidence NUMERIC(4, 3) NULL,
  extracted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  supersedes_id UUID NULL,
  is_current BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  deleted_at TIMESTAMP WITHOUT TIME ZONE NULL,
  CONSTRAINT vehicle_revisado_stickers_pkey PRIMARY KEY (id),
  CONSTRAINT vehicle_revisado_stickers_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE CASCADE,
  CONSTRAINT vehicle_revisado_stickers_supersedes_fkey FOREIGN KEY (supersedes_id)
    REFERENCES public.vehicle_revisado_stickers (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.vehicle_revisado_stickers IS
  'Calcomanía de revisado anual (Art. 4.4). Evidencia; la vigencia real deriva de sus componentes';

-- ============================================================================
-- 5. TABLAS TRANSVERSALES
-- ============================================================================

-- 5.1 Reglas de compliance como datos
CREATE TABLE IF NOT EXISTS public.compliance_rules (
  code VARCHAR(60) NOT NULL,
  entity_scope VARCHAR(20) NOT NULL               -- driver | vehicle | pair | document
    CHECK (entity_scope IN ('driver', 'vehicle', 'pair', 'document')),
  severity VARCHAR(20) NOT NULL
    CHECK (severity IN ('BLOCKING', 'WARNING', 'REQUIRES_REVIEW')),
  blocking BOOLEAN NOT NULL DEFAULT FALSE,
  enabled BOOLEAN NOT NULL DEFAULT TRUE,
  warning_days INTEGER NULL,                      -- ventana de alerta (días) cuando aplica
  legal_basis VARCHAR(300) NULL,                  -- 'Ley 431 Art. 68' | 'REQUIRES_MANUAL_LEGAL_REVIEW' | 'RUNDI_POLICY'
  params JSONB NOT NULL DEFAULT '{}',
  description VARCHAR(400) NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_rules_pkey PRIMARY KEY (code)
);
COMMENT ON TABLE public.compliance_rules IS
  'Catálogo de reglas del motor de compliance: severidad, blocking, ventanas y base legal por código';
COMMENT ON COLUMN public.compliance_rules.legal_basis IS
  'Fundamento oficial; REQUIRES_MANUAL_LEGAL_REVIEW jamás debe ser blocking=TRUE';

-- 5.2 Evaluaciones auditables
CREATE TABLE IF NOT EXISTS public.compliance_evaluations (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  driver_id UUID NULL,
  vehicle_id UUID NULL,
  service_code VARCHAR(30) NULL,
  evaluation_type VARCHAR(20) NOT NULL DEFAULT 'pair'
    CHECK (evaluation_type IN ('driver', 'vehicle', 'pair')),
  allowed BOOLEAN NOT NULL,
  status VARCHAR(30) NOT NULL,                    -- verified|non_compliant|under_review|expiring|...
  reasons JSONB NOT NULL DEFAULT '[]'::jsonb,     -- [{code,severity,status,message,source,details?}]
  rules_version VARCHAR(30) NULL,                 -- hash/versión del set de reglas aplicado
  evaluated_by TEXT NOT NULL DEFAULT 'system',    -- Firebase UID | 'system' | 'scheduled'
  evaluated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_evaluations_pkey PRIMARY KEY (id),
  CONSTRAINT compliance_evaluations_driver_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers (id) ON DELETE SET NULL,
  CONSTRAINT compliance_evaluations_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE SET NULL
);
COMMENT ON TABLE public.compliance_evaluations IS
  'Snapshot auditable de cada evaluación canDriverOperate/canVehicleOperate/canDriverOperateVehicle';

-- 5.3 Alertas de documentos
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
  notified_at TIMESTAMP WITHOUT TIME ZONE NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT document_alerts_pkey PRIMARY KEY (id),
  CONSTRAINT document_alerts_driver_fkey FOREIGN KEY (driver_id)
    REFERENCES public.drivers (id) ON DELETE SET NULL,
  CONSTRAINT document_alerts_vehicle_fkey FOREIGN KEY (vehicle_id)
    REFERENCES public.vehicles (id) ON DELETE SET NULL,
  CONSTRAINT document_alerts_uq UNIQUE NULLS NOT DISTINCT
    (document_table, document_id, alert_type, due_date)
);
COMMENT ON TABLE public.document_alerts IS
  'Alertas generadas por el engine/job diario; unique evita duplicar por documento+tipo+fecha';

-- 5.4 Eventos de ciclo de vida de documentos (patrón audit_log)
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
  actor_role VARCHAR(20) NOT NULL DEFAULT 'system',  -- client|driver|admin|operator|system
  payload JSONB NULL,
  created_at TIMESTAMP WITHOUT TIME ZONE NOT NULL DEFAULT NOW(),
  CONSTRAINT compliance_events_pkey PRIMARY KEY (id)
);
COMMENT ON TABLE public.compliance_events IS
  'Bitácora de ciclo de vida de documentos y evaluaciones (complementa audit_log)';

-- ============================================================================
-- 6. ÍNDICES
-- ============================================================================

-- Un solo documento vigente por sujeto/tipo (is_current + no eliminado)
CREATE UNIQUE INDEX IF NOT EXISTS uq_driver_licenses_current
  ON public.driver_licenses (driver_id) WHERE is_current = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_circulation_cards_current
  ON public.vehicle_circulation_cards (vehicle_id) WHERE is_current = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_insurance_current_per_coverage
  ON public.vehicle_insurance_policies (vehicle_id, coverage_type)
  WHERE is_current = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_inspections_current
  ON public.vehicle_inspections (vehicle_id) WHERE is_current = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_emissions_current
  ON public.vehicle_emission_certificates (vehicle_id) WHERE is_current = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_roadtax_current_year
  ON public.vehicle_road_taxes (vehicle_id, tax_year)
  WHERE is_current = TRUE AND deleted_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_revisado_current_year
  ON public.vehicle_revisado_stickers (vehicle_id, sticker_year)
  WHERE is_current = TRUE AND deleted_at IS NULL;

-- Detección de duplicados cross-driver/vehicle
CREATE INDEX IF NOT EXISTS idx_driver_licenses_number
  ON public.driver_licenses USING btree (license_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_insurance_policy_number
  ON public.vehicle_insurance_policies USING btree (policy_number) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_circulation_card_number
  ON public.vehicle_circulation_cards USING btree (card_number) WHERE deleted_at IS NULL;

-- Consultas del engine y del backoffice
CREATE INDEX IF NOT EXISTS idx_driver_licenses_driver ON public.driver_licenses USING btree (driver_id, is_current);
CREATE INDEX IF NOT EXISTS idx_circulation_vehicle ON public.vehicle_circulation_cards USING btree (vehicle_id, is_current);
CREATE INDEX IF NOT EXISTS idx_insurance_vehicle ON public.vehicle_insurance_policies USING btree (vehicle_id, is_current);
CREATE INDEX IF NOT EXISTS idx_insurance_expiry ON public.vehicle_insurance_policies USING btree (effective_until) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_inspections_vehicle ON public.vehicle_inspections USING btree (vehicle_id, is_current);
CREATE INDEX IF NOT EXISTS idx_inspections_valid_until ON public.vehicle_inspections USING btree (valid_until) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_emissions_vehicle ON public.vehicle_emission_certificates USING btree (vehicle_id, is_current);
CREATE INDEX IF NOT EXISTS idx_emissions_valid_until ON public.vehicle_emission_certificates USING btree (valid_until) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_roadtax_vehicle_year ON public.vehicle_road_taxes USING btree (vehicle_id, tax_year);
CREATE INDEX IF NOT EXISTS idx_revisado_vehicle ON public.vehicle_revisado_stickers USING btree (vehicle_id, is_current);
CREATE INDEX IF NOT EXISTS idx_license_expiry ON public.driver_licenses USING btree (expiry_date) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_docs_status ON public.driver_licenses USING btree (status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_evaluations_driver ON public.compliance_evaluations USING btree (driver_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_evaluations_vehicle ON public.compliance_evaluations USING btree (vehicle_id, evaluated_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_open ON public.document_alerts USING btree (status, due_date);
CREATE INDEX IF NOT EXISTS idx_alerts_driver ON public.document_alerts USING btree (driver_id, status);
CREATE INDEX IF NOT EXISTS idx_events_entity ON public.compliance_events USING btree (entity_table, entity_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_driver ON public.compliance_events USING btree (driver_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_category_rules_vehicle ON public.license_category_rules USING btree (vehicle_type, service_code);

-- Índices para duplicados de identificadores del vehículo (VIN/chasis/motor ya existen en vehicles)
CREATE INDEX IF NOT EXISTS idx_vehicles_vin ON public.vehicles USING btree (vin)
  WHERE vin IS NOT NULL AND deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_vehicles_chasis ON public.vehicles USING btree (chasis)
  WHERE chasis IS NOT NULL AND deleted_at IS NULL;

-- ============================================================================
-- 7. TRIGGERS updated_at
-- ============================================================================

DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'license_types','license_categories','license_category_rules','insurers','vehicle_types',
    'driver_licenses','vehicle_circulation_cards','vehicle_insurance_policies',
    'vehicle_inspections','vehicle_emission_certificates','vehicle_road_taxes',
    'vehicle_revisado_stickers','compliance_rules','document_alerts'
  ] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', 'trigger_' || t || '_updated_at', t);
    EXECUTE format(
      'CREATE TRIGGER %I BEFORE UPDATE ON public.%I
       FOR EACH ROW EXECUTE FUNCTION update_updated_at_column()',
      'trigger_' || t || '_updated_at', t);
  END LOOP;
END $$;

-- ============================================================================
-- 8. RLS
-- ============================================================================
-- Patrón: dueño lee/inserta/actualiza sus documentos pendientes (sube evidencia),
-- admin lee todo y puede actualizar (revisión), service_role escribe eventos/
-- evaluaciones/alertas. El service_role bypasea RLS pero los grants quedan explícitos.

CREATE OR REPLACE FUNCTION public.is_admin_claim()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE(
    (current_setting('request.jwt.claims', true)::json ->> 'role') = 'admin'
    OR (current_setting('request.jwt.claims', true)::json ->> 'app_role') = 'admin',
    FALSE
  );
$$;
COMMENT ON FUNCTION public.is_admin_claim() IS 'TRUE si el JWT trae role/app_role=admin (mismo criterio que audit_log_admin_read)';
REVOKE EXECUTE ON FUNCTION public.is_admin_claim() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_admin_claim() TO authenticated, service_role;

ALTER TABLE public.license_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.license_category_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.insurers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_licenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_circulation_cards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_insurance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_inspections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_emission_certificates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_road_taxes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicle_revisado_stickers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_evaluations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.document_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_events ENABLE ROW LEVEL SECURITY;

-- Catálogos: lectura para autenticados; escritura solo admin
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'license_types','license_categories','license_category_rules','insurers','vehicle_types'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_read_auth', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (TRUE)',
      t || '_read_auth', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_write', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
       USING (public.is_admin_claim()) WITH CHECK (public.is_admin_claim())',
      t || '_admin_write', t);
    EXECUTE format('GRANT SELECT ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- compliance_rules: lectura autenticada (el frontend puede mostrar razones), escritura admin
DROP POLICY IF EXISTS compliance_rules_read ON public.compliance_rules;
CREATE POLICY compliance_rules_read ON public.compliance_rules
  FOR SELECT TO authenticated USING (TRUE);
DROP POLICY IF EXISTS compliance_rules_admin_write ON public.compliance_rules;
CREATE POLICY compliance_rules_admin_write ON public.compliance_rules
  FOR ALL TO authenticated
  USING (public.is_admin_claim()) WITH CHECK (public.is_admin_claim());
GRANT SELECT ON public.compliance_rules TO authenticated;
GRANT ALL ON public.compliance_rules TO service_role;

-- driver_licenses: dueño por drivers.user_id = Firebase UID
DROP POLICY IF EXISTS driver_licenses_owner_read ON public.driver_licenses;
CREATE POLICY driver_licenses_owner_read ON public.driver_licenses
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
  );
DROP POLICY IF EXISTS driver_licenses_owner_insert ON public.driver_licenses;
CREATE POLICY driver_licenses_owner_insert ON public.driver_licenses
  FOR INSERT TO authenticated WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
    AND status = 'pending'
  );
DROP POLICY IF EXISTS driver_licenses_owner_update ON public.driver_licenses;
CREATE POLICY driver_licenses_owner_update ON public.driver_licenses
  FOR UPDATE TO authenticated
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
    AND status IN ('pending', 'rejected', 'requires_review')
  )
  WITH CHECK (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
    AND status IN ('pending', 'in_review', 'requires_review')
  );
DROP POLICY IF EXISTS driver_licenses_admin_all ON public.driver_licenses;
CREATE POLICY driver_licenses_admin_all ON public.driver_licenses
  FOR ALL TO authenticated
  USING (public.is_admin_claim()) WITH CHECK (public.is_admin_claim());
GRANT SELECT, INSERT, UPDATE ON public.driver_licenses TO authenticated;
GRANT ALL ON public.driver_licenses TO service_role;

-- Documentos de vehículo: dueño vía vehicles.driver_id → drivers.user_id
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicle_circulation_cards','vehicle_insurance_policies','vehicle_inspections',
    'vehicle_emission_certificates','vehicle_road_taxes','vehicle_revisado_stickers'
  ] LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_read', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (
         vehicle_id IN (
           SELECT v.id FROM public.vehicles v
           JOIN public.drivers d ON d.id = v.driver_id
           WHERE d.user_id = public.current_firebase_uid()
         ))', t || '_owner_read', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_insert', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR INSERT TO authenticated WITH CHECK (
         vehicle_id IN (
           SELECT v.id FROM public.vehicles v
           JOIN public.drivers d ON d.id = v.driver_id
           WHERE d.user_id = public.current_firebase_uid()
         ) AND status = ''pending'')', t || '_owner_insert', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_owner_update', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR UPDATE TO authenticated USING (
         vehicle_id IN (
           SELECT v.id FROM public.vehicles v
           JOIN public.drivers d ON d.id = v.driver_id
           WHERE d.user_id = public.current_firebase_uid()
         ) AND status IN (''pending'', ''rejected'', ''requires_review''))
       WITH CHECK (
         vehicle_id IN (
           SELECT v.id FROM public.vehicles v
           JOIN public.drivers d ON d.id = v.driver_id
           WHERE d.user_id = public.current_firebase_uid()
         ) AND status IN (''pending'', ''in_review'', ''requires_review''))',
      t || '_owner_update', t);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_admin_all', t);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated
       USING (public.is_admin_claim()) WITH CHECK (public.is_admin_claim())',
      t || '_admin_all', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE ON public.%I TO authenticated', t);
    EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  END LOOP;
END $$;

-- compliance_evaluations: dueño lee las suyas; admin lee todo; solo service escribe
DROP POLICY IF EXISTS evaluations_owner_read ON public.compliance_evaluations;
CREATE POLICY evaluations_owner_read ON public.compliance_evaluations
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
    OR vehicle_id IN (
      SELECT v.id FROM public.vehicles v
      JOIN public.drivers d ON d.id = v.driver_id
      WHERE d.user_id = public.current_firebase_uid()
    )
  );
DROP POLICY IF EXISTS evaluations_admin_read ON public.compliance_evaluations;
CREATE POLICY evaluations_admin_read ON public.compliance_evaluations
  FOR SELECT TO authenticated USING (public.is_admin_claim());
DROP POLICY IF EXISTS evaluations_service_insert ON public.compliance_evaluations;
CREATE POLICY evaluations_service_insert ON public.compliance_evaluations
  FOR INSERT TO service_role WITH CHECK (TRUE);
GRANT SELECT ON public.compliance_evaluations TO authenticated;
GRANT ALL ON public.compliance_evaluations TO service_role;
REVOKE UPDATE, DELETE ON public.compliance_evaluations FROM anon, authenticated;

-- document_alerts: dueño lee/acknowledge; admin lee; service escribe
DROP POLICY IF EXISTS alerts_owner_read ON public.document_alerts;
CREATE POLICY alerts_owner_read ON public.document_alerts
  FOR SELECT TO authenticated USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
    OR vehicle_id IN (
      SELECT v.id FROM public.vehicles v
      JOIN public.drivers d ON d.id = v.driver_id
      WHERE d.user_id = public.current_firebase_uid()
    )
  );
DROP POLICY IF EXISTS alerts_owner_ack ON public.document_alerts;
CREATE POLICY alerts_owner_ack ON public.document_alerts
  FOR UPDATE TO authenticated
  USING (
    driver_id IN (SELECT id FROM public.drivers WHERE user_id = public.current_firebase_uid())
    AND status = 'open'
  )
  WITH CHECK (status IN ('acknowledged', 'open'));
DROP POLICY IF EXISTS alerts_admin_read ON public.document_alerts;
CREATE POLICY alerts_admin_read ON public.document_alerts
  FOR SELECT TO authenticated USING (public.is_admin_claim());
DROP POLICY IF EXISTS alerts_service_all ON public.document_alerts;
CREATE POLICY alerts_service_all ON public.document_alerts
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
GRANT SELECT, UPDATE ON public.document_alerts TO authenticated;
GRANT ALL ON public.document_alerts TO service_role;

-- compliance_events: admin lee; service inserta; inmutable
DROP POLICY IF EXISTS compliance_events_admin_read ON public.compliance_events;
CREATE POLICY compliance_events_admin_read ON public.compliance_events
  FOR SELECT TO authenticated USING (public.is_admin_claim());
DROP POLICY IF EXISTS compliance_events_service_insert ON public.compliance_events;
CREATE POLICY compliance_events_service_insert ON public.compliance_events
  FOR INSERT TO service_role WITH CHECK (TRUE);
GRANT SELECT ON public.compliance_events TO authenticated;
GRANT ALL ON public.compliance_events TO service_role;
REVOKE UPDATE, DELETE ON public.compliance_events FROM anon, authenticated;

-- ============================================================================
-- 9. SEEDS DE CATÁLOGOS
-- ============================================================================

INSERT INTO public.license_types (code, description, default_validity_months, legal_source)
VALUES
  ('ordinaria',     'Licencia ordinaria (categorías 1-3)', 60, 'Ley 431 Art. 140'),
  ('profesional',   'Licencia profesional (categorías 1-8)', 60, 'Ley 431 Art. 140'),
  ('menor_de_edad', 'Licencia menor de edad 16-18 (expira al cumplir mayoría)', NULL, 'Ley 431 Art. 140'),
  ('especial',      'Licencia especial (vehículos agrícolas/construcción)', 60, 'Ley 431 Art. 140'),
  ('permiso',       'Permiso temporal de conducir', 3, 'Ley 431 Art. 147')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.license_categories (code, description, legal_source, sort_order)
VALUES
  ('1',  'Motocicleta o cuadraciclo hasta 125 cc', 'PN material educativo oficial (Man. Motociclista)', 1),
  ('2',  'Motocicleta o cuadraciclo más de 125 cc', 'PN material educativo oficial', 2),
  ('3',  'Vehículos livianos (sedanes, taxis) y toda clase de motocicleta', 'PN material educativo oficial', 3),
  ('4a', 'Vehículos de carga de 4 a 8 toneladas', 'PN trámite oficial agregar categoría', 4),
  ('4b', 'Vehículos transporte selectivo hasta 18 pasajeros', 'PN trámite oficial agregar categoría', 5),
  ('5a', 'Vehículos de carga de 8 a 12 toneladas', 'PN trámite oficial agregar categoría', 6),
  ('5b', 'Vehículos transporte selectivo hasta 25 pasajeros', 'PN trámite oficial agregar categoría', 7),
  ('6a', 'Vehículos de carga de 12 a 18 toneladas', 'PN trámite oficial agregar categoría', 8),
  ('6b', 'Vehículos articulados', 'PN trámite oficial agregar categoría', 9),
  ('7',  'Vehículos de carga mayores de 18 toneladas', 'PN trámite oficial agregar categoría', 10),
  ('8',  'Maquinaria de construcción/agrícola', 'PN trámite oficial categoría 8', 11)
ON CONFLICT (code) DO NOTHING;

-- Matriz categoría↔vehículo: solo moto/auto liviano con base confirmada;
-- resto como REQUIRES_REVIEW (LEGAL_REQUIREMENTS.md §3 y §9)
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
ON CONFLICT (vehicle_type, service_code) DO NOTHING;

INSERT INTO public.insurers (code, name) VALUES
  ('iniser',            'INISER'),
  ('seguros-america',   'Seguros América'),
  ('lafise',            'LAFISE'),
  ('banpro',            'Banpro Seguros'),
  ('assa',              'ASSA'),
  ('mapfre',            'MAPFRE'),
  ('seguros-atlantida', 'Seguros Atlántida'),
  ('bac',               'BAC'),
  ('otra',              'Otra')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.vehicle_types (code, description) VALUES
  ('auto',   'Automóvil genérico'),
  ('sedan',  'Sedán'),
  ('suv',    'SUV'),
  ('pickup', 'Camioneta pickup'),
  ('moto',   'Motocicleta'),
  ('bus',    'Bus/transporte colectivo'),
  ('van',    'Van/minibus'),
  ('otro',   'Otro')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 10. SEED DE REGLAS (LEGAL_REQUIREMENTS.md §9)
-- ============================================================================

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
  ('DUPLICATE_LICENSE',               'driver', 'REQUIRES_REVIEW', FALSE, NULL, 'Integridad interna', 'Número de licencia usado por otro conductor', '{}'),
  ('DUPLICATE_PLATE',                 'vehicle','BLOCKING',        TRUE,  NULL, 'Integridad interna', 'Placa duplicada en otro vehículo vigente', '{}'),
  ('DUPLICATE_VIN',                   'vehicle','REQUIRES_REVIEW', FALSE, NULL, 'Integridad interna', 'VIN/chasis/motor duplicado', '{}'),
  ('INVALID_DATE_RANGE',              'document','BLOCKING',       TRUE,  NULL, 'Integridad de fechas', 'Rango de fechas imposible en documento', '{}'),
  ('FOREIGN_PLATE_PUBLIC_SERVICE',    'vehicle','BLOCKING',        TRUE,  NULL, 'Ley 431 Art. 134', 'Placa extranjera prestando servicio público', '{}'),
  ('PUBLIC_TRANSPORT_CONCESSION_MISSING','pair','REQUIRES_REVIEW', FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Concesión/permiso de transporte público no determinada', '{}'),
  ('REQUIRES_MANUAL_REVIEW',          'document','REQUIRES_REVIEW',FALSE, NULL, 'REQUIRES_MANUAL_LEGAL_REVIEW', 'Documento requiere revisión manual (catch-all)', '{}')
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- 11. BACKFILL (OLD DATA → NEW STRUCTURE). No destructivo.
-- ============================================================================

-- 11.1 Aseguradoras declaradas en vehicles.insurance_company que no estén en catálogo
INSERT INTO public.insurers (code, name)
SELECT DISTINCT
  lower(regexp_replace(btrim(v.insurance_company), '\s+', '-', 'g')) AS code,
  btrim(v.insurance_company) AS name
FROM public.vehicles v
WHERE v.insurance_company IS NOT NULL AND btrim(v.insurance_company) <> ''
ON CONFLICT (code) DO NOTHING;

-- 11.2 Tipos de vehículo existentes que falten en catálogo
INSERT INTO public.vehicle_types (code)
SELECT DISTINCT lower(btrim(v.type))
FROM public.vehicles v
WHERE v.type IS NOT NULL AND btrim(v.type) <> ''
ON CONFLICT (code) DO NOTHING;

-- 11.3 drivers.license_* → driver_licenses (1 fila vigente por driver con datos)
--      documents_status='verified' queda 'in_review': NUNCA verified automático.
INSERT INTO public.driver_licenses (
  driver_id, license_number, license_type, categories, issue_date, expiry_date,
  document_path, document_path_back, status, verification_method, is_current
)
SELECT
  d.id, d.license_number, 'ordinaria', '{}', NULL, d.license_expiry,
  d.license_photo_front, d.license_photo_back,
  (CASE WHEN d.documents_status = 'verified' THEN 'in_review' ELSE 'pending' END)::public.document_status,
  'migrated', TRUE
FROM public.drivers d
WHERE d.deleted_at IS NULL
  AND (d.license_number IS NOT NULL OR d.license_expiry IS NOT NULL
       OR d.license_photo_front IS NOT NULL OR d.license_photo_back IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.driver_licenses dl
    WHERE dl.driver_id = d.id AND dl.is_current = TRUE
  );

-- 11.4 vehicles.registration_* → vehicle_circulation_cards
--      registration_expiry se preserva como declared_valid_until (informativo).
INSERT INTO public.vehicle_circulation_cards (
  vehicle_id, card_number, issued_at, declared_valid_until,
  declared_plate, declared_vin, declared_chasis, declared_motor,
  declared_brand, declared_model, declared_year, declared_color,
  declared_vehicle_class, declared_service_type,
  document_path, document_path_back, status, verification_method, is_current
)
SELECT
  v.id, v.registration_number, v.emission_date, v.registration_expiry,
  v.plate, v.vin, v.chasis, v.motor,
  v.brand, v.model, v.year, v.color,
  v.vehicle_class, v.service_type,
  v.registration_photo_front, v.registration_photo_back,
  'pending'::public.document_status, 'migrated', TRUE
FROM public.vehicles v
WHERE v.deleted_at IS NULL
  AND (v.registration_number IS NOT NULL OR v.registration_expiry IS NOT NULL
       OR v.registration_photo_front IS NOT NULL OR v.registration_photo_back IS NOT NULL
       OR v.emission_date IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_circulation_cards c
    WHERE c.vehicle_id = v.id AND c.is_current = TRUE
  );

-- 11.5 vehicles.insurance_* → vehicle_insurance_policies (cobertura RC obligatoria)
INSERT INTO public.vehicle_insurance_policies (
  vehicle_id, policy_number, insurer_code, insurer_name, coverage_type,
  effective_from, effective_until, insured_plate, insured_vin, insured_motor, insured_chasis,
  document_path, status, verification_method, is_current
)
SELECT
  v.id, v.insurance_number,
  CASE WHEN v.insurance_company IS NOT NULL AND btrim(v.insurance_company) <> ''
       THEN lower(regexp_replace(btrim(v.insurance_company), '\s+', '-', 'g'))
       ELSE NULL END,
  v.insurance_company, 'rc_obligatorio',
  v.insurance_start_date, v.insurance_expiry,
  v.plate, v.vin, v.motor, v.chasis,
  v.insurance_photo, 'pending'::public.document_status, 'migrated', TRUE
FROM public.vehicles v
WHERE v.deleted_at IS NULL
  AND (v.insurance_number IS NOT NULL OR v.insurance_expiry IS NOT NULL
       OR v.insurance_company IS NOT NULL OR v.insurance_photo IS NOT NULL)
  AND NOT EXISTS (
    SELECT 1 FROM public.vehicle_insurance_policies p
    WHERE p.vehicle_id = v.id AND p.coverage_type = 'rc_obligatorio' AND p.is_current = TRUE
  );

-- ============================================================================
-- 12. VALIDACIÓN POST-MIGRACIÓN (reporte por NOTICE)
-- ============================================================================

DO $$
DECLARE
  v_legacy_license INT;  v_new_license INT;
  v_legacy_reg INT;      v_new_cards INT;
  v_legacy_ins INT;      v_new_ins INT;
BEGIN
  SELECT COUNT(*) INTO v_legacy_license FROM public.drivers
    WHERE deleted_at IS NULL AND (license_number IS NOT NULL OR license_expiry IS NOT NULL
      OR license_photo_front IS NOT NULL OR license_photo_back IS NOT NULL);
  SELECT COUNT(*) INTO v_new_license FROM public.driver_licenses
    WHERE is_current = TRUE AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_legacy_reg FROM public.vehicles
    WHERE deleted_at IS NULL AND (registration_number IS NOT NULL OR registration_expiry IS NOT NULL
      OR registration_photo_front IS NOT NULL OR registration_photo_back IS NOT NULL
      OR emission_date IS NOT NULL);
  SELECT COUNT(*) INTO v_new_cards FROM public.vehicle_circulation_cards
    WHERE is_current = TRUE AND deleted_at IS NULL;
  SELECT COUNT(*) INTO v_legacy_ins FROM public.vehicles
    WHERE deleted_at IS NULL AND (insurance_number IS NOT NULL OR insurance_expiry IS NOT NULL
      OR insurance_company IS NOT NULL OR insurance_photo IS NOT NULL);
  SELECT COUNT(*) INTO v_new_ins FROM public.vehicle_insurance_policies
    WHERE coverage_type = 'rc_obligatorio' AND is_current = TRUE AND deleted_at IS NULL;

  RAISE NOTICE 'VALIDATION licenses: legacy=% migrated=%', v_legacy_license, v_new_license;
  RAISE NOTICE 'VALIDATION circulation: legacy=% migrated=%', v_legacy_reg, v_new_cards;
  RAISE NOTICE 'VALIDATION insurance: legacy=% migrated=%', v_legacy_ins, v_new_ins;
  IF v_new_license < v_legacy_license OR v_new_cards < v_legacy_reg OR v_new_ins < v_legacy_ins THEN
    RAISE WARNING 'VALIDATION FAILED: migrated rows < legacy rows. Revisar backfill.';
  END IF;
END $$;

-- ============================================================================
-- 13. STORAGE: cerrar bucket drivers-documents a privado (hallazgo de seguridad)
-- ============================================================================

DO $$ BEGIN
  UPDATE storage.buckets SET public = FALSE
  WHERE id = 'drivers-documents' AND public = TRUE;
  RAISE NOTICE 'Bucket drivers-documents: public=false aplicado (signed URLs requeridas)';
EXCEPTION
  WHEN insufficient_privilege OR undefined_table THEN
    RAISE NOTICE 'Sin permisos para storage.buckets. Cerrar manualmente: Supabase > Storage > drivers-documents > Make private';
END $$;

COMMIT;

-- ============================================================================
-- NOTAS DE ROLLBACK
--   Las columnas legacy quedan intactas. Para revertir:
--   DROP TABLE los objetos nuevos de este script y DROP TYPE los enums nuevos.
--   drivers.compliance_status / vehicles.compliance_status pueden eliminarse
--   con ALTER TABLE ... DROP COLUMN si se decide descartar el diseño.
--   El bucket puede volverse público con UPDATE storage.buckets SET public=TRUE.
-- ============================================================================
