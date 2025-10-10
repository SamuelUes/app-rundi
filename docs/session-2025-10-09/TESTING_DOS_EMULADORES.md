# 🧪 TESTING CON DOS EMULADORES

## 🎯 OBJETIVO:
Probar el flujo completo de viajes con:
- **Emulador 1:** Cliente (solicita viaje)
- **Emulador 2:** Conductor (acepta y completa viaje)

---

## 📱 CONFIGURACIÓN INICIAL:

### **PASO 1: Crear/Iniciar Dos Emuladores**

#### **Opción A: Desde Android Studio**

1. **Abre AVD Manager:**
   - Tools → Device Manager
   - O click en el ícono de dispositivo en la barra superior

2. **Crea/Inicia el primer emulador:**
   - Click en ▶️ (Play) en un dispositivo
   - Espera a que inicie completamente
   - **Nombre sugerido:** "Pixel_Cliente"

3. **Crea/Inicia el segundo emulador:**
   - Click en ▶️ en otro dispositivo
   - Espera a que inicie
   - **Nombre sugerido:** "Pixel_Conductor"

#### **Opción B: Desde Terminal**

```bash
# Listar emuladores disponibles
emulator -list-avds

# Iniciar primer emulador (Cliente)
emulator -avd Pixel_5_API_30 &

# Esperar 30 segundos...

# Iniciar segundo emulador (Conductor)
emulator -avd Pixel_4_API_30 &
```

---

### **PASO 2: Verificar que Ambos Están Conectados**

```bash
# Ver dispositivos conectados
adb devices

# Deberías ver algo como:
# emulator-5554    device
# emulator-5556    device
```

**Nota:** Los puertos suelen ser 5554, 5556, 5558, etc.

---

### **PASO 3: Configurar GPS en Ambos Emuladores**

#### **Emulador 1 (Cliente) - Ubicación en Metrocentro:**

```bash
# Conectar al primer emulador
adb -s emulator-5554 emu geo fix -86.2674 12.1258
```

#### **Emulador 2 (Conductor) - Ubicación en Plaza Inter:**

```bash
# Conectar al segundo emulador
adb -s emulator-5556 emu geo fix -86.2362 12.1167
```

**Ubicaciones:**
- Cliente (Metrocentro): `12.1258, -86.2674`
- Conductor (Plaza Inter): `12.1167, -86.2362`
- Distancia: ~3.5 km

---

### **PASO 4: Instalar la App en Ambos Emuladores**

#### **Opción A: Expo automático (si usas Expo Go)**

```bash
cd Frontend
npm start
```

- Escanea el QR en ambos emuladores
- O presiona `a` para abrir en Android

#### **Opción B: Build e instalar manualmente**

```bash
# Instalar en emulador 1
adb -s emulator-5554 install app-debug.apk

# Instalar en emulador 2
adb -s emulator-5556 install app-debug.apk
```

---

## 🧪 FLUJO DE TESTING COMPLETO:

### **FASE 1: REGISTRO**

#### **Emulador 1 (Cliente):**
1. ✅ Abre la app
2. ✅ Registro como **Cliente**:
   - Email: `cliente@test.com`
   - Password: `test123`
   - Nombre: `Juan Cliente`
   - Teléfono: `88881111`
   - Role: **Cliente**

#### **Emulador 2 (Conductor):**
1. ✅ Abre la app
2. ✅ Registro como **Conductor**:
   - Email: `conductor@test.com`
   - Password: `test123`
   - Nombre: `Pedro Conductor`
   - Teléfono: `88882222`
   - Role: **Conductor**
   - Licencia: `C-123456`
   - Vehículo:
     - Marca: Toyota
     - Modelo: Corolla
     - Año: 2020
     - Color: Blanco
     - Placa: `M-12345`

---

### **FASE 2: SOLICITAR VIAJE (CLIENTE)**

#### **En Emulador 1:**

1. ✅ Login como `cliente@test.com`
2. ✅ Ir a `SearchRideScreen`
3. ✅ Seleccionar origen:
   - Debería detectar Metrocentro automáticamente
   - O seleccionar manualmente
4. ✅ Seleccionar destino:
   - Click en "📍 Seleccionar en mapa"
   - Buscar "Aeropuerto Managua" o coordenadas: `12.1415, -86.1682`
5. ✅ Ver precio estimado (~C$150-200)
6. ✅ Click "Buscar Conductor"
7. ✅ Ver `RideConfirmationScreen`:
   - "Buscando conductor disponible..."
   - Animación de loading

**Resultado esperado:**
```
✅ Viaje creado en Firebase
✅ Estado: REQUESTED
✅ Polling cada 5 segundos
```

