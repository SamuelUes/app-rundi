-- Agregar campos de ubicación geográfica a la tabla drivers
-- Fecha: 2025-10-16
-- Descripción: Agregar departamento y municipio para conductores

-- Agregar columnas a la tabla drivers
ALTER TABLE public.drivers
ADD COLUMN IF NOT EXISTS department VARCHAR(100),
ADD COLUMN IF NOT EXISTS municipality VARCHAR(100);

-- Crear índices para búsquedas por ubicación
CREATE INDEX IF NOT EXISTS idx_drivers_department ON public.drivers(department);
CREATE INDEX IF NOT EXISTS idx_drivers_municipality ON public.drivers(municipality);

-- Comentarios
COMMENT ON COLUMN public.drivers.department IS 'Departamento de residencia del conductor (ej: Managua, León, Granada)';
COMMENT ON COLUMN public.drivers.municipality IS 'Municipio de residencia del conductor (ej: Managua, Masaya, Tipitapa)';
