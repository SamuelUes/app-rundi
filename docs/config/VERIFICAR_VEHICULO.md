# 🚗 PROBLEMA: Conductor sin Vehículo en PostgreSQL

## 🔍 Diagnóstico

El backend busca conductores con vehículo tipo "auto" (sedan, suv, pickup) en PostgreSQL, pero **NO encuentra ninguno**.

### Logs que confirman el problema:

```javascript
// ✅ Conductor disponible en Firebase
"ZA2i0sa0PdNBzkyvBHq8YMsE7XA3": {
  "status": "available",
  "lat": 12.1149917,
  "lng": -86.2361733
}

// ❌ Backend no encuentra vehículo en PostgreSQL
LOG ✅ [driversService] Respuesta recibida: {
  "count": 0,        // ← No encuentra conductores
  "drivers": []
}
```

---

## 🎯 Solución: Agregar Vehículo en PostgreSQL

### Opción 1: Desde Supabase (Recomendado)

1. Ve a **Supabase Dashboard**
2. Abre la tabla `vehicles`
3. Inserta un nuevo registro:

```sql
INSERT INTO vehicles (
  driver_id,
  plate,
  brand,
  model,
  year,
  color,
  type,
  created_at,
  updated_at
) VALUES (
  'ZA2i0sa0PdNBzkyvBHq8YMsE7XA3',  -- Tu driver_id
  'ABC-123',                         -- Placa del vehículo
  'Toyota',                          -- Marca
  'Corolla',                         -- Modelo
  2020,                              -- Año
  'Blanco',                          -- Color
  'sedan',                           -- ✅ IMPORTANTE: 'sedan', 'suv' o 'pickup'
  NOW(),
  NOW()
);
```

### Opción 2: Desde la App (Re-registrar)

Si vuelves a registrar el conductor desde la app con todos los datos del vehículo, se creará automáticamente en PostgreSQL.

---

## ✅ Verificación

Después de agregar el vehículo, ejecuta en Supabase:

```sql
-- Verificar que existe el vehículo
SELECT * FROM vehicles 
WHERE driver_id = 'ZA2i0sa0PdNBzkyvBHq8YMsE7XA3';

-- Debe retornar 1 fila con:
-- type = 'sedan' (o 'suv', 'pickup')
```

---

## 🧪 Testing

1. Agrega el vehículo en Supabase
2. Recarga la app (cliente)
3. Ve a SearchRideScreen
4. Selecciona tipo: **Auto**
5. Deberías ver:
   ```
   LOG ℹ️ Conductores con vehículo tipo "auto" disponibles: 1
   ```

---

## 📊 Logs Esperados Después del Fix

```javascript
// Backend encuentra el vehículo
LOG 🚗 Buscando conductores con cualquier tipo de auto (sedan, suv, pickup)
LOG 🚗 Total conductores encontrados: 1

// Frontend recibe respuesta positiva
LOG ✅ [driversService] Respuesta recibida: {
  "available": true,
  "count": 1,           // ✅ Ahora encuentra 1
  "drivers": [...]
}

LOG ℹ️ Conductores con vehículo tipo "auto" disponibles: 1  // ✅
```

---

## 🔧 Script SQL Completo

```sql
-- 1. Verificar si existe el conductor
SELECT * FROM drivers WHERE id = 'ZA2i0sa0PdNBzkyvBHq8YMsE7XA3';

-- 2. Verificar si tiene vehículo
SELECT * FROM vehicles WHERE driver_id = 'ZA2i0sa0PdNBzkyvBHq8YMsE7XA3';

-- 3. Si NO tiene vehículo, agregarlo
INSERT INTO vehicles (
  driver_id,
  plate,
  brand,
  model,
  year,
  color,
  type,
  created_at,
  updated_at
) VALUES (
  'ZA2i0sa0PdNBzkyvBHq8YMsE7XA3',
  'TEST-001',
  'Toyota',
  'Corolla',
  2020,
  'Blanco',
  'sedan',  -- ✅ Puede ser: 'sedan', 'suv', 'pickup', 'moto'
  NOW(),
  NOW()
);

-- 4. Verificar que se creó correctamente
SELECT 
  d.id as driver_id,
  d.full_name,
  v.type as vehicle_type,
  v.brand,
  v.model
FROM drivers d
LEFT JOIN vehicles v ON d.id = v.driver_id
WHERE d.id = 'ZA2i0sa0PdNBzkyvBHq8YMsE7XA3';
```

---

## ⚠️ Importante

El filtro del backend funciona así:

| Cliente busca | Backend busca en PostgreSQL |
|---------------|----------------------------|
| 🏍️ Moto | `type = 'moto'` |
| 🚗 Auto | `type IN ('sedan', 'suv', 'pickup')` |
| 👨‍✈️ Conductor Designado | `type = 'designated_driver'` |

**Por eso es crucial que el `type` en la tabla `vehicles` sea uno de estos valores.**

---

## 🎯 Resumen

**Problema:** Conductor disponible en Firebase pero sin vehículo en PostgreSQL  
**Solución:** Agregar registro en tabla `vehicles` con `type = 'sedan'`  
**Verificación:** Query SQL para confirmar  
**Testing:** Recargar app y buscar viaje con tipo "Auto"
