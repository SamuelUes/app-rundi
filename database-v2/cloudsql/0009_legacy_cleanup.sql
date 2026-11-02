-- ============================================================================
-- 0009_legacy_cleanup.sql — UPGRADE del esquema legacy ya desplegado.
--
-- 0001-0008 usan CREATE ... IF NOT EXISTS: sobre una base que ya tenía el
-- esquema anterior (adaptado de supabase-only.sql) las tablas viejas quedan
-- intactas y las nuevas nacen vacías. Este archivo cierra la brecha:
--
--   * migra datos de tablas renombradas (drivers_recharges, driver_penalties,
--     cms_complaints, cms_operator_actions, support_call_sessions,
--     ride_call_sessions, ride_locations type='tracking') a las nuevas
--   * renombra columnas (designated_rol_requested → designated_role_status)
--   * agrega columnas nuevas que el CREATE IF NOT EXISTS saltó
--   * aplica casts VARCHAR → enum y TIMESTAMP → TIMESTAMPTZ en tablas viejas
--   * payments.total → columna GENERATED
--   * borra tablas/catálogos/enums muertos e índices redundantes
--   * agrega las FKs/CHECKs nuevas a tablas viejas (NOT VALID + validación
--     tolerante: datos legacy huérfanos dejan el constraint NOT VALID — sigue
--     aplicando a escrituras nuevas — con WARNING en vez de abortar el deploy)
--
-- IDEMPOTENTE: cada operación está guardada; en una base ya limpia no hace nada.
-- Política de datos: si una tabla legacy tiene filas no migrables (huérfanos,
-- dominio violado), se copian las válidas, se hace WARNING y la tabla vieja SE
-- CONSERVA (no se pierde ledger/historial) — revisar y borrar a mano.
--
-- REQUISITO: correr como OWNER del esquema public (postgres/cloudsqlsuperuser
-- u otro rol dueño de las tablas) — NO como rundi_app (ALTER TABLE exige
-- ownership). Los helpers se crean en public (persisten entre statements y
-- runners que ejecutan statement por statement) y se borran al final.
-- ============================================================================

-- ============================================
-- 0a) Guard: debe correr como dueño de las tablas (o rol miembro del dueño),
--     no como rundi_app. El error lista los owners reales.
-- ============================================
DO $$
DECLARE v_owners text; v_denied boolean;
BEGIN
  SELECT string_agg(DISTINCT tableowner, ', '),
         bool_or(tableowner <> current_user
                 AND NOT pg_has_role(current_user, tableowner, 'USAGE'))
    INTO v_owners, v_denied
  FROM pg_tables
  WHERE schemaname='public' AND tablename IN ('rides','drivers','payments','users');
  IF v_denied THEN
    RAISE EXCEPTION
      '0009 debe correr como owner de las tablas (o rol miembro del owner). Owners actuales: %. current_user=% — conéctate como el rol dueño.',
      v_owners, current_user;
  END IF;
END $$;

-- ============================================
-- 0b) HELPERS en public (limpios al final; se crean aunque el runner corte)
-- ============================================
DROP FUNCTION IF EXISTS public.mig_table_exists(text);
DROP FUNCTION IF EXISTS public.mig_col_exists(text, text);
DROP FUNCTION IF EXISTS public.mig_enum_add(text, text);
DROP FUNCTION IF EXISTS public.mig_drop_pred_indexes(text, text);
DROP FUNCTION IF EXISTS public.mig_cast_to_enum(text, text, text);
DROP FUNCTION IF EXISTS public.mig_cast_to_text(text, text, text);
DROP FUNCTION IF EXISTS public.mig_add_fk(text, text, text);
DROP FUNCTION IF EXISTS public.mig_add_check(text, text, text);
DROP FUNCTION IF EXISTS public.mig_try_validate(text, text);
DROP FUNCTION IF EXISTS public.mig_to_timestamptz();

BEGIN;

CREATE OR REPLACE FUNCTION public.mig_table_exists(p_name text) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema='public' AND table_name=p_name AND table_type='BASE TABLE');
$$;

CREATE OR REPLACE FUNCTION public.mig_col_exists(p_table text, p_col text) RETURNS boolean
LANGUAGE sql AS $$
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name=p_table AND column_name=p_col);
$$;

-- ADD VALUE IF NOT EXISTS sobre enums ya creados (dominios ampliados).
-- PG permite ADD VALUE dentro de tx si el valor no se usa en la misma tx.
CREATE OR REPLACE FUNCTION public.mig_enum_add(p_enum text, p_val text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace
             WHERE n.nspname='public' AND t.typname=p_enum)
     AND NOT EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
                     JOIN pg_namespace n ON n.oid=t.typnamespace
                     WHERE n.nspname='public' AND t.typname=p_enum AND e.enumlabel=p_val) THEN
    EXECUTE format('ALTER TYPE public.%I ADD VALUE %L', p_enum, p_val);
  END IF;
END $$;

-- Borra índices cuyo PREDICADO parcial referencia la columna (un cast cambiaría
-- la coercion del literal → error "functions in index predicate must be
-- IMMUTABLE"). Los índices de clave plana se reconstruyen solos; los parciales
-- afectados se recrean en §14b.
CREATE OR REPLACE FUNCTION public.mig_drop_pred_indexes(p_table text, p_col text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_idx text;
BEGIN
  FOR v_idx IN
    SELECT ci.relname
    FROM pg_index ix
    JOIN pg_class ci ON ci.oid = ix.indexrelid
    JOIN pg_class rel ON rel.oid = ix.indrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    WHERE n.nspname='public' AND rel.relname=p_table AND ix.indpred IS NOT NULL
      AND pg_get_expr(ix.indpred, ix.indrelid) ~ ('(^|[^a-zA-Z0-9_])' || p_col || '([^a-zA-Z0-9_]|$)')
  LOOP
    RAISE NOTICE 'mig: drop índice parcial % (predicado sobre %.%)', v_idx, p_table, p_col;
    EXECUTE format('DROP INDEX public.%I', v_idx);
  END LOOP;
END $$;

-- VARCHAR/TEXT/enum-ajeno → enum, SOLO si todos los valores caen en el dominio.
-- Borra CHECKs de una sola columna (VARCHAR+CHECK legacy) y preserva el DEFAULT.
CREATE OR REPLACE FUNCTION public.mig_cast_to_enum(p_table text, p_col text, p_enum text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_bad bigint;
  v_con text;
  v_default text;
BEGIN
  IF NOT public.mig_col_exists(p_table, p_col) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema='public' AND table_name=p_table AND column_name=p_col
               AND data_type='USER-DEFINED' AND udt_name=p_enum) THEN RETURN; END IF;

  EXECUTE format(
    'SELECT count(*) FROM public.%I t WHERE t.%I IS NOT NULL AND t.%I::text <> ALL(
       SELECT e.enumlabel FROM pg_enum e JOIN pg_type y ON y.oid=e.enumtypid
       JOIN pg_namespace n ON n.oid=y.typnamespace
       WHERE n.nspname=''public'' AND y.typname=%L)',
    p_table, p_col, p_col, p_enum) INTO v_bad;
  IF v_bad > 0 THEN
    RAISE WARNING 'mig: %.% tiene % valores fuera de % — cast omitido', p_table, p_col, v_bad, p_enum;
    RETURN;
  END IF;

  SELECT column_default INTO v_default FROM information_schema.columns
   WHERE table_schema='public' AND table_name=p_table AND column_name=p_col;

  FOR v_con IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY(con.conkey)
    WHERE n.nspname='public' AND rel.relname=p_table AND con.contype='c'
      AND a.attname=p_col AND array_length(con.conkey,1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_con);
  END LOOP;

  PERFORM public.mig_drop_pred_indexes(p_table, p_col);

  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT', p_table, p_col);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE public.%I USING %I::text::public.%I',
                 p_table, p_col, p_enum, p_col, p_enum);
  IF v_default IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I SET DEFAULT (%s)::text::public.%I',
                   p_table, p_col, v_default, p_enum);
  END IF;
