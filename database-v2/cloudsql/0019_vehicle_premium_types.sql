-- Solo sedan/suv/pickup califican para premium por año OCR.
-- Antes era "todo menos moto": van/auto/otros también entraban por error.
CREATE OR REPLACE FUNCTION public.vehicle_premium_eligible(
  ocr_year INTEGER, vehicle_type TEXT, at_time TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    ocr_year BETWEEN 1900 AND 2100
    AND lower(vehicle_type) IN ('sedan', 'suv', 'pickup')
    AND (at_time AT TIME ZONE 'America/Managua') >= make_timestamp(ocr_year, 1, 1, 0, 0, 0)
    AND (at_time AT TIME ZONE 'America/Managua') < make_timestamp(ocr_year + 5, 7, 1, 0, 0, 0),
    FALSE
  )
$$;
