-- ============================================
-- Script: Marcar Vehículos como 4x4
-- Fecha: 10 de Octubre 2025
-- Descripción: Marca vehículos aptos para servicio de conductor designado
-- ============================================

-- IMPORTANTE: El campo is_4x4 se refiere a vehículos con tracción 4x4 o AWD
-- Incluye: Camionetas, SUVs, Sedanes con 4x4, etc.
-- NO incluye: Motos, autos sedán normales (2WD)

-- ============================================
-- OPCIÓN 1: Marcar vehículos por TIPO (RECOMENDADO)
-- ============================================

-- PASO 1: Primero, asegurar que las MOTOS NO sean 4x4
UPDATE vehicles 
SET is_4x4 = FALSE
WHERE type IN ('moto', 'motorcycle', 'motocicleta');

-- PASO 2: Marcar automáticamente vehículos 4x4 por tipo
UPDATE vehicles 
SET is_4x4 = TRUE
WHERE type IN (
    'suv',           -- SUV (Sport Utility Vehicle)
    'pickup',        -- Camionetas pickup
    'jeep',          -- Jeeps
    '4x4',           -- Marcados explícitamente como 4x4
    'camioneta',     -- Camionetas
    'van',           -- Vans 4x4
    'truck',         -- Camiones
    'crossover'      -- Crossovers (muchos tienen AWD)
)
AND type NOT IN ('moto', 'motorcycle', 'motocicleta'); -- Excluir motos por seguridad

-- PASO 3: Los AUTOS normales quedan como FALSE (por defecto)
-- No hacemos nada, ya que is_4x4 = FALSE es el default

-- Verificar cuántos se marcaron
SELECT 
    type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_4x4 = TRUE) as marcados_4x4,
    COUNT(*) FILTER (WHERE is_4x4 = FALSE OR is_4x4 IS NULL) as no_4x4
FROM vehicles 
GROUP BY type
ORDER BY type;

-- ============================================
-- OPCIÓN 2: Marcar vehículos por MARCA/MODELO
-- ============================================

-- Marcar modelos específicos conocidos por tener 4x4
UPDATE vehicles 
SET is_4x4 = TRUE
WHERE (
    -- Toyota
    (brand ILIKE 'toyota' AND model ILIKE ANY(ARRAY['%4runner%', '%land cruiser%', '%hilux%', '%tacoma%', '%tundra%', '%sequoia%', '%rav4%'])) OR
    
    -- Nissan
    (brand ILIKE 'nissan' AND model ILIKE ANY(ARRAY['%frontier%', '%navara%', '%pathfinder%', '%xterra%', '%patrol%', '%armada%'])) OR
    
    -- Ford
    (brand ILIKE 'ford' AND model ILIKE ANY(ARRAY['%ranger%', '%f-150%', '%f-250%', '%explorer%', '%expedition%', '%bronco%'])) OR
    
    -- Chevrolet
    (brand ILIKE 'chevrolet' AND model ILIKE ANY(ARRAY['%silverado%', '%colorado%', '%tahoe%', '%suburban%', '%traverse%'])) OR
    
    -- Jeep (todos)
    (brand ILIKE 'jeep') OR
    
    -- Mitsubishi
    (brand ILIKE 'mitsubishi' AND model ILIKE ANY(ARRAY['%montero%', '%pajero%', '%l200%', '%outlander%'])) OR
    
    -- Mazda
    (brand ILIKE 'mazda' AND model ILIKE ANY(ARRAY['%bt-50%', '%cx-5%', '%cx-9%'])) OR
    
    -- Honda
    (brand ILIKE 'honda' AND model ILIKE ANY(ARRAY['%pilot%', '%cr-v%', '%ridgeline%'])) OR
    
    -- Subaru (la mayoría tienen AWD)
    (brand ILIKE 'subaru') OR
    
    -- Land Rover (todos)
    (brand ILIKE 'land rover' OR brand ILIKE 'range rover')
);

-- ============================================
-- OPCIÓN 3: Marcar vehículos MANUALMENTE
-- ============================================

-- Ver todos los vehículos para decidir cuáles marcar
SELECT 
    v.id,
    v.plate,
    v.brand,
    v.model,
    v.year,
    v.type,
    v.is_4x4,
    d.user_id as driver_user_id
