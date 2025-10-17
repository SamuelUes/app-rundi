# 🚗 Guía de Tipos de Vehículos

## Campo: `vehicles.type`

---

## 📋 Valores Permitidos y su Clasificación

### 🏍️ MOTOS (is_4x4 = FALSE)
```
type = 'moto'
type = 'motorcycle'
type = 'motocicleta'
```
**Características:**
- 2 ruedas
- NO apto para conductor designado
- Solo para viajes tipo "moto"

---

### 🚗 AUTOS NORMALES (is_4x4 = FALSE)
```
type = 'auto'
type = 'sedan'
type = 'hatchback'
type = 'coupe'
type = 'convertible'
```
**Características:**
- Tracción 2WD (delantera o trasera)
- NO apto para conductor designado
- Para viajes tipo "auto"

---

### 🚙 VEHÍCULOS 4x4 (is_4x4 = TRUE)

#### SUVs:
```
type = 'suv'
```
**Ejemplos:**
- Toyota 4Runner, RAV4
- Nissan Pathfinder
- Ford Explorer
- Chevrolet Tahoe

#### Pickups/Camionetas:
```
type = 'pickup'
type = 'camioneta'
type = 'truck'
```
**Ejemplos:**
- Toyota Hilux
- Nissan Frontier
- Ford Ranger
- Chevrolet Colorado

#### Jeeps:
```
type = 'jeep'
```
**Ejemplos:**
- Jeep Wrangler
- Jeep Cherokee
- Jeep Grand Cherokee

#### Vans:
```
type = 'van'
```
**Ejemplos:**
- Ford Transit 4x4
- Mercedes Sprinter 4x4
- Toyota Hiace 4x4

#### Crossovers:
```
type = 'crossover'
```
**Ejemplos:**
- Honda CR-V (AWD)
- Mazda CX-5 (AWD)
- Subaru Outback

#### Otros:
```
type = '4x4'  -- Marcado explícitamente
```

---

## 🔄 Flujo de Registro

### Cuando un Conductor Registra su Vehículo:

```
1. Conductor ingresa datos del vehículo:
   - Placa
   - Marca
   - Modelo
   - Año
   - Color
   - Tipo ← IMPORTANTE

2. Selector de TIPO:
   [ ] Moto
   [ ] Auto/Sedán
   [ ] SUV
   [ ] Pickup/Camioneta
   [ ] Jeep
   [ ] Van
   [ ] Crossover

3. Sistema automáticamente asigna is_4x4:
   - Si selecciona "Moto" o "Auto/Sedán" → is_4x4 = FALSE
   - Si selecciona SUV, Pickup, Jeep, Van, Crossover → is_4x4 = TRUE

4. (Opcional) Pregunta de confirmación:
   "¿Tu vehículo tiene tracción 4x4 o AWD?"
   - Sí → is_4x4 = TRUE
   - No → is_4x4 = FALSE
```

---

## 📊 Matriz de Compatibilidad

| type         | is_4x4 | Puede hacer viajes de: |
|--------------|--------|------------------------|
| moto         | FALSE  | 🏍️ Moto               |
| auto         | FALSE  | 🚗 Auto                |
| sedan        | FALSE  | 🚗 Auto                |
| suv          | TRUE   | 🚗 Auto + 👨‍✈️ DD      |
| pickup       | TRUE   | 🚗 Auto + 👨‍✈️ DD      |
| camioneta    | TRUE   | 🚗 Auto + 👨‍✈️ DD      |
| jeep         | TRUE   | 🚗 Auto + 👨‍✈️ DD      |
| van          | TRUE   | 🚗 Auto + 👨‍✈️ DD      |
| crossover    | TRUE   | 🚗 Auto + 👨‍✈️ DD      |

**DD = Conductor Designado**

---

## 🎯 Lógica del Sistema

### Cliente solicita viaje:

#### Tipo: MOTO 🏍️
```sql
-- Solo conductores con motos ven el viaje
WHERE vehicles.type IN ('moto', 'motorcycle', 'motocicleta')
```

#### Tipo: AUTO 🚗
```sql
-- Conductores con autos normales o vehículos 4x4 (si modo DD está OFF)
WHERE vehicles.type NOT IN ('moto', 'motorcycle', 'motocicleta')
```

