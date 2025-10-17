-- ============================================
-- ACTUALIZACIÓN DE SCHEMA: RATINGS
-- Agregar columnas para categorías detalladas
-- Fecha: 2025-10-15
-- ============================================

-- Agregar nuevas columnas de categorías (si no existen)
ALTER TABLE ratings 
ADD COLUMN IF NOT EXISTS driving INTEGER CHECK (driving >= 1 AND driving <= 5),
ADD COLUMN IF NOT EXISTS safety INTEGER CHECK (safety >= 1 AND safety <= 5),
ADD COLUMN IF NOT EXISTS friendliness INTEGER CHECK (friendliness >= 1 AND friendliness <= 5);

-- Agregar comentarios a las columnas
COMMENT ON COLUMN ratings.punctuality IS 'Calificación de puntualidad (1-5)';
COMMENT ON COLUMN ratings.cleanliness IS 'Calificación de limpieza del vehículo (1-5)';
COMMENT ON COLUMN ratings.communication IS 'Calificación de comunicación (1-5)';
COMMENT ON COLUMN ratings.driving IS 'Calificación de conducción - solo para conductores (1-5)';
COMMENT ON COLUMN ratings.safety IS 'Calificación de seguridad (1-5)';
COMMENT ON COLUMN ratings.friendliness IS 'Calificación de amabilidad (1-5)';

-- Crear índices para optimizar queries de ratings
CREATE INDEX IF NOT EXISTS idx_ratings_to_user_id ON ratings(to_user_id);
CREATE INDEX IF NOT EXISTS idx_ratings_ride_id ON ratings(ride_id);
CREATE INDEX IF NOT EXISTS idx_ratings_created_at ON ratings(created_at DESC);

-- Crear índice compuesto para queries de promedio por usuario
CREATE INDEX IF NOT EXISTS idx_ratings_user_rating ON ratings(to_user_id, rating);

-- Verificar que la tabla tenga todas las columnas necesarias
DO $$
BEGIN
    -- Verificar columnas existentes
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ratings' AND column_name = 'driving'
    ) THEN
        RAISE NOTICE 'Columna driving agregada correctamente';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ratings' AND column_name = 'safety'
    ) THEN
        RAISE NOTICE 'Columna safety agregada correctamente';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_name = 'ratings' AND column_name = 'friendliness'
    ) THEN
        RAISE NOTICE 'Columna friendliness agregada correctamente';
    END IF;
END $$;

-- Mostrar estructura final de la tabla
SELECT 
    column_name, 
    data_type, 
    is_nullable,
    column_default
FROM information_schema.columns
WHERE table_name = 'ratings'
ORDER BY ordinal_position;

-- Mostrar índices creados
SELECT 
    indexname,
    indexdef
FROM pg_indexes
WHERE tablename = 'ratings'
ORDER BY indexname;

COMMIT;

-- ============================================
-- SCRIPT DE VERIFICACIÓN
-- ============================================

-- Verificar que no haya datos inválidos
SELECT COUNT(*) as invalid_ratings
FROM ratings
WHERE 
    (punctuality IS NOT NULL AND (punctuality < 1 OR punctuality > 5))
    OR (cleanliness IS NOT NULL AND (cleanliness < 1 OR cleanliness > 5))
    OR (communication IS NOT NULL AND (communication < 1 OR communication > 5))
    OR (driving IS NOT NULL AND (driving < 1 OR driving > 5))
    OR (safety IS NOT NULL AND (safety < 1 OR safety > 5))
    OR (friendliness IS NOT NULL AND (friendliness < 1 OR friendliness > 5));

-- Si hay datos inválidos, mostrarlos
SELECT *
FROM ratings
WHERE 
    (punctuality IS NOT NULL AND (punctuality < 1 OR punctuality > 5))
    OR (cleanliness IS NOT NULL AND (cleanliness < 1 OR cleanliness > 5))
    OR (communication IS NOT NULL AND (communication < 1 OR communication > 5))
    OR (driving IS NOT NULL AND (driving < 1 OR driving > 5))
    OR (safety IS NOT NULL AND (safety < 1 OR safety > 5))
    OR (friendliness IS NOT NULL AND (friendliness < 1 OR friendliness > 5))
LIMIT 10;

-- ============================================
-- QUERIES DE EJEMPLO
-- ============================================

-- Obtener promedio de todas las categorías para un usuario
SELECT 
    to_user_id,
    COUNT(*) as total_ratings,
    ROUND(AVG(rating)::numeric, 2) as avg_rating,
    ROUND(AVG(punctuality)::numeric, 2) as avg_punctuality,
    ROUND(AVG(cleanliness)::numeric, 2) as avg_cleanliness,
    ROUND(AVG(communication)::numeric, 2) as avg_communication,
    ROUND(AVG(driving)::numeric, 2) as avg_driving,
    ROUND(AVG(safety)::numeric, 2) as avg_safety,
    ROUND(AVG(friendliness)::numeric, 2) as avg_friendliness
FROM ratings
WHERE to_user_id = 'REPLACE_WITH_USER_ID'
GROUP BY to_user_id;

-- Obtener distribución de ratings
SELECT 
    rating,
    COUNT(*) as count,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as percentage
FROM ratings
WHERE to_user_id = 'REPLACE_WITH_USER_ID'
GROUP BY rating
ORDER BY rating DESC;

-- Obtener comentarios recientes
SELECT 
    ride_id,
    rating,
    comment,
    punctuality,
    cleanliness,
    communication,
    driving,
    safety,
    friendliness,
    created_at
FROM ratings
WHERE to_user_id = 'REPLACE_WITH_USER_ID'
    AND comment IS NOT NULL
ORDER BY created_at DESC
LIMIT 5;
