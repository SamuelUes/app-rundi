# 📊 Schema de Base de Datos Actualizado - 10 de Octubre 2025

## ✅ Estado: COMPLETAMENTE ACTUALIZADO

---

## 📝 Resumen de Cambios

Se actualizó el schema principal de Supabase (`supabase-only.sql`) integrando **todas las migraciones**:

### **Migración 001:** Pasajeros y Destinos Múltiples
- ✅ `rides.passengers` - Cantidad de pasajeros (1-6)
- ✅ `rides.extra_destinations` - Array JSON de paradas adicionales
- ✅ `rides.driver_offered_price` - Precio ofrecido por el conductor

### **Migración 002:** Tipo de Vehículo y Fotos
- ✅ `rides.vehicle_type` - Tipo solicitado (moto/auto/designated_driver)
- ✅ `rides.client_vehicle_photo` - Foto del vehículo del cliente
- ✅ `vehicles.is_4x4` - Indica si es 4x4
- ✅ `vehicles.vehicle_photo` - Foto del vehículo del conductor

### **Migración 003:** Llamadas de Emergencia
- ✅ Tabla `emergency_calls` completa
- ✅ Vista `emergency_calls_complete`
- ✅ Índices y triggers

---

## 🗂️ Estructura Completa de Tablas

### **1. drivers** (Conductores)
```sql
- id (UUID)
- user_id (VARCHAR) - Firebase UID
- license_number, license_expiry, license_photo
- status, verified_at
- total_rides, average_rating, total_earnings
- created_at, updated_at
```

### **2. vehicles** (Vehículos)
```sql
- id (UUID)
- driver_id (UUID FK)
- plate, brand, model, year, color, type
- vehicle_photo ← NUEVO
- registration_number, registration_expiry, registration_photo
- insurance_number, insurance_company, insurance_expiry, insurance_photo
- is_4x4 ← NUEVO
- is_active
- created_at, updated_at
```

### **3. rides** (Viajes)
```sql
- id (UUID)
- client_id, driver_id (VARCHAR - Firebase UIDs)
- origin_lat, origin_lng, origin_address
- destination_lat, destination_lng, destination_address
- estimated_distance, estimated_duration
- actual_distance, actual_duration
- estimated_price, final_fare
- client_suggested_price, driver_offered_price
- passengers ← MIGRACIÓN 001
- extra_destinations ← MIGRACIÓN 001
- notes, ride_type
- vehicle_type ← MIGRACIÓN 002
- client_vehicle_photo ← MIGRACIÓN 002
- status, cancel_reason, canceled_by
- requested_at, accepted_at, started_at, completed_at, canceled_at
- created_at, updated_at
```

### **4. payments** (Pagos)
```sql
- id (UUID)
- ride_id (UUID FK)
- amount, tip, total
- payment_method, status
- stripe_payment_intent_id, stripe_charge_id
- paid_at, created_at, updated_at
```

### **5. ratings** (Calificaciones)
```sql
- id (UUID)
- ride_id (UUID FK)
- from_user_id, to_user_id (VARCHAR - Firebase UIDs)
- rating (1-5)
- comment
- punctuality, cleanliness, communication (1-5)
- created_at
```

### **6. ride_locations** (Historial de Tracking)
```sql
- id (UUID)
- ride_id (UUID FK)
- lat, lng
- heading, speed, accuracy
- timestamp
```

### **7. analytics_events** (Analytics)
```sql
- id (UUID)
- user_id (VARCHAR - Firebase UID)
- event_type, event_data (JSONB)
- created_at
```

### **8. emergency_calls** (Llamadas de Emergencia) ← NUEVO
```sql
- id (UUID)
- user_id (VARCHAR - Firebase UID)
- user_role (driver/client)
- emergency_type (police/ambulance)
- emergency_number (118/102)
- lat, lng, address
- ride_id (UUID FK)
- notes, call_status
- called_at, created_at, updated_at
```

---

## 🔍 Índices Creados

### Drivers:
- `idx_drivers_user_id`
- `idx_drivers_status`

### Vehicles:
- `idx_vehicles_driver_id`
- `idx_vehicles_plate`
- `idx_vehicles_is_4x4` ← NUEVO (WHERE is_4x4 = TRUE)

### Rides:
- `idx_rides_client_id`
- `idx_rides_driver_id`
- `idx_rides_status`
- `idx_rides_created_at`
- `idx_rides_vehicle_type` ← NUEVO
- `idx_rides_passengers` ← NUEVO

### Payments:
- `idx_payments_ride_id`
- `idx_payments_status`
- `idx_payments_stripe_id`

### Ratings:
- `idx_ratings_ride_id`
- `idx_ratings_to_user_id`

### Ride Locations:
- `idx_ride_locations_ride_id`
- `idx_ride_locations_timestamp`

### Analytics:
- `idx_analytics_user_id`
- `idx_analytics_event_type`
- `idx_analytics_created_at`