---

### **FASE 3: ACEPTAR VIAJE (CONDUCTOR)**

#### **En Emulador 2:**

1. ✅ Login como `conductor@test.com`
2. ✅ Ir a `DriverHomeScreen`
3. ✅ Toggle "Disponible" → ON
4. ✅ Deberías ver notificación de nuevo viaje
5. ✅ Click en el viaje
6. ✅ Ver `RideRequestsScreen`:
   - Origen: Metrocentro
   - Destino: Aeropuerto
   - Precio: ~C$150-200
   - Distancia: ~10 km
7. ✅ Click "Aceptar Viaje"

**Resultado esperado:**
```
✅ Viaje actualizado en Firebase
✅ Estado: ACCEPTED
✅ driverId asignado
```

---

### **FASE 4: VER CONDUCTOR (CLIENTE)**

#### **En Emulador 1:**

**Automáticamente (máximo 5 segundos):**

1. ✅ Pantalla se actualiza
2. ✅ Aparece "🎉 ¡Conductor encontrado!"
3. ✅ Muestra información:
   - Avatar: "P"
   - Nombre: "Pedro Conductor"
   - Rating: ⭐ 5.0
   - Vehículo: "Toyota Corolla • Blanco"
   - Placa: "M-12345"
4. ✅ ETA: "5-10 minutos"
5. ✅ Botón "Ver en Mapa 🗺️"

**Resultado esperado:**
```
✅ Información del conductor visible
✅ Botón para ver tracking habilitado
```

---

### **FASE 5: TRACKING EN TIEMPO REAL**

#### **En Emulador 1 (Cliente):**

1. ✅ Click "Ver en Mapa 🗺️"
2. ✅ Ver `RideTrackingScreen`:
   - Mapa con ubicación del conductor
   - Ruta desde conductor hasta cliente
   - Info del viaje
   - Botón "Contactar conductor"

#### **En Emulador 2 (Conductor):**

1. ✅ Ver `ActiveRideScreen`:
   - Mapa con ruta al cliente
   - Info del cliente
   - Botón "He llegado"
   - Botón "Contactar cliente"

---

### **FASE 6: SIMULAR MOVIMIENTO DEL CONDUCTOR**

#### **Opción A: Manual (Cambiar GPS)**

```bash
# Mover conductor hacia el cliente (cada 10 segundos)
adb -s emulator-5556 emu geo fix -86.2500 12.1200
# Esperar 10s
adb -s emulator-5556 emu geo fix -86.2600 12.1230
# Esperar 10s
adb -s emulator-5556 emu geo fix -86.2674 12.1258  # Llegó al cliente
```

#### **Opción B: Automático (Extended Controls)**

1. En emulador del conductor: `...` → Location → Routes
2. Crear ruta desde Plaza Inter a Metrocentro
3. Click "PLAY ROUTE"

**Resultado esperado:**
```
✅ Cliente ve el conductor moviéndose en el mapa
✅ ETA se actualiza dinámicamente
```

---

### **FASE 7: CONDUCTOR LLEGA**

#### **En Emulador 2 (Conductor):**

1. ✅ Click "He llegado"
2. ✅ Estado cambia a: `DRIVER_ARRIVED`

#### **En Emulador 1 (Cliente):**

**Automáticamente:**
1. ✅ Notificación: "Tu conductor ha llegado"
2. ✅ Botón "Iniciar viaje" visible

---

### **FASE 8: INICIAR VIAJE**

#### **En Emulador 2 (Conductor):**

1. ✅ Click "Iniciar viaje"
2. ✅ Estado cambia a: `IN_PROGRESS`
3. ✅ Ruta cambia a destino (Aeropuerto)

#### **En Emulador 1 (Cliente):**

**Automáticamente:**
1. ✅ Mapa muestra ruta al destino
2. ✅ "Viaje en progreso..."

---

### **FASE 9: COMPLETAR VIAJE**

#### **En Emulador 2 (Conductor):**

1. ✅ Simular llegada al destino:
   ```bash
   adb -s emulator-5556 emu geo fix -86.1682 12.1415
   ```
2. ✅ Click "Finalizar viaje"
3. ✅ Estado cambia a: `COMPLETED`

#### **En Emulador 1 (Cliente):**

**Automáticamente:**
1. ✅ Navega a `RatingScreen`
2. ✅ Calificar conductor (1-5 estrellas)
3. ✅ Agregar comentario (opcional)
4. ✅ Agregar propina (opcional)
5. ✅ Click "Enviar"

---