END $$;

-- enum-ajeno → VARCHAR (enums legacy que el diseño nuevo deja como texto abierto).
CREATE OR REPLACE FUNCTION public.mig_cast_to_text(p_table text, p_col text, p_type text) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE v_con text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema='public' AND table_name=p_table AND column_name=p_col
                   AND data_type='USER-DEFINED') THEN RETURN; END IF;
  FOR v_con IN
    SELECT con.conname FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace n ON n.oid = rel.relnamespace
    JOIN pg_attribute a ON a.attrelid = rel.oid AND a.attnum = ANY(con.conkey)
    WHERE n.nspname='public' AND rel.relname=p_table AND con.contype='c'
      AND a.attname=p_col AND array_length(con.conkey,1) = 1
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP CONSTRAINT %I', p_table, v_con);
  END LOOP;
  PERFORM public.mig_drop_pred_indexes(p_table, p_col);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I DROP DEFAULT', p_table, p_col);
  EXECUTE format('ALTER TABLE public.%I ALTER COLUMN %I TYPE %s USING %I::text::%s',
                 p_table, p_col, p_type, p_col, p_type);
END $$;

-- ADD CONSTRAINT FK/CHECK IF NOT EXISTS (como NOT VALID: no escanea filas viejas).
CREATE OR REPLACE FUNCTION public.mig_add_fk(p_table text, p_con text, p_def text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.mig_table_exists(p_table) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c
             JOIN pg_class r ON r.oid=c.conrelid
             JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE n.nspname='public' AND r.relname=p_table AND c.conname=p_con) THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I %s NOT VALID', p_table, p_con, p_def);
END $$;

CREATE OR REPLACE FUNCTION public.mig_add_check(p_table text, p_con text, p_expr text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT public.mig_table_exists(p_table) THEN RETURN; END IF;
  IF EXISTS (SELECT 1 FROM pg_constraint c
             JOIN pg_class r ON r.oid=c.conrelid
             JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE n.nspname='public' AND r.relname=p_table AND c.conname=p_con) THEN RETURN; END IF;
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (%s) NOT VALID', p_table, p_con, p_expr);
END $$;

-- VALIDATE tolerante: violaciones legacy dejan el constraint NOT VALID (sigue
-- aplicando a filas nuevas) con WARNING — nunca aborta el deploy.
CREATE OR REPLACE FUNCTION public.mig_try_validate(p_table text, p_con text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint c
                 JOIN pg_class r ON r.oid=c.conrelid
                 JOIN pg_namespace n ON n.oid=r.relnamespace
                 WHERE n.nspname='public' AND r.relname=p_table AND c.conname=p_con
                   AND NOT c.convalidated) THEN RETURN; END IF;
  BEGIN
    EXECUTE format('ALTER TABLE public.%I VALIDATE CONSTRAINT %I', p_table, p_con);
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'mig: % en % queda NOT VALID — %', p_con, p_table, SQLERRM;
  END;
END $$;

-- TIMESTAMP WITHOUT TIME ZONE → TIMESTAMPTZ en todas las tablas base.
-- AT TIME ZONE 'UTC' explícito: interpreta los valores naive como UTC sin
-- depender del TimeZone de sesión del runner.
CREATE OR REPLACE FUNCTION public.mig_to_timestamptz() RETURNS void
LANGUAGE plpgsql AS $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT c.table_name, c.column_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema=c.table_schema AND t.table_name=c.table_name AND t.table_type='BASE TABLE'
    WHERE c.table_schema='public' AND c.udt_name='timestamp'
  LOOP
    EXECUTE format(
      'ALTER TABLE public.%I ALTER COLUMN %I TYPE TIMESTAMPTZ USING %I AT TIME ZONE ''UTC''',
      r.table_name, r.column_name, r.column_name);
  END LOOP;
END $$;

-- ============================================
-- 1) DOMINIOS ENUM — sync de valores agregados post-baseline
--    (ride_location_type se recrea aparte en §8)
-- ============================================
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('driver_account_status','pending'),('driver_account_status','active'),
    ('driver_account_status','suspended'),('driver_account_status','rejected'),
    ('driver_documents_status','pending'),('driver_documents_status','verified'),
    ('driver_documents_status','active'),('driver_documents_status','suspended'),
    ('driver_documents_status','rejected'),
    ('designated_role_request_status','pending'),('designated_role_request_status','requested'),
    ('designated_role_request_status','verified'),('designated_role_request_status','rejected'),
    ('designated_role_request_status','revoked'),
    ('app_role','client'),('app_role','driver'),('app_role','designated_driver'),
    ('app_role','operator'),('app_role','admin'),('app_role','system'),
    ('ride_status','requested'),('ride_status','driver_offered'),('ride_status','accepted'),
    ('ride_status','driver_on_route'),('ride_status','driver_arrived'),('ride_status','in_progress'),
    ('ride_status','pending_payment'),('ride_status','rating_completed'),
    ('ride_status','rating_skipped'),('ride_status','completed'),('ride_status','canceled'),
    ('ride_canceled_by','client'),('ride_canceled_by','driver'),
    ('ride_follower_status','active'),('ride_follower_status','completed'),
    ('ride_follower_status','abandoned'),('ride_follower_status','canceled'),
    ('ride_type','normal'),('ride_type','designated_driver'),
    ('designated_driver_vehicle','auto'),('designated_driver_vehicle','moto'),
    ('ride_payment_type','cash'),('ride_payment_type','card_local'),('ride_payment_type','stripe'),
    ('biometric_type','fingerprint'),('biometric_type','face_id'),
    ('biometric_type','biometric'),('biometric_type','NOT_SUPPORTED'),
    ('ride_offer_kind','offer'),('ride_offer_kind','counter_offer'),
    ('ride_offer_status','sent'),('ride_offer_status','accepted'),
    ('ride_offer_status','rejected'),('ride_offer_status','expired'),('ride_offer_status','canceled'),
    ('payment_status','pending'),('payment_status','pending_confirmation'),
    ('payment_status','payment_in_progress'),('payment_status','in_progress'),
    ('payment_status','processing'),('payment_status','pending_capture'),
    ('payment_status','payment_completed'),('payment_status','completed'),
    ('payment_status','confirmed'),('payment_status','failed'),('payment_status','canceled'),
    ('commission_status','pending'),('commission_status','paid'),
    ('payment_method','cash'),('payment_method','card'),
    ('payment_provider','cash'),('payment_provider','local'),
    ('local_bank','bac'),('local_bank','banpro'),('local_bank','lafise'),
    ('local_bank','ficohsa'),('local_bank','avanz'),
    ('payment_auth_method','biometric'),('payment_auth_method','sms'),
    ('payment_auth_method','manual'),('payment_auth_method','code'),
    ('wallet_movement_type','recharge'),('wallet_movement_type','deduction'),
    ('wallet_movement_type','commission_deduction'),('wallet_movement_type','adjustment'),
    ('wallet_movement_source','manual'),('wallet_movement_source','webhook'),
    ('wallet_movement_source','puntoexpress_webhook'),
    ('wallet_movement_source','ride_payment_completion'),('wallet_movement_source','system'),
    ('wallet_movement_status','pending'),('wallet_movement_status','confirmed'),
    ('wallet_movement_status','failed'),
    ('emergency_type','police'),('emergency_type','ambulance'),
    ('emergency_call_status','initiated'),('emergency_call_status','completed'),
    ('emergency_call_status','canceled'),
    ('inspection_status','pending'),('inspection_status','completed'),('inspection_status','failed'),
    ('call_session_type','ride'),('call_session_type','support'),
    ('call_direction','client_to_driver'),('call_direction','driver_to_client'),
    ('call_direction','operator_to_client'),('call_direction','client_to_operator'),
    ('call_status','initiated'),('call_status','ringing_client'),('call_status','ringing_operator'),
    ('call_status','ringing_driver'),('call_status','accepted'),('call_status','rejected'),
    ('call_status','missed'),('call_status','connected'),('call_status','ended'),
    ('complaint_status','open'),('complaint_status','in_progress'),
    ('complaint_status','resolved'),('complaint_status','rejected'),
    ('complaint_priority','low'),('complaint_priority','normal'),
    ('complaint_priority','high'),('complaint_priority','urgent'),
    ('complaint_category','service'),('complaint_category','driver'),
    ('complaint_category','payment'),('complaint_category','app'),('complaint_category','other'),
    ('complaint_visibility','All'),('complaint_visibility','only_platform'),
    ('operator_target_type','ride'),('operator_target_type','driver'),
    ('operator_target_type','client'),('operator_target_type','payment'),
    ('operator_target_type','service'),('operator_target_type','complaint'),
    ('operator_target_type','other'),
    ('audit_action','create'),('audit_action','update'),('audit_action','delete'),
    ('audit_action','restore'),('audit_action','cancel'),('audit_action','complete'),
    ('audit_entity_type','ride'),('audit_entity_type','driver'),
    ('audit_entity_type','driver_service'),('audit_entity_type','payment'),
    ('audit_entity_type','rating'),('audit_entity_type','vehicle'),
    ('audit_entity_type','complaint'),('audit_entity_type','user'),
    ('audit_source','api'),('audit_source','trigger'),('audit_source','scheduled'),
    ('audit_source','manual'),
    ('document_status','pending'),('document_status','in_review'),
    ('document_status','verified'),('document_status','rejected'),
    ('document_status','requires_review'),('document_status','expired'),
    ('verification_method','manual'),('verification_method','ocr'),
    ('verification_method','api'),('verification_method','migrated'),
    ('verification_method','self_declared'),
    ('license_type','ordinaria'),('license_type','profesional'),
    ('license_type','menor_de_edad'),('license_type','especial'),('license_type','permiso'),
    ('insurance_coverage_type','rc_obligatorio'),('insurance_coverage_type','pasajeros'),
    ('insurance_coverage_type','danios_propios'),('insurance_coverage_type','licencia_conductor'),
    ('insurance_coverage_type','otro'),
    ('document_check_result','approved'),('document_check_result','rejected'),
    ('document_check_result','conditional'),
    ('driver_compliance_status','pending_documents'),('driver_compliance_status','under_review'),
    ('driver_compliance_status','verified'),('driver_compliance_status','expiring'),
    ('driver_compliance_status','non_compliant'),('driver_compliance_status','suspended'),
    ('vehicle_compliance_status','pending_verification'),('vehicle_compliance_status','active'),
    ('vehicle_compliance_status','non_compliant'),('vehicle_compliance_status','expired_documents'),
    ('vehicle_compliance_status','suspended'),
    ('outbox_status','pending'),('outbox_status','published'),('outbox_status','failed')
  ) v(t, val) LOOP
    PERFORM public.mig_enum_add(r.t, r.val);
  END LOOP;
