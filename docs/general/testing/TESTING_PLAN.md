# 🧪 Plan de Testing - Sistema de Vehículos

## Fecha: 10 de Octubre 2025
## Estado: En Progreso

---

## 📋 Checklist de Testing

### ✅ Fase 1: Verificación de Backend

#### 1.1 Base de Datos (Supabase)
- [ ] Verificar que existen las columnas nuevas en `rides`
- [ ] Verificar que existen las columnas nuevas en `vehicles`
- [ ] Verificar índices creados
- [ ] Insertar datos de prueba

#### 1.2 Firebase Functions
- [ ] Health check funcionando
- [ ] `calculatePrice` con isDesignatedDriver
- [ ] `updateDesignatedDriverMode` funciona
- [ ] `getAvailableRides` filtra correctamente

#### 1.3 Firebase Realtime DB
- [ ] Campo `designatedDriverMode` se actualiza
- [ ] Lectura de estado del conductor

---

### ✅ Fase 2: Testing de Frontend

#### 2.1 SearchRideScreen (Cliente)
- [ ] Selector de vehículo visible
- [ ] Botones cambian de color al seleccionar
- [ ] Alert aparece al seleccionar Conductor Designado
- [ ] Upload de foto solo visible para Conductor Designado
- [ ] Validación: No permite solicitar sin foto
- [ ] Precio se calcula correctamente (×1.5)
- [ ] Solicitud se envía con campos correctos

#### 2.2 DriverHomeScreen (Conductor)
- [ ] Switch solo visible si vehículo es 4x4
- [ ] Switch deshabilitado si no está disponible
- [ ] Alert si intenta activar sin 4x4
- [ ] Estado se sincroniza con Firebase
- [ ] Confirmación visual al activar

#### 2.3 AvailableRidesScreen (Conductor)
- [ ] Badge de tipo de vehículo visible
- [ ] Colores correctos por tipo
- [ ] Foto del cliente visible (solo DD)
- [ ] Contador de pasajeros correcto
- [ ] Filtrado funciona (solo ve viajes compatibles)

---

### ✅ Fase 3: Testing de Flujos Completos

#### 3.1 Flujo: Cliente solicita viaje en MOTO
```
1. Cliente selecciona "Moto"
2. Ingresa origen y destino
3. Ve precio calculado
4. Solicita viaje
5. Solo conductores con moto ven el viaje
```
- [ ] Cliente puede solicitar
- [ ] Precio correcto
- [ ] Solo conductores con moto lo ven

#### 3.2 Flujo: Cliente solicita viaje en AUTO
```
1. Cliente selecciona "Auto"
2. Ingresa origen y destino
3. Ve precio calculado
4. Solicita viaje
5. Solo conductores con auto lo ven
```
- [ ] Cliente puede solicitar
- [ ] Precio correcto
- [ ] Solo conductores con auto lo ven

#### 3.3 Flujo: Cliente solicita CONDUCTOR DESIGNADO
```
1. Cliente selecciona "Conductor Designado"
2. Lee mensaje explicativo → Confirma
3. Toma foto de su vehículo
4. Ingresa origen y destino
5. Ve precio calculado (×1.5)
6. Solicita viaje
7. Solo conductores 4x4 con modo activo lo ven
8. Conductor ve foto del vehículo del cliente
```
- [ ] Alert explicativo aparece
- [ ] Upload de foto funciona
- [ ] Validación de foto funciona
- [ ] Precio ×1.5 correcto
- [ ] Solo conductores 4x4 + modo ON lo ven
- [ ] Conductor ve foto del vehículo

#### 3.4 Flujo: Conductor activa Modo Conductor Designado
```
1. Conductor tiene vehículo 4x4
2. Activa disponibilidad
3. Ve switch "Modo Conductor Designado"
4. Activa el switch
5. Recibe confirmación
6. Ve viajes de conductor designado
```
- [ ] Switch visible solo si 4x4
- [ ] Activación funciona
- [ ] Sincronización con Firebase
- [ ] Ve viajes de conductor designado

---

### ✅ Fase 4: Testing de Edge Cases

#### 4.1 Validaciones
- [ ] Cliente intenta solicitar DD sin foto → Error
- [ ] Conductor sin 4x4 intenta activar modo DD → Error
- [ ] Conductor inactivo intenta activar modo DD → Error
- [ ] Precio mínimo respetado

