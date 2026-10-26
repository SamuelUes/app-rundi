-- ============================================================
-- Corrección de comisiones y RPC get_driver_commission_rate
-- ============================================================
-- Ejecutar en Supabase SQL Runner (rundiapp-dev / producción).
-- Idempotente: se puede correr varias veces sin efectos extra.
--
-- Contiene:
--   1) Tasas de comisión canónicas en public.services
--   2) get_driver_commission_rate(TEXT, TEXT) — resuelve Firebase UID
--   3) get_driver_commission_rate(UUID, VARCHAR) — usa drivers.id interno
--
-- NOTA: services.code es enum service_code en la DB real; todas las
-- comparaciones usan code::text para funcionar con enum y con varchar.
-- ============================================================

-- ------------------------------------------------------------
-- 1) Tasas canónicas (el trigger log_commission_change las audita)
-- ------------------------------------------------------------
UPDATE public.services SET commission_rate = 0.1500 WHERE code::text = 'normal';
UPDATE public.services SET commission_rate = 0.0750 WHERE code::text = 'motorcycle';
UPDATE public.services SET commission_rate = 0.2500 WHERE code::text = 'designated_driver_auto';
UPDATE public.services SET commission_rate = 0.1250 WHERE code::text = 'designated_driver_moto';
UPDATE public.services SET commission_rate = 0.1200 WHERE code::text = 'night';

-- ------------------------------------------------------------
-- 2) RPC por Firebase UID (la que llama el backend priceCalculator)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION get_driver_commission_rate(p_driver_uid TEXT, p_service_code TEXT)
RETURNS NUMERIC AS $$
DECLARE
  v_driver_id UUID;
  v_service_id UUID;
  v_commission NUMERIC(5, 4);
BEGIN
  SELECT id INTO v_driver_id
  FROM public.drivers
  WHERE user_id = p_driver_uid;

  -- services.code es enum service_code en producción; ::text funciona con ambos tipos
  SELECT id, commission_rate INTO v_service_id, v_commission
  FROM public.services
  WHERE code::text = p_service_code;

  IF v_service_id IS NULL THEN
    -- Servicio no encontrado, usar valores por defecto
    RETURN (
      CASE p_service_code
        WHEN 'designated_driver_moto' THEN 0.125
        WHEN 'designated_driver_auto' THEN 0.25
        WHEN 'designated_driver' THEN 0.25
        WHEN 'motorcycle' THEN 0.075
        WHEN 'night' THEN 0.12
        ELSE 0.15
      END
    );
  END IF;

  IF v_driver_id IS NOT NULL THEN
    SELECT COALESCE(ds.custom_commission_rate, s.commission_rate)
    INTO v_commission
    FROM public.services s
    LEFT JOIN public.driver_services ds
      ON ds.service_id = s.id
     AND ds.driver_id = v_driver_id
     AND ds.is_active = TRUE
     AND ds.is_approved = TRUE
    WHERE s.id = v_service_id;
  END IF;

  IF v_commission IS NULL THEN
    RETURN (
      CASE p_service_code
        WHEN 'designated_driver_moto' THEN 0.125
        WHEN 'designated_driver_auto' THEN 0.25
        WHEN 'designated_driver' THEN 0.25
        WHEN 'motorcycle' THEN 0.075
        WHEN 'night' THEN 0.12
        ELSE 0.15
      END
    );
  END IF;

  RETURN v_commission;
END;
$$ LANGUAGE plpgsql STABLE;

COMMENT ON FUNCTION get_driver_commission_rate(TEXT, TEXT) IS 'Obtiene la tasa de comisión aplicable para un conductor y servicio (driver_services.override → services.commission_rate → defaults)';

-- ------------------------------------------------------------
-- 3) RPC por UUID interno de drivers (overload compatible)
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_driver_commission_rate(
  p_driver_id UUID,
  p_service_code VARCHAR
)
RETURNS NUMERIC
LANGUAGE plpgsql
AS $$
DECLARE
  v_commission_rate DECIMAL(5, 4);
BEGIN
  SELECT COALESCE(ds.custom_commission_rate, s.commission_rate)
  INTO v_commission_rate
  FROM public.services s
  LEFT JOIN public.driver_services ds ON ds.service_id = s.id AND ds.driver_id = p_driver_id
  WHERE s.code::text = p_service_code
    AND s.is_active = true
    AND (ds.is_active IS NULL OR ds.is_active = true)
    AND (ds.is_approved IS NULL OR ds.is_approved = true)
    AND (ds.expires_at IS NULL OR ds.expires_at > NOW());

  RETURN COALESCE(
    v_commission_rate,
    CASE p_service_code
      WHEN 'designated_driver_moto' THEN 0.125
      WHEN 'designated_driver_auto' THEN 0.25
      WHEN 'designated_driver' THEN 0.25
      WHEN 'motorcycle' THEN 0.075
      WHEN 'night' THEN 0.12
      ELSE 0.15
    END
  );
END;
$$;

-- ------------------------------------------------------------
-- Verificación
-- ------------------------------------------------------------
SELECT code::text AS code, commission_rate
FROM public.services
ORDER BY code::text;