END $$;

COMMIT;
BEGIN;
-- ^ Segunda transacción: ALTER TYPE ... ADD VALUE dentro de una tx marca los
-- valores nuevos como "unsafe use" en la misma tx — si datos legacy llegaran a
-- contener un valor recién agregado, el cast de §8 fallaría. Commit intermedio
-- lo resuelve de forma segura.

-- ============================================
-- 2) VISTAS dependientes — drop temprano (bloquean ALTER COLUMN TYPE);
--    se recrean al final con su definición nueva.
-- ============================================
DROP VIEW IF EXISTS public.rides_with_complete_route CASCADE;
DROP VIEW IF EXISTS public.driver_active_services CASCADE;
DROP VIEW IF EXISTS public.services_stats CASCADE;

-- ============================================
-- 3) RENAMES de columnas en tablas que sobreviven
-- ============================================
DO $$ BEGIN
  IF public.mig_col_exists('drivers','designated_rol_requested')
     AND NOT public.mig_col_exists('drivers','designated_role_status') THEN
    ALTER TABLE public.drivers RENAME COLUMN designated_rol_requested TO designated_role_status;
  END IF;
END $$;
-- El índice viejo sobrevive al rename con nombre viejo → fuera (0002 crea el nuevo).
DROP INDEX IF EXISTS public.idx_drivers_designated_rol_requested;

-- ============================================
-- 4) COLUMNAS nuevas en tablas preexistentes (CREATE IF NOT EXISTS las saltó)
-- ============================================
ALTER TABLE public.rides     ADD COLUMN IF NOT EXISTS service_area_id VARCHAR(100);
ALTER TABLE public.rides     ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;
ALTER TABLE public.rides     ADD COLUMN IF NOT EXISTS pricing_snapshot JSONB;
ALTER TABLE public.rides     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.drivers   ADD COLUMN IF NOT EXISTS compliance_status public.driver_compliance_status NOT NULL DEFAULT 'pending_documents';
ALTER TABLE public.drivers   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.vehicles  ADD COLUMN IF NOT EXISTS compliance_status public.vehicle_compliance_status NOT NULL DEFAULT 'pending_verification';
ALTER TABLE public.vehicles  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.payments  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.ratings   ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS request_id VARCHAR(64);
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS max_attempts INTEGER NOT NULL DEFAULT 15;
ALTER TABLE public.outbox_events ADD COLUMN IF NOT EXISTS failed_at TIMESTAMPTZ;
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS auth_provider VARCHAR(30);
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS notifications_enabled BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS last_seen_at TIMESTAMPTZ;
ALTER TABLE public.users     ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;

-- ============================================
-- 5) COLUMNAS eliminadas (Outbox reemplazó el flag de sync; Firebase ya no
--    es destino de escrituras)
-- ============================================
DROP INDEX IF EXISTS public.idx_payments_sync_status;
ALTER TABLE public.payments DROP COLUMN IF EXISTS synced_to_firebase;
ALTER TABLE public.payments DROP COLUMN IF EXISTS firebase_synced_at;
-- cms_complaints.call_* no migran: el vínculo lo cubre call_sessions.complaint_id
-- (mueren con la tabla en §8).

-- ============================================
-- 6) MIGRACIÓN DE DATOS legacy → tablas nuevas
-- ============================================

-- 6a) ride_locations type='tracking' → ride_track_points
--     (recorded_at ← created_at: el viejo esquema no guardaba el timestamp de muestra)
DO $$
DECLARE v_moved bigint; v_purged bigint;
BEGIN
  IF public.mig_table_exists('ride_locations') AND public.mig_table_exists('ride_track_points') THEN
    INSERT INTO public.ride_track_points (ride_id, latitude, longitude, recorded_at, created_at)
    SELECT l.ride_id, l.latitude, l.longitude, l.created_at, l.created_at
    FROM public.ride_locations l
    WHERE l.location_type::text = 'tracking'
      AND EXISTS (SELECT 1 FROM public.rides r WHERE r.id = l.ride_id)
    ON CONFLICT (id) DO NOTHING;
    GET DIAGNOSTICS v_moved = ROW_COUNT;

    DELETE FROM public.ride_locations WHERE location_type::text = 'tracking';
    GET DIAGNOSTICS v_purged = ROW_COUNT;
    -- cualquier valor fuera del dominio nuevo rompería el cast a enum
    DELETE FROM public.ride_locations WHERE location_type::text NOT IN ('origin','waypoint','destination');

    IF v_moved > 0 OR v_purged > 0 THEN
      RAISE NOTICE 'mig: ride_locations tracking → % puntos a ride_track_points (% purgados)', v_moved, v_purged;
    END IF;
  END IF;
END $$;