#### 4.2 Filtrado
- [ ] Conductor con moto NO ve viajes de auto
- [ ] Conductor con auto NO ve viajes de moto
- [ ] Conductor 4x4 sin modo DD NO ve viajes DD
- [ ] Conductor 4x4 con modo DD SÍ ve viajes DD

#### 4.3 Sincronización
- [ ] Cambio de modo se refleja inmediatamente
- [ ] Desactivar disponibilidad desactiva modo DD
- [ ] Múltiples conductores ven viajes correctos

---

## 🛠️ Scripts de Testing

### Script 1: Verificar Base de Datos
```sql
-- Ejecutar en Supabase SQL Editor

-- 1. Verificar columnas en rides
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'rides' 
AND column_name IN ('vehicle_type', 'client_vehicle_photo', 'passengers', 'extra_destinations')
ORDER BY column_name;

-- 2. Verificar columnas en vehicles
SELECT column_name, data_type, column_default
FROM information_schema.columns 
WHERE table_name = 'vehicles' 
AND column_name IN ('is_4x4', 'vehicle_photo')
ORDER BY column_name;

-- 3. Verificar índices
SELECT indexname, indexdef 
FROM pg_indexes 
WHERE tablename IN ('rides', 'vehicles')
AND indexname LIKE '%vehicle%'
ORDER BY tablename, indexname;

-- 4. Contar registros
SELECT 
  (SELECT COUNT(*) FROM rides) as total_rides,
  (SELECT COUNT(*) FROM rides WHERE vehicle_type = 'designated_driver') as dd_rides,
  (SELECT COUNT(*) FROM vehicles WHERE is_4x4 = true) as vehicles_4x4;
```

### Script 2: Insertar Datos de Prueba
```sql
-- Ejecutar en Supabase SQL Editor

-- 1. Marcar un vehículo como 4x4 (ajustar ID)
UPDATE vehicles 
SET is_4x4 = TRUE, 
    vehicle_photo = 'https://example.com/vehicle.jpg'
WHERE id = 'TU_VEHICLE_ID_AQUI';

-- 2. Verificar
SELECT d.user_id, v.plate, v.type, v.is_4x4, v.vehicle_photo
FROM drivers d
JOIN vehicles v ON d.id = v.driver_id
WHERE v.is_4x4 = TRUE;
```

### Script 3: Test de Firebase Functions
```bash
# Ejecutar en PowerShell

# 1. Health Check
curl https://us-central1-driveangel-ni.cloudfunctions.net/healthCheck

# 2. Calculate Price Normal
# (Requiere autenticación - usar desde la app)

# 3. Calculate Price Conductor Designado
# (Requiere autenticación - usar desde la app)
```

---

## 📱 Testing Manual en la App

### Preparación:
1. **Crear 2 cuentas de conductor:**
   - Conductor A: Vehículo normal (auto)
   - Conductor B: Vehículo 4x4

2. **Crear 1 cuenta de cliente**

### Test 1: Viaje Normal en Auto
```
Cliente:
1. Abrir SearchRideScreen
2. Seleccionar "Auto" (debe estar verde)
3. Ingresar origen: "Managua Centro"
4. Ingresar destino: "Metrocentro"
5. Verificar precio calculado (ej: C$350)
6. Solicitar viaje

Conductor A (auto):
1. Abrir AvailableRidesScreen
2. Verificar que aparece el viaje
3. Verificar badge verde "🚗 Auto"
4. Verificar precio C$350

Conductor B (4x4):
1. Abrir AvailableRidesScreen
2. Verificar que aparece el viaje (si modo DD OFF)
3. Verificar badge verde "🚗 Auto"
```

### Test 2: Viaje en Moto
```
Cliente:
1. Seleccionar "Moto" (debe estar morado)
2. Ingresar origen y destino
3. Verificar precio calculado
4. Solicitar viaje

Conductor A (auto):
1. NO debe ver el viaje

Conductor con Moto:
1. Debe ver el viaje
2. Badge morado "🏍️ Moto"
```

