-- El año OCR es autodeclarado por la app, no una verificación independiente.
ALTER TABLE public.vehicles ADD COLUMN IF NOT EXISTS registration_ocr_year INTEGER;

CREATE OR REPLACE FUNCTION public.vehicle_premium_eligible(
  ocr_year INTEGER, vehicle_type TEXT, at_time TIMESTAMPTZ
) RETURNS BOOLEAN
LANGUAGE sql STABLE PARALLEL SAFE AS $$
  SELECT COALESCE(
    ocr_year BETWEEN 1900 AND 2100
    AND vehicle_type IS NOT NULL
    AND lower(vehicle_type) NOT LIKE '%moto%'
    AND (at_time AT TIME ZONE 'America/Managua') >= make_timestamp(ocr_year, 1, 1, 0, 0, 0)
    AND (at_time AT TIME ZONE 'America/Managua') < make_timestamp(ocr_year + 5, 7, 1, 0, 0, 0),
    FALSE
  )
$$;