#### Tipo: CONDUCTOR DESIGNADO 👨‍✈️
```sql
-- Solo conductores con vehículos 4x4 Y modo DD activo
WHERE vehicles.is_4x4 = TRUE 
AND driverLocations.designatedDriverMode = TRUE
```

---

## 🛠️ Scripts SQL

### Ver todos los tipos de vehículos registrados:
```sql
SELECT 
    type,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE is_4x4 = TRUE) as con_4x4,
    COUNT(*) FILTER (WHERE is_4x4 = FALSE OR is_4x4 IS NULL) as sin_4x4
FROM vehicles
WHERE is_active = TRUE
GROUP BY type
ORDER BY total DESC;
```

### Marcar vehículos por tipo:
```sql
-- Motos → is_4x4 = FALSE
UPDATE vehicles 
SET is_4x4 = FALSE
WHERE type IN ('moto', 'motorcycle', 'motocicleta');

-- Vehículos 4x4 → is_4x4 = TRUE
UPDATE vehicles 
SET is_4x4 = TRUE
WHERE type IN ('suv', 'pickup', 'camioneta', 'jeep', 'van', 'crossover', '4x4');

-- Autos normales → is_4x4 = FALSE (ya es default)
UPDATE vehicles 
SET is_4x4 = FALSE
WHERE type IN ('auto', 'sedan', 'hatchback', 'coupe');
```

---

## ⚠️ Casos Especiales

### 1. SUV 2WD vs 4WD
**Problema:** Algunos SUVs vienen en versión 2WD
**Solución:** 
- Por defecto, SUV → is_4x4 = TRUE
- Si el conductor indica que es 2WD, cambiar manualmente

### 2. Sedanes con AWD
**Problema:** Algunos sedanes tienen AWD (ej: Subaru Legacy)
**Solución:**
- Registrar como `type = 'sedan'`
- Marcar manualmente `is_4x4 = TRUE`

### 3. Vans
**Problema:** No todas las vans son 4x4
**Solución:**
- Por defecto, van → is_4x4 = TRUE
- Si es 2WD, cambiar manualmente

---

## 📝 Recomendaciones

### Para el Frontend (Registro de Vehículo):

```typescript
// Selector de tipo con auto-asignación de is_4x4
const vehicleTypes = [
  { value: 'moto', label: 'Moto 🏍️', is4x4: false },
  { value: 'auto', label: 'Auto/Sedán 🚗', is4x4: false },
  { value: 'suv', label: 'SUV 🚙', is4x4: true },
  { value: 'pickup', label: 'Pickup/Camioneta 🛻', is4x4: true },
  { value: 'jeep', label: 'Jeep 🚙', is4x4: true },
  { value: 'van', label: 'Van 🚐', is4x4: true },
  { value: 'crossover', label: 'Crossover 🚙', is4x4: true },
];

// Al seleccionar tipo, auto-asignar is_4x4
const handleTypeChange = (type: string) => {
  const selected = vehicleTypes.find(v => v.value === type);
  setVehicleData({
    ...vehicleData,
    type: type,
    is_4x4: selected?.is4x4 || false
  });
};
```

### Para el Backend (Validación):

```typescript
// Validar que motos nunca sean 4x4
if (vehicleData.type === 'moto' && vehicleData.is_4x4) {
  throw new Error('Las motos no pueden ser 4x4');
}

// Auto-asignar is_4x4 basado en type
const types4x4 = ['suv', 'pickup', 'camioneta', 'jeep', 'van', 'crossover', '4x4'];
if (types4x4.includes(vehicleData.type)) {
  vehicleData.is_4x4 = true;
}
```

---

## 🎯 Resumen

### Regla Simple:
```
type = 'moto' → is_4x4 = FALSE → Solo viajes de moto
type = 'auto'/'sedan' → is_4x4 = FALSE → Solo viajes de auto
type = 'suv'/'pickup'/etc. → is_4x4 = TRUE → Viajes de auto + DD
```

### Para Testing:
1. Registra vehículos con diferentes tipos
2. Ejecuta script SQL para marcar is_4x4
3. Verifica que el filtrado funcione correctamente

---

**Última actualización:** 10 de Octubre 2025, 21:53  
**Archivo relacionado:** `database/scripts/mark_4x4_vehicles.sql`
