# 🧪 TESTING - FLUJO COMPLETO DE VIAJES

## 📋 PRUEBAS A REALIZAR:

### **TEST 1: Solicitar Viaje (Cliente)**

#### **Pasos:**
1. ✅ Abrir la app como **Cliente**
2. ✅ En `SearchRideScreen`:
   - Seleccionar origen (tu ubicación actual por defecto)
   - Seleccionar destino en el mapa o escribir dirección
   - Ver precio estimado, distancia y duración
   - Click en "Buscar Conductor"

#### **Resultado Esperado:**
- ✅ Navega a `RideConfirmationScreen`
- ✅ Muestra "Buscando conductor disponible..."
- ✅ Animación de loading
- ✅ Detalles del viaje visibles (origen, destino, precio, distancia)
- ✅ Botón "Cancelar Viaje" funcional

---

### **TEST 2: Conductor Acepta Viaje**

#### **Pasos:**
1. ✅ Simular que un conductor acepta el viaje
   - Esto normalmente lo haría otro usuario conductor
   - Para testing, puedes usar Firebase Console o Postman

#### **Resultado Esperado en Cliente:**
- ✅ La pantalla se actualiza automáticamente (polling cada 5s)
- ✅ Aparece sección "🎉 ¡Conductor encontrado!"
- ✅ Muestra información del conductor:
  - Avatar con inicial
  - Nombre del conductor
  - Rating (⭐ X.X)
  - Vehículo (marca, modelo, color)
  - Placa del vehículo
- ✅ Muestra "Tiempo estimado de llegada: 5-10 minutos"
- ✅ Botón "Ver en Mapa 🗺️" visible

---

### **TEST 3: Ver Tracking en Mapa**

#### **Pasos:**
1. ✅ Click en "Ver en Mapa 🗺️"

#### **Resultado Esperado:**
- ✅ Navega a `RideTrackingScreen`
- ✅ Muestra mapa con:
  - Tu ubicación (marcador azul)
  - Ubicación del conductor (marcador del carro)
  - Ruta entre conductor y tu ubicación
- ✅ Información del viaje visible
- ✅ Botón "Contactar conductor" (abre chat)

---

### **TEST 4: Cancelar Viaje**

#### **Pasos:**
1. ✅ En `RideConfirmationScreen`
2. ✅ Click en "Cancelar Viaje"
3. ✅ Confirmar en el diálogo

#### **Resultado Esperado:**
- ✅ Muestra diálogo de confirmación
- ✅ Al confirmar, cancela el viaje en backend
- ✅ Muestra mensaje "Viaje Cancelado"
- ✅ Navega de vuelta a `ClientHome`

---

## 🔍 VERIFICACIONES:

### **En Firebase Console:**

#### **Firestore:**
```
users/{userId}
  - Verificar que existe el perfil del usuario
```

#### **Realtime Database:**
```
activeRides/{rideId}
  - status: "requested" o "accepted"
  - clientId: ID del cliente
  - driverId: ID del conductor (cuando sea aceptado)
  - origin: { lat, lng, address }
  - destination: { lat, lng, address }
  - estimatedPrice: número
```

### **En Supabase PostgreSQL:**
```sql
-- Ver viajes creados
SELECT * FROM rides ORDER BY created_at DESC LIMIT 10;

-- Ver conductor asignado
SELECT r.*, d.name as driver_name, v.plate 
FROM rides r
LEFT JOIN drivers d ON r.driver_id = d.id
LEFT JOIN vehicles v ON d.vehicle_id = v.id
WHERE r.id = 'RIDE_ID';
```

---

## 🐛 POSIBLES ERRORES Y SOLUCIONES:

### **Error 1: "No se pudo obtener la ubicación"**
**Causa:** Permisos de ubicación no otorgados
**Solución:** 
- Android: Settings → Apps → DriveAngel → Permissions → Location → Allow
- iOS: Settings → DriveAngel → Location → While Using

### **Error 2: "No se pudieron obtener las coordenadas del lugar"**
**Causa:** API de Google Maps no responde
**Solución:**
- Verificar API key en `.env`
- Verificar que Google Maps API esté habilitada

### **Error 3: Pantalla se queda en "Buscando conductor..."**
**Causa:** No hay conductores disponibles o no se actualizó el estado
**Solución:**
- Verificar que hay conductores registrados
- Verificar polling (cada 5s debe llamar a `getRideDetails`)
- Verificar en Firebase Console que el estado cambió

### **Error 4: No muestra información del conductor**
**Causa:** Backend no retorna datos del conductor
**Solución:**
- Verificar que el endpoint `/rides/{rideId}` incluye `driver` en la respuesta
- Verificar que el conductor tiene datos completos en la BD

---

## 📱 TESTING MANUAL:

### **Flujo Completo (Happy Path):**
```
1. Cliente abre app
2. Selecciona origen y destino
3. Ve precio estimado
4. Solicita viaje
5. Espera conductor (polling)
6. Conductor acepta
7. Ve info del conductor
8. Click "Ver en Mapa"
9. Ve tracking en tiempo real
10. Conductor llega
11. Viaje inicia
12. Viaje completa
13. Cliente califica
```

### **Flujo de Cancelación:**
```
1. Cliente solicita viaje
2. Espera conductor
3. Decide cancelar
4. Confirma cancelación
5. Viaje cancelado
6. Vuelve a home
```

---

## 🔧 COMANDOS ÚTILES:

### **Ver logs del frontend:**
```bash
# En la terminal donde corre npm start
# Los logs aparecen automáticamente
```

### **Ver logs de Firebase Functions:**
```bash
firebase functions:log --only rides
```

### **Simular aceptación de viaje (Postman/cURL):**
```bash
curl -X POST https://us-central1-driveangel-ni.cloudfunctions.net/acceptRide \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "rideId": "RIDE_ID",
    "driverId": "DRIVER_ID",
    "vehicleId": "VEHICLE_ID",
    "currentLocation": {
      "lat": 12.1364,
      "lng": -86.2514
    }
  }'
```

---

## ✅ CHECKLIST DE TESTING:

### **Funcionalidad Básica:**
- [ ] Seleccionar origen y destino
- [ ] Ver precio estimado
- [ ] Solicitar viaje
- [ ] Ver pantalla de confirmación
- [ ] Polling funciona (actualiza cada 5s)
- [ ] Cancelar viaje funciona

### **Cuando Conductor Acepta:**
- [ ] Pantalla se actualiza automáticamente
- [ ] Muestra info del conductor
- [ ] Avatar se muestra correctamente
- [ ] Rating se muestra
- [ ] Info del vehículo se muestra
- [ ] Botón "Ver en Mapa" funciona

### **Navegación:**
- [ ] SearchRideScreen → RideConfirmationScreen
- [ ] RideConfirmationScreen → RideTrackingScreen
- [ ] Cancelar → ClientHome

### **UI/UX:**
- [ ] Loading states se muestran
- [ ] Mensajes de error se muestran
- [ ] Botones están habilitados/deshabilitados correctamente
- [ ] Animaciones funcionan suavemente

---

## 📊 MÉTRICAS A OBSERVAR:

- **Tiempo de respuesta:** Polling debe ser < 1s
- **Actualización UI:** Debe ser instantánea al recibir datos
- **Consumo de batería:** Polling cada 5s es aceptable
- **Uso de datos:** Mínimo (solo JSON pequeños)

---

**Testing creado el 2025-10-09 a las 17:22** 🧪✨

**Estado:** Listo para probar RideConfirmationScreen mejorado