FROM vehicles v
JOIN drivers d ON v.driver_id = d.id
WHERE v.is_active = TRUE
ORDER BY v.brand, v.model;

-- Marcar vehículos específicos por ID
-- Reemplazar 'VEHICLE_ID_1', 'VEHICLE_ID_2', etc. con IDs reales
/*
UPDATE vehicles 
SET is_4x4 = TRUE
WHERE id IN (
    'VEHICLE_ID_1',
    'VEHICLE_ID_2',
    'VEHICLE_ID_3'
);
*/

-- ============================================
-- OPCIÓN 4: Marcar por PLACA
-- ============================================

-- Si conoces las placas de los vehículos 4x4
/*
UPDATE vehicles 
SET is_4x4 = TRUE
WHERE plate IN (
    'ABC-123',
    'XYZ-789'
);
*/

-- ============================================
-- VERIFICACIÓN FINAL
-- ============================================

-- Ver todos los vehículos marcados como 4x4
SELECT 
    v.id,
    v.plate,
    v.brand,
    v.model,
    v.year,
    v.type,
    v.color,
    v.is_4x4,
    d.user_id as driver_user_id,
    d.license_number
FROM vehicles v
JOIN drivers d ON v.driver_id = d.id
WHERE v.is_4x4 = TRUE
ORDER BY v.brand, v.model;

-- Estadísticas
SELECT 
    COUNT(*) as total_vehicles,
    COUNT(*) FILTER (WHERE is_4x4 = TRUE) as vehicles_4x4,
    COUNT(*) FILTER (WHERE is_4x4 = FALSE OR is_4x4 IS NULL) as vehicles_2wd,
    ROUND(100.0 * COUNT(*) FILTER (WHERE is_4x4 = TRUE) / COUNT(*), 2) as percentage_4x4
FROM vehicles
WHERE is_active = TRUE;

-- Ver distribución por tipo
SELECT 
    type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_4x4 = TRUE) as with_4x4,
    COUNT(*) FILTER (WHERE is_4x4 = FALSE OR is_4x4 IS NULL) as without_4x4
FROM vehicles
WHERE is_active = TRUE
GROUP BY type
ORDER BY total DESC;

-- ============================================
-- DESMARCAR VEHÍCULOS (Si cometiste un error)
-- ============================================

-- Desmarcar todos
/*
UPDATE vehicles 
SET is_4x4 = FALSE;
*/

-- Desmarcar vehículos específicos
/*
UPDATE vehicles 
SET is_4x4 = FALSE
WHERE id IN ('VEHICLE_ID_1', 'VEHICLE_ID_2');
*/

-- Desmarcar por tipo (ej: motos nunca deben ser 4x4)
UPDATE vehicles 
SET is_4x4 = FALSE
WHERE type IN ('moto', 'motorcycle', 'motocicleta');

-- ============================================
-- NOTAS IMPORTANTES
-- ============================================

/*
VEHÍCULOS QUE DEBEN SER MARCADOS COMO 4x4:
✅ Camionetas pickup (Hilux, Ranger, Frontier, etc.)
✅ SUVs con tracción 4x4 o AWD (4Runner, Pathfinder, etc.)
✅ Jeeps (Wrangler, Cherokee, etc.)
✅ Vans 4x4 (Transit 4x4, Sprinter 4x4, etc.)
✅ Sedanes con 4x4/AWD (Subaru Legacy, Audi Quattro, etc.)

VEHÍCULOS QUE NO DEBEN SER MARCADOS:
❌ Motos
❌ Sedanes normales 2WD
❌ Autos compactos 2WD
❌ Vehículos sin tracción 4x4

CRITERIO PRINCIPAL:
El vehículo debe tener tracción en las 4 ruedas (4WD o AWD)
para ser considerado apto para el servicio de conductor designado.

RAZÓN:
El servicio de conductor designado requiere vehículos más grandes
y seguros, generalmente con capacidad 4x4 para mayor estabilidad
y seguridad en diferentes condiciones de manejo.
*/

-- ============================================
-- COMMIT
-- ============================================
COMMIT;