-- 6b) drivers_recharges → driver_wallet_movements
DO $$
DECLARE v_copied bigint; v_skip bigint;
BEGIN
  IF NOT public.mig_table_exists('drivers_recharges') THEN RETURN; END IF;
  IF NOT public.mig_table_exists('driver_wallet_movements') THEN RETURN; END IF;

  INSERT INTO public.driver_wallet_movements
    (id, driver_id, ride_id, movement_type, source, amount, balance_before, balance_after,
     external_reference, external_transaction_id, metadata, status, created_at, updated_at)
  SELECT r.id, r.driver_id, r.ride_id,
         CASE r.recharge_type::text
           WHEN 'recharge' THEN 'recharge'
           WHEN 'deduction' THEN 'deduction'
           WHEN 'commission_deduction' THEN 'commission_deduction'
           WHEN 'commission' THEN 'commission_deduction'
           WHEN 'adjustment' THEN 'adjustment'
           ELSE 'adjustment' END::public.wallet_movement_type,
         CASE r.source::text
           WHEN 'manual' THEN 'manual'
           WHEN 'webhook' THEN 'webhook'
           WHEN 'puntoexpress_webhook' THEN 'puntoexpress_webhook'
           WHEN 'ride_payment_completion' THEN 'ride_payment_completion'
           ELSE 'system' END::public.wallet_movement_source,
         r.amount, r.balance_before, r.balance_after,
         r.external_reference, r.external_transaction_id,
         COALESCE(r.metadata, '{}'::jsonb) || jsonb_build_object('legacy', 'drivers_recharges'),
         CASE r.status::text WHEN 'pending' THEN 'pending' WHEN 'failed' THEN 'failed'
              ELSE 'confirmed' END::public.wallet_movement_status,
         r.created_at, r.updated_at
  FROM public.drivers_recharges r
  WHERE EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = r.driver_id)
    AND (r.status::text <> 'confirmed' OR r.balance_after = r.balance_before + r.amount)
  ON CONFLICT (id) DO NOTHING;
  GET DIAGNOSTICS v_copied = ROW_COUNT;

  SELECT count(*) INTO v_skip FROM public.drivers_recharges r
   WHERE NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = r.driver_id)
      OR NOT EXISTS (SELECT 1 FROM public.driver_wallet_movements w WHERE w.id = r.id);

  IF v_skip = 0 THEN
    DROP TABLE public.drivers_recharges;
    RAISE NOTICE 'mig: drivers_recharges migrada (% filas) y eliminada', v_copied;
  ELSE
    RAISE WARNING 'mig: drivers_recharges tiene % filas no migrables (driver huérfano o balance inconsistente) — tabla conservada, revisar a mano', v_skip;
  END IF;
END $$;

-- 6c) driver_penalties → driver_wallet_movements (deduction)
DO $$
DECLARE v_skip bigint;
BEGIN
  IF NOT public.mig_table_exists('driver_penalties') THEN RETURN; END IF;
  IF NOT public.mig_table_exists('driver_wallet_movements') THEN RETURN; END IF;

  INSERT INTO public.driver_wallet_movements
    (driver_id, ride_id, movement_type, source, amount, balance_before, balance_after,
     metadata, status, created_at, updated_at)
  SELECT p.driver_id, p.ride_id,
         'deduction'::public.wallet_movement_type, 'system'::public.wallet_movement_source,
         -ABS(p.amount), 0, -ABS(p.amount),   -- balance sintetizado consistente con el CHECK
         jsonb_build_object(
           'legacy', 'driver_penalties', 'legacy_penalty_id', p.id::text,
           'penalty_type', p.penalty_type, 'reason', p.reason,
           'progress_percentage', p.progress_percentage, 'cancel_reason', p.cancel_reason,
           'deducted_at', p.deducted_at, 'balance_synthesized', true),
         CASE p.status::text WHEN 'applied' THEN 'confirmed' WHEN 'canceled' THEN 'failed'
              ELSE 'pending' END::public.wallet_movement_status,
         COALESCE(p.deducted_at, p.created_at), p.updated_at
  FROM public.driver_penalties p
  WHERE EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = p.driver_id)
    AND NOT EXISTS (SELECT 1 FROM public.driver_wallet_movements w
                    WHERE w.metadata->>'legacy_penalty_id' = p.id::text);

  SELECT count(*) INTO v_skip FROM public.driver_penalties p
   WHERE NOT EXISTS (SELECT 1 FROM public.drivers d WHERE d.user_id = p.driver_id);

  IF v_skip = 0 THEN
    DROP TABLE public.driver_penalties;
    RAISE NOTICE 'mig: driver_penalties plegada a wallet y eliminada';
  ELSE
    RAISE WARNING 'mig: driver_penalties tiene % filas con driver huérfano — tabla conservada', v_skip;
  END IF;
END $$;

-- 6d) cms_complaints → support_complaints (show → visibility; 'closed' → 'resolved')
DO $$
DECLARE v_has_deleted boolean; v_skip bigint;
BEGIN
  IF NOT public.mig_table_exists('cms_complaints') THEN RETURN; END IF;
  IF NOT public.mig_table_exists('support_complaints') THEN RETURN; END IF;
  v_has_deleted := public.mig_col_exists('cms_complaints','deleted_at');

  EXECUTE format($q$
    INSERT INTO public.support_complaints
      (id, ride_id, client_id, driver_id, created_by_user_id, created_by_role,
       assigned_to_user_id, category, status, priority, title, description,
       resolution_notes, chat_log_url, visibility, resolved_at,
       created_at, updated_at%s)
    SELECT c.id,
           CASE WHEN c.ride_id IS NOT NULL AND rr.id IS NULL THEN NULL ELSE c.ride_id END,
           CASE WHEN c.client_id IS NOT NULL AND uc.id IS NULL THEN NULL ELSE c.client_id END,
           CASE WHEN c.driver_id IS NOT NULL AND dd.user_id IS NULL THEN NULL ELSE c.driver_id END,
           c.created_by_user_id,
           CASE WHEN c.created_by_role::text IN ('client','driver','designated_driver','operator','admin','system')
                THEN c.created_by_role::text ELSE 'operator' END::public.app_role,
           CASE WHEN c.assigned_to_user_id IS NOT NULL AND ua.id IS NULL THEN NULL ELSE c.assigned_to_user_id END,
           CASE c.category::text WHEN 'service' THEN 'service' WHEN 'driver' THEN 'driver'
                WHEN 'payment' THEN 'payment' WHEN 'app' THEN 'app' ELSE 'other' END::public.complaint_category,
           CASE c.status::text WHEN 'open' THEN 'open' WHEN 'in_progress' THEN 'in_progress'
                WHEN 'resolved' THEN 'resolved' WHEN 'rejected' THEN 'rejected'
                WHEN 'closed' THEN 'resolved' ELSE 'open' END::public.complaint_status,
           CASE c.priority::text WHEN 'low' THEN 'low' WHEN 'normal' THEN 'normal'
                WHEN 'high' THEN 'high' WHEN 'urgent' THEN 'urgent' ELSE NULL END::public.complaint_priority,
           c.title, c.description, c.resolution_notes, c.chat_log_url,
           CASE WHEN c."show"::text = 'only_platform' THEN 'only_platform' ELSE 'All' END::public.complaint_visibility,
           c.resolved_at, c.created_at, c.updated_at%s
    FROM public.cms_complaints c
    LEFT JOIN public.rides   rr ON rr.id = c.ride_id
    LEFT JOIN public.users   uc ON uc.id = c.client_id
    LEFT JOIN public.drivers dd ON dd.user_id = c.driver_id
    LEFT JOIN public.users   ua ON ua.id = c.assigned_to_user_id
    WHERE EXISTS (SELECT 1 FROM public.users ub WHERE ub.id = c.created_by_user_id)
    ON CONFLICT (id) DO NOTHING$q$,
    CASE WHEN v_has_deleted THEN ', deleted_at' ELSE '' END,
    CASE WHEN v_has_deleted THEN ', c.deleted_at' ELSE '' END);

  SELECT count(*) INTO v_skip FROM public.cms_complaints c
   WHERE NOT EXISTS (SELECT 1 FROM public.users ub WHERE ub.id = c.created_by_user_id);

  IF v_skip = 0 THEN
    DROP TABLE public.cms_complaints CASCADE;
    RAISE NOTICE 'mig: cms_complaints migrada a support_complaints y eliminada';
  ELSE
    RAISE WARNING 'mig: cms_complaints tiene % filas con creador huérfano en users — tabla conservada', v_skip;
  END IF;