### **FASE 10: CALIFICACIÓN**

#### **Ambos Emuladores:**

1. ✅ Cliente califica conductor
2. ✅ Conductor califica cliente
3. ✅ Ratings se actualizan en perfiles
4. ✅ Viaje aparece en historial

---

## 🔍 VERIFICACIONES EN CADA FASE:

### **Firebase Console:**

```
Realtime Database → activeRides/{rideId}
  - status: "requested" → "accepted" → "driver_arrived" → "in_progress" → "completed"
  - clientId: ID del cliente
  - driverId: ID del conductor
  - currentLocation: Se actualiza con movimiento

Firestore → users/{userId}
  - stats.totalRides: incrementa
  - rating: se actualiza
```

### **Supabase PostgreSQL:**

```sql
-- Ver el viaje
SELECT * FROM rides WHERE id = 'RIDE_ID';

-- Ver tracking
SELECT * FROM ride_locations WHERE ride_id = 'RIDE_ID' ORDER BY timestamp;

-- Ver calificaciones
SELECT * FROM ratings WHERE ride_id = 'RIDE_ID';
```

---

## 🐛 TROUBLESHOOTING:

### **Problema 1: Emuladores muy lentos**

**Solución:**
- Cierra otros programas
- Usa emuladores con menos RAM (2GB en vez de 4GB)
- Habilita "Hardware Acceleration" en AVD Manager

### **Problema 2: App no se instala en segundo emulador**

**Solución:**
```bash
# Especificar dispositivo
adb -s emulator-5556 install -r app.apk
```

### **Problema 3: No se ven los cambios en tiempo real**

**Solución:**
- Verifica que Firebase esté conectado
- Revisa logs de ambos emuladores
- Asegúrate que el polling esté funcionando

### **Problema 4: GPS no funciona en uno de los emuladores**

**Solución:**
```bash
# Verificar dispositivo
adb devices

# Configurar GPS específico
adb -s emulator-5554 emu geo fix -86.2674 12.1258
adb -s emulator-5556 emu geo fix -86.2362 12.1167
```

---

## 📊 COMANDOS ÚTILES:

### **Ver logs de ambos emuladores:**

```bash
# Terminal 1 - Cliente
adb -s emulator-5554 logcat | grep DriveAngel

# Terminal 2 - Conductor
adb -s emulator-5556 logcat | grep DriveAngel
```

### **Cambiar GPS rápidamente:**

```bash
# Cliente en Metrocentro
adb -s emulator-5554 emu geo fix -86.2674 12.1258

# Conductor en Plaza Inter
adb -s emulator-5556 emu geo fix -86.2362 12.1167

# Conductor en Aeropuerto (destino)
adb -s emulator-5556 emu geo fix -86.1682 12.1415
```

### **Reiniciar app en emulador específico:**

```bash
# Cerrar app
adb -s emulator-5554 shell am force-stop com.driveangel

# Abrir app
adb -s emulator-5554 shell am start -n com.driveangel/.MainActivity
```

---

## ✅ CHECKLIST COMPLETO:

### **Setup:**
- [ ] Dos emuladores iniciados
- [ ] GPS configurado en ambos
- [ ] App instalada en ambos
- [ ] Firebase conectado

### **Registro:**
- [ ] Cliente registrado
- [ ] Conductor registrado con vehículo

### **Flujo de Viaje:**
- [ ] Cliente solicita viaje
- [ ] Conductor ve viaje disponible
- [ ] Conductor acepta viaje
- [ ] Cliente ve info del conductor
- [ ] Tracking en tiempo real funciona
- [ ] Conductor llega
- [ ] Viaje inicia
- [ ] Viaje completa
- [ ] Ambos califican

### **Verificaciones:**
- [ ] Estados se actualizan correctamente
- [ ] Firebase Realtime DB se actualiza
- [ ] PostgreSQL guarda historial
- [ ] Notificaciones funcionan
- [ ] UI se actualiza automáticamente

---

## 🎯 SCRIPT DE TESTING RÁPIDO:

```bash
# 1. Iniciar emuladores
emulator -avd Pixel_5_API_30 &
sleep 30
emulator -avd Pixel_4_API_30 &
sleep 30

# 2. Verificar conexión
adb devices

# 3. Configurar GPS
adb -s emulator-5554 emu geo fix -86.2674 12.1258  # Cliente
adb -s emulator-5556 emu geo fix -86.2362 12.1167  # Conductor

# 4. Iniciar app
cd Frontend
npm start
```

---

**Guía creada el 2025-10-09 a las 17:43** 🧪✨

**Estado:** Listo para testing con 2 emuladores