### Emergency Calls: ← NUEVO
- `idx_emergency_calls_user_id`
- `idx_emergency_calls_ride_id`
- `idx_emergency_calls_type`
- `idx_emergency_calls_created_at`

---

## 📊 Vistas Creadas

### **rides_complete**
```sql
SELECT 
  r.*,
  d.license_number,
  d.average_rating as driver_rating,
  v.plate, v.brand, v.model,
  v.is_4x4, ← NUEVO
  p.amount as payment_amount,
  p.status as payment_status
FROM rides r
LEFT JOIN drivers d ON r.driver_id = d.user_id
LEFT JOIN vehicles v ON d.id = v.driver_id
LEFT JOIN payments p ON r.id = p.ride_id;
```

### **emergency_calls_complete** ← NUEVO
```sql
SELECT 
  ec.*,
  r.status as ride_status,
  r.origin_address as ride_origin,
  r.destination_address as ride_destination
FROM emergency_calls ec
LEFT JOIN rides r ON ec.ride_id = r.id
ORDER BY ec.created_at DESC;
```

---

## 🔄 Triggers Configurados

Todos los triggers `update_updated_at` están configurados para:
- `drivers`
- `vehicles`
- `rides`
- `payments`
- `emergency_calls` ← NUEVO

---

## 🔒 Seguridad

Row Level Security (RLS) **DESHABILITADO** en todas las tablas para permitir acceso desde Firebase Functions:
- `drivers`
- `vehicles`
- `rides`
- `payments`
- `ratings`
- `ride_locations`
- `analytics_events`
- `emergency_calls`

---

## 📁 Archivos Actualizados

### **1. supabase-only.sql** (Principal)
✅ Schema completo con todas las migraciones integradas
✅ Listo para ejecutar en Supabase
✅ Incluye todas las tablas, índices, vistas y triggers

### **2. Migraciones Individuales:**

#### **001_add_passengers_and_destinations.sql**
- Agrega: `passengers`, `extra_destinations`, `driver_offered_price`
- Estado: ✅ Integrada en schema principal

#### **002_add_vehicle_type_and_photo.sql**
- Agrega: `vehicle_type`, `client_vehicle_photo`, `is_4x4`, `vehicle_photo`
- Estado: ✅ Corregida y actualizada
- Estado: ✅ Integrada en schema principal

#### **add_emergency_calls.sql**
- Agrega: Tabla `emergency_calls` completa
- Estado: ✅ Integrada en schema principal

---

## 🚀 Instrucciones de Deployment

### **Opción 1: Schema Completo (Recomendado para DB nueva)**
```bash
# Ir a Supabase Dashboard
https://supabase.com/dashboard/project/ceytngpresytjhafcadu

# SQL Editor → Ejecutar:
database/supabase-only.sql
```

### **Opción 2: Solo Migración 002 (Si ya tienes las tablas)**
```bash
# Ir a Supabase Dashboard
https://supabase.com/dashboard/project/ceytngpresytjhafcadu

# SQL Editor → Ejecutar:
database/migrations/002_add_vehicle_type_and_photo.sql
```

---

## ✅ Verificación Post-Deployment

### **Verificar columnas en rides:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'rides' 
AND column_name IN (
  'passengers', 
  'extra_destinations', 
  'driver_offered_price',
  'vehicle_type', 
  'client_vehicle_photo'
)
ORDER BY column_name;
```

### **Verificar columnas en vehicles:**
```sql
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'vehicles' 
AND column_name IN ('is_4x4', 'vehicle_photo')
ORDER BY column_name;
```

### **Verificar tabla emergency_calls:**
```sql
SELECT table_name 
FROM information_schema.tables 
WHERE table_name = 'emergency_calls';
```

---

## 📈 Próximos Pasos

1. ✅ Schema actualizado
2. ⏳ Ejecutar en Supabase
3. ⏳ Compilar Firebase Functions
4. ⏳ Redesplegar Functions
5. ⏳ Testing end-to-end

---

## 📝 Notas Importantes

### **Campos de Foto:**
- `drivers.license_photo` - Foto de la licencia del conductor
- `vehicles.vehicle_photo` - Foto del vehículo del conductor
- `vehicles.registration_photo` - Foto de la matrícula
- `vehicles.insurance_photo` - Foto del seguro
- `rides.client_vehicle_photo` - Foto del vehículo del cliente (solo conductor designado)

### **Tipos de Vehículo:**
- `moto` - Motocicleta
- `auto` - Automóvil
- `designated_driver` - Conductor designado (requiere 4x4)

### **Tipos de Emergencia:**
- `police` - Policía (118)
- `ambulance` - Ambulancia (102)

---

**Fecha de actualización:** 10 de Octubre 2025  
**Versión del Schema:** 1.3.0  
**Estado:** ✅ LISTO PARA DEPLOYMENT