END $$;

-- 6e) cms_operator_actions → operator_actions
DO $$
DECLARE v_skip bigint;
BEGIN
  IF NOT public.mig_table_exists('cms_operator_actions') THEN RETURN; END IF;
  IF NOT public.mig_table_exists('operator_actions') THEN RETURN; END IF;

  INSERT INTO public.operator_actions
    (id, user_id, user_role, action_type, target_type, target_id,
     metadata, ip_address, user_agent, created_at)
  SELECT a.id, a.user_id,
         CASE WHEN a.user_role::text IN ('client','driver','designated_driver','operator','admin','system')
              THEN a.user_role::text ELSE 'operator' END::public.app_role,
         a.action_type,
         CASE a.target_type::text WHEN 'ride' THEN 'ride' WHEN 'driver' THEN 'driver'
              WHEN 'client' THEN 'client' WHEN 'payment' THEN 'payment'
              WHEN 'service' THEN 'service' WHEN 'complaint' THEN 'complaint'
              ELSE 'other' END::public.operator_target_type,
         a.target_id, a.metadata, a.ip_address, a.user_agent, a.created_at
  FROM public.cms_operator_actions a
  WHERE EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT count(*) INTO v_skip FROM public.cms_operator_actions a
   WHERE NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = a.user_id);

  IF v_skip = 0 THEN
    DROP TABLE public.cms_operator_actions;
    RAISE NOTICE 'mig: cms_operator_actions migrada a operator_actions y eliminada';
  ELSE
    RAISE WARNING 'mig: cms_operator_actions tiene % filas con user_id huérfano — tabla conservada', v_skip;
  END IF;
END $$;

-- 6f) support_call_sessions + ride_call_sessions → call_sessions
DO $$
DECLARE v_skip bigint;
BEGIN
  IF public.mig_table_exists('support_call_sessions') AND public.mig_table_exists('call_sessions') THEN
    INSERT INTO public.call_sessions
      (id, call_id, call_type, ride_id, complaint_id, operator_uid, client_uid,
       direction, status, recording_url, signaling_notes,
       created_at, updated_at, connected_at, ended_at)
    SELECT s.id, s.call_id, 'support'::public.call_session_type, s.ride_id, s.complaint_id,
           s.operator_uid, s.client_uid,
           s.direction::text::public.call_direction, s.status::text::public.call_status,
           s.recording_url, s.signaling_notes,
           s.created_at, s.updated_at, s.connected_at, s.ended_at
    FROM public.support_call_sessions s
    WHERE s.operator_uid IS NOT NULL
      AND s.direction::text IN ('operator_to_client','client_to_operator')
      AND s.status::text IN ('initiated','ringing_client','ringing_operator','ringing_driver',
                             'accepted','rejected','missed','connected','ended')
    ON CONFLICT (id) DO NOTHING;

    SELECT count(*) INTO v_skip FROM public.support_call_sessions s
     WHERE s.operator_uid IS NULL
        OR s.direction::text NOT IN ('operator_to_client','client_to_operator')
        OR s.status::text NOT IN ('initiated','ringing_client','ringing_operator','ringing_driver',
                                  'accepted','rejected','missed','connected','ended');

    IF v_skip = 0 THEN
      DROP TABLE public.support_call_sessions;
      RAISE NOTICE 'mig: support_call_sessions migrada a call_sessions y eliminada';
    ELSE
      RAISE WARNING 'mig: support_call_sessions tiene % filas no migrables — tabla conservada', v_skip;
    END IF;
  END IF;

  IF public.mig_table_exists('ride_call_sessions') AND public.mig_table_exists('call_sessions') THEN
    INSERT INTO public.call_sessions
      (id, call_id, call_type, ride_id, client_uid, driver_uid,
       direction, status, recording_url, signaling_notes,
       created_at, updated_at, connected_at, ended_at)
    SELECT s.id, s.call_id, 'ride'::public.call_session_type, s.ride_id,
           s.client_uid, s.driver_uid,
           s.direction::text::public.call_direction, s.status::text::public.call_status,
           s.recording_url, s.signaling_notes,
           s.created_at, s.updated_at, s.connected_at, s.ended_at
    FROM public.ride_call_sessions s
    WHERE s.driver_uid IS NOT NULL
      AND s.direction::text IN ('client_to_driver','driver_to_client')
      AND s.status::text IN ('initiated','ringing_client','ringing_operator','ringing_driver',
                             'accepted','rejected','missed','connected','ended')
    ON CONFLICT (id) DO NOTHING;

    SELECT count(*) INTO v_skip FROM public.ride_call_sessions s
     WHERE s.driver_uid IS NULL
        OR s.direction::text NOT IN ('client_to_driver','driver_to_client')
        OR s.status::text NOT IN ('initiated','ringing_client','ringing_operator','ringing_driver',
                                  'accepted','rejected','missed','connected','ended');

    IF v_skip = 0 THEN
      DROP TABLE public.ride_call_sessions;
      RAISE NOTICE 'mig: ride_call_sessions migrada a call_sessions y eliminada';
    ELSE
      RAISE WARNING 'mig: ride_call_sessions tiene % filas no migrables — tabla conservada', v_skip;
    END IF;
  END IF;
END $$;

-- ============================================
-- 7) TABLAS muertas (sin datos que preservar o ya migrados)
--    CASCADE limpia FKs colgantes desde tablas que sobreviven.
-- ============================================
ALTER TABLE public.vehicle_insurance_policies
  DROP CONSTRAINT IF EXISTS vehicle_insurance_policies_insurer_fkey;
DROP TABLE IF EXISTS public.cards CASCADE;
DROP TABLE IF EXISTS public.insurers CASCADE;
DROP TABLE IF EXISTS public.license_types CASCADE;
DROP TABLE IF EXISTS public.license_categories CASCADE;
DROP TABLE IF EXISTS public.vehicle_types CASCADE;

-- ============================================
-- 8) CASTS VARCHAR → enum en tablas que sobreviven
-- ============================================

-- El trigger es AFTER UPDATE OF status: PG no permite ALTER TYPE en una columna
-- nombrada en la lista del trigger → drop temporal, se recrea en §16.
DROP TRIGGER IF EXISTS trigger_audit_ride_status ON public.rides;

-- ride_location_type: el enum viejo incluía 'tracking' (ya migrado en §6a) →
-- se recrea con el dominio nuevo si el label sigue presente.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid
             JOIN pg_namespace n ON n.oid=t.typnamespace
             WHERE n.nspname='public' AND t.typname='ride_location_type' AND e.enumlabel='tracking') THEN
    ALTER TYPE public.ride_location_type RENAME TO ride_location_type_old;
    CREATE TYPE public.ride_location_type AS ENUM ('origin','waypoint','destination');
    IF EXISTS (SELECT 1 FROM information_schema.columns
               WHERE table_schema='public' AND table_name='ride_locations'
                 AND column_name='location_type' AND data_type='USER-DEFINED'
                 AND udt_name='ride_location_type_old') THEN
      ALTER TABLE public.ride_locations
        ALTER COLUMN location_type TYPE public.ride_location_type
        USING location_type::text::public.ride_location_type;
    END IF;
    DROP TYPE public.ride_location_type_old;
  END IF;
END $$;