### Test 3: Conductor Designado (COMPLETO)
```
Preparación:
1. Conductor B marca su vehículo como 4x4 en Supabase
2. Conductor B activa disponibilidad
3. Conductor B activa "Modo Conductor Designado"

Cliente:
1. Seleccionar "Conductor Designado" (debe estar naranja)
2. Leer alert explicativo → Confirmar
3. Ver botón "Tomar Foto del Vehículo"
4. Tomar/seleccionar foto de un vehículo
5. Ver preview de la foto
6. Ingresar origen y destino
7. Verificar precio ×1.5 (ej: C$350 → C$525)
8. Solicitar viaje

Conductor A (auto):
1. NO debe ver el viaje

Conductor B (4x4 + modo DD ON):
1. Debe ver el viaje
2. Badge naranja "👨‍✈️ Conductor Designado"
3. Ver foto del vehículo del cliente
4. Precio C$525
5. Aceptar viaje
```

### Test 4: Validaciones
```
Test 4.1: Sin foto en DD
1. Cliente selecciona "Conductor Designado"
2. NO toma foto
3. Intenta solicitar viaje
4. Debe mostrar error: "Debes subir foto del vehículo"

Test 4.2: Conductor sin 4x4
1. Conductor A (auto) intenta activar modo DD
2. Switch NO debe estar visible

Test 4.3: Conductor inactivo
1. Conductor B (4x4) está offline
2. Intenta activar modo DD
3. Debe mostrar alert: "Activa tu disponibilidad primero"
```

---

## 📊 Resultados Esperados

### Cálculo de Precios:
```
Distancia: 10 km
Base: C$50 + (10 × C$30) = C$350

Viaje Normal: C$350
Viaje con 1 parada extra: C$350 + C$20 = C$370
Conductor Designado: C$350 × 1.5 = C$525
Conductor Designado + 1 parada: (C$350 + C$20) × 1.5 = C$555
```

### Filtrado de Conductores:
```
Viaje solicitado: MOTO
- Conductor con moto: ✅ VE
- Conductor con auto: ❌ NO VE
- Conductor 4x4: ❌ NO VE

Viaje solicitado: AUTO
- Conductor con moto: ❌ NO VE
- Conductor con auto: ✅ VE
- Conductor 4x4 (modo OFF): ✅ VE

Viaje solicitado: CONDUCTOR DESIGNADO
- Conductor con moto: ❌ NO VE
- Conductor con auto: ❌ NO VE
- Conductor 4x4 (modo OFF): ❌ NO VE
- Conductor 4x4 (modo ON): ✅ VE
```

---

## 🐛 Bugs a Reportar

### Formato:
```
**Bug #X: [Título]**
- Severidad: Alta/Media/Baja
- Pasos para reproducir:
  1. ...
  2. ...
- Resultado esperado: ...
- Resultado actual: ...
- Screenshot: [si aplica]
```

---

## ✅ Criterios de Aceptación

### Frontend:
- [ ] Todos los componentes visuales funcionan
- [ ] No hay errores en consola
- [ ] Navegación fluida
- [ ] Validaciones funcionan

### Backend:
- [ ] Filtrado correcto al 100%
- [ ] Precios calculados correctamente
- [ ] Sincronización en tiempo real
- [ ] Sin errores en logs

### UX:
- [ ] Mensajes claros y comprensibles
- [ ] Feedback visual inmediato
- [ ] Flujo intuitivo
- [ ] Sin pasos confusos

---

## 📝 Registro de Testing

### Tester: _____________
### Fecha: _____________

| Test | Estado | Notas |
|------|--------|-------|
| Verificar BD | ⬜ | |
| Health Check | ⬜ | |
| Viaje Auto | ⬜ | |
| Viaje Moto | ⬜ | |
| Viaje DD | ⬜ | |
| Filtrado | ⬜ | |
| Validaciones | ⬜ | |
| Precios | ⬜ | |

**Leyenda:**
- ⬜ Pendiente
- ✅ Pasó
- ❌ Falló
- ⚠️ Con observaciones

---

## 🚀 Próximos Pasos Después del Testing

1. Corregir bugs encontrados
2. Optimizar performance
3. Agregar analytics
4. Documentar para usuarios finales
5. Preparar release notes

---

**Última actualización:** 10 de Octubre 2025, 21:42