-- rides
SELECT public.mig_cast_to_enum('rides','status','ride_status');
SELECT public.mig_cast_to_enum('rides','ride_type','ride_type');
SELECT public.mig_cast_to_enum('rides','designated_driver_vehicle','designated_driver_vehicle');
SELECT public.mig_cast_to_enum('rides','follower_status','ride_follower_status');
SELECT public.mig_cast_to_enum('rides','payment_type','ride_payment_type');
SELECT public.mig_cast_to_enum('rides','biometric_acceptance_type','biometric_type');
SELECT public.mig_cast_to_enum('rides','canceled_by','ride_canceled_by');

-- drivers / vehicles
SELECT public.mig_cast_to_enum('drivers','account_status','driver_account_status');
SELECT public.mig_cast_to_enum('drivers','documents_status','driver_documents_status');
SELECT public.mig_cast_to_enum('drivers','designated_role_status','designated_role_request_status');
SELECT public.mig_cast_to_enum('drivers','compliance_status','driver_compliance_status');
SELECT public.mig_cast_to_enum('vehicles','compliance_status','vehicle_compliance_status');

-- payments
SELECT public.mig_cast_to_enum('payments','status','payment_status');
SELECT public.mig_cast_to_enum('payments','commission_status','commission_status');
SELECT public.mig_cast_to_enum('payments','payment_method','payment_method');
SELECT public.mig_cast_to_enum('payments','payment_provider','payment_provider');
SELECT public.mig_cast_to_enum('payments','local_bank','local_bank');
SELECT public.mig_cast_to_enum('payments','biometric_type','biometric_type');
SELECT public.mig_cast_to_enum('payments','authentication_method','payment_auth_method');

-- ride_locations (tras §6a el dominio es seguro)
SELECT public.mig_cast_to_enum('ride_locations','location_type','ride_location_type');

-- emergency / inspecciones
SELECT public.mig_cast_to_enum('emergency_calls','user_role','app_role');
SELECT public.mig_cast_to_enum('emergency_calls','emergency_type','emergency_type');
SELECT public.mig_cast_to_enum('emergency_calls','call_status','emergency_call_status');
SELECT public.mig_cast_to_enum('designated_driver_inspections','status','inspection_status');

-- outbox / auditoría / users
SELECT public.mig_cast_to_enum('outbox_events','status','outbox_status');
SELECT public.mig_cast_to_enum('audit_log','actor_role','app_role');
SELECT public.mig_cast_to_enum('audit_log','action','audit_action');
SELECT public.mig_cast_to_enum('audit_log','entity_type','audit_entity_type');
SELECT public.mig_cast_to_enum('audit_log','source','audit_source');
SELECT public.mig_cast_to_enum('users','role','app_role');
SELECT public.mig_cast_to_enum('biometric_authentications','biometric_type','biometric_type');

-- compliance documental
SELECT public.mig_cast_to_enum('driver_licenses','license_type','license_type');
SELECT public.mig_cast_to_enum('driver_licenses','status','document_status');
SELECT public.mig_cast_to_enum('driver_licenses','verification_method','verification_method');
SELECT public.mig_cast_to_enum('vehicle_circulation_cards','status','document_status');
SELECT public.mig_cast_to_enum('vehicle_circulation_cards','verification_method','verification_method');
SELECT public.mig_cast_to_enum('vehicle_insurance_policies','coverage_type','insurance_coverage_type');
SELECT public.mig_cast_to_enum('vehicle_insurance_policies','status','document_status');
SELECT public.mig_cast_to_enum('vehicle_insurance_policies','verification_method','verification_method');
SELECT public.mig_cast_to_enum('vehicle_inspections','result','document_check_result');
SELECT public.mig_cast_to_enum('vehicle_inspections','status','document_status');
SELECT public.mig_cast_to_enum('vehicle_inspections','verification_method','verification_method');
SELECT public.mig_cast_to_enum('vehicle_emission_certificates','result','document_check_result');
SELECT public.mig_cast_to_enum('vehicle_emission_certificates','status','document_status');
SELECT public.mig_cast_to_enum('vehicle_emission_certificates','verification_method','verification_method');
SELECT public.mig_cast_to_enum('vehicle_road_taxes','status','document_status');
SELECT public.mig_cast_to_enum('vehicle_road_taxes','verification_method','verification_method');
SELECT public.mig_cast_to_enum('vehicle_revisado_stickers','status','document_status');
SELECT public.mig_cast_to_enum('vehicle_revisado_stickers','verification_method','verification_method');

-- Reversas defensivas: enums legacy que el diseño nuevo deja como texto abierto
SELECT public.mig_cast_to_text('rides','vehicle_type','VARCHAR(50)');
SELECT public.mig_cast_to_text('services','code','VARCHAR(50)');
SELECT public.mig_cast_to_text('vehicles','type','VARCHAR(20)');
SELECT public.mig_cast_to_text('vehicles','fuel_type','VARCHAR(20)');
SELECT public.mig_cast_to_text('vehicles','insurance_company','VARCHAR(100)');
SELECT public.mig_cast_to_text('vehicle_insurance_policies','insurer_code','VARCHAR(60)');

-- ============================================
-- 9) payments.total → columna GENERADA
-- ============================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_attribute a JOIN pg_class r ON r.oid=a.attrelid
             JOIN pg_namespace n ON n.oid=r.relnamespace
             WHERE n.nspname='public' AND r.relname='payments' AND a.attname='total'
               AND a.attgenerated <> 's') THEN
    ALTER TABLE public.payments DROP COLUMN total;
  END IF;
  IF NOT public.mig_col_exists('payments','total') THEN
    ALTER TABLE public.payments
      ADD COLUMN total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED;
  END IF;
END $$;

-- ============================================
-- 10) TIMESTAMP → TIMESTAMPTZ (todas las tablas base)
-- ============================================
SELECT public.mig_to_timestamptz();

-- ============================================
-- 11) ENUM TYPES muertos (catálogos borrados + renombrados wallet/calls)
--     Drop tolerante: si alguna columna aún los usa → WARNING y se conserva.
-- ============================================
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'vehicle_body_type','vehicle_fuel_type','vehicle_circulation_class',
    'vehicle_circulation_service','vehicle_insurance_company','ride_vehicle_type',
    'service_code','recharge_movement_type','recharge_source','recharge_status',
    'penalty_status','support_call_direction','support_call_status'
  ] LOOP
    BEGIN
      EXECUTE format('DROP TYPE IF EXISTS public.%I', t);
    EXCEPTION WHEN dependent_objects_still_exist THEN
      RAISE WARNING 'mig: tipo % aún en uso — conservado', t;
    END;
  END LOOP;
END $$;

-- ============================================
-- 12) FKs/CHECKs nuevas sobre tablas viejas (NOT VALID + validación tolerante)
-- ============================================
-- NOT VALID: no escanea datos legacy; aplica a escrituras nuevas desde ya.
-- La validación de lo histórico se intenta abajo y deja WARNING si hay
-- huérfanos (el constraint sigue activo para filas nuevas).

-- drivers → users
SELECT public.mig_add_fk('drivers','drivers_user_id_fkey',
  'FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT');
-- ratings → users
SELECT public.mig_add_fk('ratings','ratings_from_user_fkey',
  'FOREIGN KEY (from_user_id) REFERENCES public.users(id) ON DELETE RESTRICT');
SELECT public.mig_add_fk('ratings','ratings_to_user_fkey',
  'FOREIGN KEY (to_user_id) REFERENCES public.users(id) ON DELETE RESTRICT');
-- biometric_authentications → users/rides
SELECT public.mig_add_fk('biometric_authentications','biometric_authentications_user_fkey',
  'FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT');
SELECT public.mig_add_fk('biometric_authentications','biometric_authentications_ride_fkey',
  'FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL');
-- sms_verification_codes → users/rides
SELECT public.mig_add_fk('sms_verification_codes','sms_verification_codes_user_fkey',
  'FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT');
SELECT public.mig_add_fk('sms_verification_codes','sms_verification_codes_ride_fkey',
  'FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL');
-- emergency_calls → users/rides
SELECT public.mig_add_fk('emergency_calls','emergency_calls_user_id_fkey',
  'FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT');
SELECT public.mig_add_fk('emergency_calls','emergency_calls_ride_id_fkey',
  'FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE SET NULL');
-- designated_driver_inspections → rides/drivers.user_id
SELECT public.mig_add_fk('designated_driver_inspections','designated_driver_inspections_ride_id_fkey',
  'FOREIGN KEY (ride_id) REFERENCES public.rides(id) ON DELETE RESTRICT');
SELECT public.mig_add_fk('designated_driver_inspections','designated_driver_inspections_driver_fkey',
  'FOREIGN KEY (driver_id) REFERENCES public.drivers(user_id) ON DELETE RESTRICT');

-- CHECKs nuevos en tablas viejas
SELECT public.mig_add_check('drivers','drivers_average_rating_check',
  'average_rating IS NULL OR (average_rating >= 0 AND average_rating <= 5)');
DO $$ BEGIN
  IF public.mig_col_exists('vehicles','year') THEN
    PERFORM public.mig_add_check('vehicles','vehicles_year_check',
      'year IS NULL OR (year >= 1900 AND year <= 2100)');
  END IF;
END $$;
SELECT public.mig_add_check('payments','payments_amount_nonneg','amount >= 0');
SELECT public.mig_add_check('payments','payments_tip_nonneg','tip >= 0');
SELECT public.mig_add_check('payments','payments_commission_nonneg','commission >= 0');
SELECT public.mig_add_check('payments','payments_commission_rate_range',
  'commission_rate_applied IS NULL OR (commission_rate_applied >= 0 AND commission_rate_applied <= 1)');
SELECT public.mig_add_check('rides','rides_estimated_price_nonneg',
  'estimated_price IS NULL OR estimated_price >= 0');
SELECT public.mig_add_check('rides','rides_final_fare_nonneg',
  'final_fare IS NULL OR final_fare >= 0');
SELECT public.mig_add_check('rides','rides_client_suggested_nonneg',
  'client_suggested_price IS NULL OR client_suggested_price >= 0');
SELECT public.mig_add_check('rides','rides_driver_offered_nonneg',
  'driver_offered_price IS NULL OR driver_offered_price >= 0');
SELECT public.mig_add_check('rides','rides_passengers_positive',
  'passengers IS NULL OR passengers > 0');
SELECT public.mig_add_check('rides','rides_distances_nonneg',
  '(estimated_distance IS NULL OR estimated_distance >= 0) AND (actual_distance IS NULL OR actual_distance >= 0)');
SELECT public.mig_add_check('rides','rides_durations_nonneg',
  '(estimated_duration IS NULL OR estimated_duration >= 0) AND (actual_duration IS NULL OR actual_duration >= 0)');
SELECT public.mig_add_check('rides','rides_coords_valid',
  '(follower_last_latitude IS NULL OR follower_last_latitude BETWEEN -90 AND 90) AND (follower_last_longitude IS NULL OR follower_last_longitude BETWEEN -180 AND 180)');
SELECT public.mig_add_check('rides','rides_follower_not_captain_check',
  'follower_driver_id IS NULL OR follower_driver_id <> driver_id');
SELECT public.mig_add_check('ride_locations','ride_locations_coords_valid',
  'latitude BETWEEN -90 AND 90 AND longitude BETWEEN -180 AND 180');
SELECT public.mig_add_check('emergency_calls','emergency_calls_coords_valid',
  '(lat IS NULL OR lat BETWEEN -90 AND 90) AND (lng IS NULL OR lng BETWEEN -180 AND 180)');
SELECT public.mig_add_check('outbox_events','outbox_attempts_nonneg','attempts >= 0');
SELECT public.mig_add_check('outbox_events','outbox_terminal_state_check',
  '(status = ''published'' AND published_at IS NOT NULL) OR (status = ''failed'' AND failed_at IS NOT NULL) OR status::text = ''pending''');

-- ============================================
-- 13) Validación tolerante de TODO lo NOT VALID
--     (incluye las FKs de 0003/0004 marcadas NOT VALID)
-- ============================================
SELECT public.mig_try_validate('rides','rides_client_id_fkey');
SELECT public.mig_try_validate('rides','rides_origin_location_id_fkey');
SELECT public.mig_try_validate('rides','rides_destination_location_id_fkey');
SELECT public.mig_try_validate('rides','rides_driver_id_fkey');
SELECT public.mig_try_validate('rides','rides_follower_driver_id_fkey');
SELECT public.mig_try_validate('rides','rides_service_id_fkey');
SELECT public.mig_try_validate('payments','payments_sms_verification_fkey');
SELECT public.mig_try_validate('drivers','drivers_user_id_fkey');
SELECT public.mig_try_validate('ratings','ratings_from_user_fkey');
SELECT public.mig_try_validate('ratings','ratings_to_user_fkey');
SELECT public.mig_try_validate('biometric_authentications','biometric_authentications_user_fkey');
SELECT public.mig_try_validate('biometric_authentications','biometric_authentications_ride_fkey');
SELECT public.mig_try_validate('sms_verification_codes','sms_verification_codes_user_fkey');
SELECT public.mig_try_validate('sms_verification_codes','sms_verification_codes_ride_fkey');
SELECT public.mig_try_validate('emergency_calls','emergency_calls_user_id_fkey');
SELECT public.mig_try_validate('emergency_calls','emergency_calls_ride_id_fkey');
SELECT public.mig_try_validate('designated_driver_inspections','designated_driver_inspections_ride_id_fkey');
SELECT public.mig_try_validate('designated_driver_inspections','designated_driver_inspections_driver_fkey');
SELECT public.mig_try_validate('drivers','drivers_average_rating_check');
SELECT public.mig_try_validate('vehicles','vehicles_year_check');
SELECT public.mig_try_validate('payments','payments_amount_nonneg');
SELECT public.mig_try_validate('payments','payments_tip_nonneg');
SELECT public.mig_try_validate('payments','payments_commission_nonneg');
SELECT public.mig_try_validate('payments','payments_commission_rate_range');
SELECT public.mig_try_validate('rides','rides_estimated_price_nonneg');
SELECT public.mig_try_validate('rides','rides_final_fare_nonneg');
SELECT public.mig_try_validate('rides','rides_client_suggested_nonneg');
SELECT public.mig_try_validate('rides','rides_driver_offered_nonneg');
SELECT public.mig_try_validate('rides','rides_passengers_positive');
SELECT public.mig_try_validate('rides','rides_distances_nonneg');
SELECT public.mig_try_validate('rides','rides_durations_nonneg');
SELECT public.mig_try_validate('rides','rides_coords_valid');
SELECT public.mig_try_validate('rides','rides_follower_not_captain_check');
SELECT public.mig_try_validate('ride_locations','ride_locations_coords_valid');
SELECT public.mig_try_validate('emergency_calls','emergency_calls_coords_valid');
SELECT public.mig_try_validate('outbox_events','outbox_attempts_nonneg');
SELECT public.mig_try_validate('outbox_events','outbox_terminal_state_check');

-- ============================================
-- 14) ÍNDICES viejos eliminados/redundantes en el diseño nuevo
-- ============================================
-- cubiertos por UNIQUEs
DROP INDEX IF EXISTS public.idx_drivers_user_id;                 -- drivers_user_id_key
DROP INDEX IF EXISTS public.idx_vehicles_plate;                  -- vehicles_plate_key
DROP INDEX IF EXISTS public.idx_services_code;                   -- services.code UNIQUE
DROP INDEX IF EXISTS public.idx_payments_local_transaction_id;   -- payments_local_transaction_id_key
DROP INDEX IF EXISTS public.idx_rides_firebase_ride_id;          -- uq_rides_firebase_ride_id
DROP INDEX IF EXISTS public.idx_ratings_one_per_target_per_ride; -- uq_ratings_once
-- cubiertos por compuestos
DROP INDEX IF EXISTS public.idx_rides_client_id;                 -- idx_rides_client_id_*
DROP INDEX IF EXISTS public.idx_rides_driver_id;                 -- idx_rides_driver_id_*
-- sin uso / eliminados en el diseño
DROP INDEX IF EXISTS public.idx_rides_passengers;
DROP INDEX IF EXISTS public.idx_rides_waypoints_count;
DROP INDEX IF EXISTS public.idx_rides_multiple_stops;
DROP INDEX IF EXISTS public.idx_ride_locations_type;
DROP INDEX IF EXISTS public.idx_ride_locations_order;            -- unique_ride_location_order
DROP INDEX IF EXISTS public.idx_payments_ride_status;
DROP INDEX IF EXISTS public.idx_payments_ride_created_at;
DROP INDEX IF EXISTS public.idx_ratings_from_user_id;
DROP INDEX IF EXISTS public.idx_emergency_calls_user_id;
DROP INDEX IF EXISTS public.idx_emergency_calls_ride_id;
DROP INDEX IF EXISTS public.idx_emergency_calls_type;
DROP INDEX IF EXISTS public.idx_emergency_calls_created_at;
DROP INDEX IF EXISTS public.idx_biometric_auth_user;
DROP INDEX IF EXISTS public.idx_biometric_auth_ride;
DROP INDEX IF EXISTS public.idx_biometric_auth_context;
DROP INDEX IF EXISTS public.idx_biometric_auth_success;
DROP INDEX IF EXISTS public.idx_biometric_auth_created;
DROP INDEX IF EXISTS public.idx_sms_user;
DROP INDEX IF EXISTS public.idx_sms_ride;
DROP INDEX IF EXISTS public.idx_sms_verified;
DROP INDEX IF EXISTS public.idx_sms_expires;
DROP INDEX IF EXISTS public.idx_sms_created;
DROP INDEX IF EXISTS public.idx_analytics_user_id;
DROP INDEX IF EXISTS public.idx_analytics_event_type;
DROP INDEX IF EXISTS public.idx_analytics_created_at;
DROP INDEX IF EXISTS public.idx_designated_driver_inspections_ride_unique;
DROP INDEX IF EXISTS public.idx_designated_driver_inspections_ride_id;
DROP INDEX IF EXISTS public.idx_designated_driver_inspections_driver_id;
DROP INDEX IF EXISTS public.idx_designated_driver_inspections_status;
DROP INDEX IF EXISTS public.idx_designated_driver_inspections_created_at;
-- colisión de nombre: la def nueva es parcial — normalizar
DROP INDEX IF EXISTS public.idx_rides_service_id;
CREATE INDEX IF NOT EXISTS idx_rides_service_id ON public.rides USING btree (service_id) WHERE service_id IS NOT NULL;

-- 14b) Recrear los índices parciales que el cast borró (predicado sobre columna
--      casteada). Idempotentes.
CREATE UNIQUE INDEX IF NOT EXISTS uq_rides_one_active_per_client
  ON public.rides (client_id)
  WHERE deleted_at IS NULL
    AND status IN (
      'requested', 'driver_offered', 'accepted', 'driver_on_route',
      'driver_arrived', 'in_progress', 'pending_payment'
    );
CREATE INDEX IF NOT EXISTS idx_rides_canceled_by ON public.rides USING btree (canceled_by) WHERE canceled_by IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_payments_commission_status ON public.payments USING btree (commission_status) WHERE commission_status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_pending ON public.outbox_events(created_at) WHERE status = 'pending';
CREATE INDEX IF NOT EXISTS idx_outbox_published_cleanup ON public.outbox_events(published_at) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS idx_outbox_failed ON public.outbox_events(failed_at) WHERE status = 'failed';

-- ============================================
-- 15) Funciones reemplazadas/muertas
-- ============================================
-- get_driver_commission_rate: queda solo la firma (VARCHAR, VARCHAR) unificada.
DROP FUNCTION IF EXISTS public.get_driver_commission_rate(TEXT, TEXT);
DROP FUNCTION IF EXISTS public.get_driver_commission_rate(UUID, VARCHAR);
-- Helper de la era Supabase (auth.uid()) — sin uso en v2.
DROP FUNCTION IF EXISTS public.current_firebase_uid();
DROP FUNCTION IF EXISTS public.is_admin_claim();

-- ============================================
-- 16) Trigger de auditoría (dropped en §8 por el cast) + vistas recreadas
-- ============================================
DROP TRIGGER IF EXISTS trigger_audit_ride_status ON public.rides;
CREATE TRIGGER trigger_audit_ride_status
AFTER UPDATE OF status ON public.rides
FOR EACH ROW EXECUTE FUNCTION public.audit_ride_status_change();

DROP VIEW IF EXISTS public.rides_with_complete_route CASCADE;
DROP VIEW IF EXISTS public.driver_active_services CASCADE;
DROP VIEW IF EXISTS public.services_stats CASCADE;


CREATE OR REPLACE VIEW public.rides_with_complete_route AS
SELECT
  r.*,
  rl_origin.id          AS origin_location_id_detail,
  rl_origin.latitude    AS origin_latitude,
  rl_origin.longitude   AS origin_longitude,
  rl_origin.address     AS origin_address,
  rl_dest.id            AS destination_location_id_detail,
  rl_dest.latitude      AS destination_latitude,
  rl_dest.longitude     AS destination_longitude,
  rl_dest.address       AS destination_address,
  COALESCE((
    SELECT json_agg(
      json_build_object(
        'id', w.id,
        'lat', w.latitude,
        'lng', w.longitude,
        'address', w.address,
        'location_order', w.location_order
      ) ORDER BY w.location_order
    )
    FROM public.ride_locations w
    WHERE w.ride_id = r.id AND w.location_type = 'waypoint'
  ), '[]'::json) AS waypoints
FROM public.rides r
LEFT JOIN public.ride_locations rl_origin
  ON rl_origin.ride_id = r.id AND rl_origin.location_type = 'origin'
LEFT JOIN public.ride_locations rl_dest
  ON rl_dest.ride_id = r.id AND rl_dest.location_type = 'destination';

CREATE OR REPLACE VIEW public.driver_active_services AS
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
WHERE ds.is_active = TRUE AND ds.is_approved = TRUE;

CREATE OR REPLACE VIEW public.services_stats AS
SELECT
  s.id AS service_id, s.code AS service_code, s.name AS service_name,
  COUNT(DISTINCT r.id) AS total_rides,
  COUNT(DISTINCT CASE WHEN r.status = 'completed' THEN r.id END) AS completed_rides,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.amount ELSE 0 END), 0) AS total_revenue,
  COALESCE(SUM(CASE WHEN p.status = 'completed' THEN p.commission ELSE 0 END), 0) AS total_commission,
  COALESCE(AVG(CASE WHEN p.status = 'completed' THEN p.amount END), 0) AS average_fare
FROM public.services s
LEFT JOIN public.rides r    ON r.service_id = s.id
LEFT JOIN public.payments p ON p.ride_id = r.id
GROUP BY s.id, s.code, s.name;

-- ============================================
-- 17) Limpieza de helpers
-- ============================================
DROP FUNCTION IF EXISTS public.mig_table_exists(text);
DROP FUNCTION IF EXISTS public.mig_col_exists(text, text);
DROP FUNCTION IF EXISTS public.mig_enum_add(text, text);
DROP FUNCTION IF EXISTS public.mig_drop_pred_indexes(text, text);
DROP FUNCTION IF EXISTS public.mig_cast_to_enum(text, text, text);
DROP FUNCTION IF EXISTS public.mig_cast_to_text(text, text, text);
DROP FUNCTION IF EXISTS public.mig_add_fk(text, text, text);
DROP FUNCTION IF EXISTS public.mig_add_check(text, text, text);
DROP FUNCTION IF EXISTS public.mig_try_validate(text, text);
DROP FUNCTION IF EXISTS public.mig_to_timestamptz();

COMMIT;
