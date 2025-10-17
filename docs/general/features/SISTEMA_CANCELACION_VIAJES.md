# 🚫 Sistema de Cancelación de Viajes con Validación de Progreso

## Fecha: 10 de Octubre 2025, 23:10

---

## 📋 **Reglas de Cancelación:**

### **Progreso < 20%:**
- ✅ Puede cancelar sin justificación
- ✅ Cancelación inmediata
- ✅ No requiere razón obligatoria

### **Progreso >= 20%:**
- ⚠️ Requiere justificación obligatoria
- ⚠️ Razón mínima: 10 caracteres
- ⚠️ Se registra en base de datos
- ⚠️ Notifica a la otra parte

---

## 🔄 **Flujo de Cancelación:**

### **Paso 1: Usuario Solicita Cancelar**
```
1. Usuario presiona botón "Cancelar Viaje"
   ↓
2. Sistema obtiene datos del viaje desde PostgreSQL
   ↓
3. Verifica estado del viaje:
   - ✅ requested, accepted, driver_arrived, in_progress
   - ❌ completed, canceled
```

### **Paso 2: Calcular Progreso (si está in_progress)**
```
1. Obtener ubicación actual del conductor desde Firebase Realtime DB
   ↓
2. Calcular distancia restante hasta destino
   ↓
3. Calcular progreso:
   progressPercentage = (distanciaRecorrida / distanciaTotal) * 100
   ↓
4. Log: "📊 Progreso del viaje: X%"
```

### **Paso 3: Validar Justificación**
```
SI progreso < 20%:
  - Puede cancelar sin razón
  - Mostrar confirmación simple
  
SI progreso >= 20%:
  - Requiere razón de al menos 10 caracteres
  - Mostrar diálogo con input de texto
  - Sugerencias de razones comunes
```

### **Paso 4: Actualizar Base de Datos**
```
1. UPDATE rides SET:
   - status = 'canceled'
   - canceled_at = NOW()
   - cancel_reason = razón proporcionada
   - canceled_by = 'client' o 'driver'
   ↓
2. Eliminar de Firebase Realtime DB:
   - activeRides/{rideId}
   ↓
3. Commit transaction
```

### **Paso 5: Notificar a la Otra Parte**
```
1. Determinar recipiente:
   - Si canceló cliente → notificar conductor
   - Si canceló conductor → notificar cliente
   ↓
2. Crear notificación en Firestore:
   - type: 'ride_canceled'
   - title: 'Viaje Cancelado'
   - message: "X ha cancelado el viaje. Razón: Y"
   - canceledBy: 'client' o 'driver'
   - reason: razón proporcionada
   - progressPercentage: "X%"
   ↓
3. Enviar push notification (TODO)
```

---

## 💾 **Estructura de Datos:**

### **PostgreSQL - rides table:**
```sql
CREATE TABLE rides (
  id UUID PRIMARY KEY,
  client_id VARCHAR(255) NOT NULL,
  driver_id VARCHAR(255),
  status VARCHAR(50) NOT NULL,
  
  -- Campos de cancelación
  canceled_at TIMESTAMP,
  cancel_reason TEXT,
  canceled_by VARCHAR(10) CHECK (canceled_by IN ('client', 'driver')),
  
  -- Otros campos...
  estimated_distance INTEGER NOT NULL,
  destination_lat DECIMAL(10, 8) NOT NULL,
  destination_lng DECIMAL(11, 8) NOT NULL,
  started_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW()
);

-- Índice para consultas de cancelaciones
CREATE INDEX idx_rides_canceled_by ON rides(canceled_by) WHERE canceled_by IS NOT NULL;
```

### **Firebase Firestore - notifications:**
```typescript
{
  type: 'ride_canceled',
  title: 'Viaje Cancelado',
  message: 'El conductor ha cancelado el viaje. Razón: Emergencia personal',
  rideId: 'abc123',
  canceledBy: 'driver',
  reason: 'Emergencia personal',
  progressPercentage: '25.50',
  createdAt: Timestamp,
  read: false
}
```

---

## 🎨 **Componente CancelRideDialog:**

### **Props:**
```typescript
interface CancelRideDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  requiresReason: boolean;
  progressPercentage?: number;
  colors: any;
}
```

### **Características:**
- ✅ Modal con overlay oscuro
- ✅ Muestra progreso del viaje
- ✅ Input de texto para razón (si es requerida)
- ✅ Contador de caracteres (max 200)
- ✅ Razones sugeridas (botones rápidos):
  - Emergencia personal
  - Problema con el vehículo
  - Cambio de planes
  - Ruta incorrecta
  - Demora excesiva
- ✅ Validación de longitud mínima (10 caracteres)
- ✅ Loading state durante cancelación
- ✅ Botones: "No cancelar" y "Sí, cancelar"

---

## 🔧 **Implementación Backend:**

### **Archivo:** `functions/src/api/rides.ts`

**Función:** `cancelRide`

**Validaciones:**
```typescript
// 1. Usuario autenticado
if (!context.auth) {
  throw new functions.https.HttpsError("unauthenticated", "Usuario no autenticado");
}

// 2. Viaje existe y usuario tiene permiso
if (rideResult.rows.length === 0) {
  throw new functions.https.HttpsError("not-found", "Viaje no encontrado");
}

// 3. Viaje no está completado
if (ride.status === RideStatus.COMPLETED) {
  throw new functions.https.HttpsError("failed-precondition", "No se puede cancelar un viaje completado");
}

// 4. Viaje no está ya cancelado
if (ride.status === RideStatus.CANCELED) {
  throw new functions.https.HttpsError("failed-precondition", "El viaje ya está cancelado");
}

// 5. Justificación si progreso >= 20%
if (progressPercentage >= 20 && (!reason || reason.trim().length < 10)) {
  throw new functions.https.HttpsError(
    "invalid-argument",
    `El viaje lleva ${progressPercentage.toFixed(0)}% de progreso. Debes proporcionar una razón de cancelación de al menos 10 caracteres.`
  );
}
```

**Cálculo de Progreso:**
```typescript
// Obtener ubicación actual del conductor
const driverLocationSnapshot = await admin.database()
  .ref(`driverLocations/${ride.driver_id}`)
  .once('value');

const driverLocation = driverLocationSnapshot.val();

if (driverLocation && driverLocation.lat && driverLocation.lng) {
  // Calcular distancia restante
  const remainingDistance = calculateDistance(
    driverLocation.lat,
    driverLocation.lng,
    ride.destination_lat,
    ride.destination_lng
  );
  
  // Calcular progreso
  const totalDistance = ride.estimated_distance;
  const traveledDistance = totalDistance - remainingDistance;
  progressPercentage = (traveledDistance / totalDistance) * 100;
}
```

**Respuesta:**
```typescript
return {
  success: true,
  ride: updatedRide,
  canceledBy: 'client' | 'driver',
  progressPercentage: "25.50",
  message: "Viaje cancelado. Se registró la razón debido al 25% de progreso."
};
```

---

## 🎯 **Uso en Frontend:**

### **Ejemplo en ActiveRideScreen:**

```typescript
import CancelRideDialog from '../../components/CancelRideDialog';
import ridesService from '../../services/ridesService';

const [showCancelDialog, setShowCancelDialog] = useState(false);
const [requiresCancelReason, setRequiresCancelReason] = useState(false);
const [rideProgress, setRideProgress] = useState(0);

const handleCancelRide = async (reason: string) => {
  try {
    const result = await ridesService.cancelRide(rideId, reason);
    
    Alert.alert(
      'Viaje Cancelado',
      result.message,
      [
        {
          text: 'OK',
          onPress: () => navigation.goBack(),
        },
      ]
    );
  } catch (error: any) {
    // Manejar error
    if (error.code === 'invalid-argument') {
      // Requiere razón
      setRequiresCancelReason(true);
      setShowCancelDialog(true);
    } else {
      Alert.alert('Error', error.message);
    }
  }
};

// Botón cancelar
<TouchableOpacity onPress={() => setShowCancelDialog(true)}>
  <Text>Cancelar Viaje</Text>
</TouchableOpacity>

// Diálogo
<CancelRideDialog
  visible={showCancelDialog}
  onClose={() => setShowCancelDialog(false)}
  onConfirm={handleCancelRide}
  requiresReason={requiresCancelReason}
  progressPercentage={rideProgress}
  colors={colors}
/>
```

---

## 📊 **Casos de Uso:**

### **Caso 1: Cliente cancela viaje recién solicitado (0% progreso)**
```
1. Cliente solicita viaje
2. Conductor acepta
3. Cliente cambia de opinión (antes de que conductor llegue)
4. Cliente presiona "Cancelar"
5. Sistema muestra confirmación simple
6. Cliente confirma
7. ✅ Viaje cancelado sin razón requerida
8. Conductor recibe notificación
```

### **Caso 2: Conductor cancela viaje en progreso (15% progreso)**
```
1. Conductor inicia viaje
2. Ha recorrido 15% del trayecto
3. Conductor presiona "Cancelar"
4. Sistema muestra confirmación simple
5. Conductor confirma
6. ✅ Viaje cancelado sin razón requerida
7. Cliente recibe notificación
```

### **Caso 3: Cliente cancela viaje avanzado (30% progreso)**
```
1. Conductor ha recorrido 30% del trayecto
2. Cliente presiona "Cancelar"
3. Sistema detecta progreso >= 20%
4. Muestra diálogo con input de razón
5. Cliente intenta cancelar sin razón
6. ❌ Error: "Debes proporcionar una razón de al menos 10 caracteres"
7. Cliente escribe: "Emergencia familiar"
8. ✅ Viaje cancelado con razón registrada
9. Conductor recibe notificación con razón
```

### **Caso 4: Conductor cancela viaje casi completo (85% progreso)**
```
1. Conductor ha recorrido 85% del trayecto
2. Conductor presiona "Cancelar"
3. Sistema detecta progreso >= 20%
4. Muestra diálogo con input de razón
5. Conductor selecciona razón sugerida: "Problema con el vehículo"
6. ✅ Viaje cancelado con razón registrada
7. Cliente recibe notificación con razón
8. Sistema puede aplicar penalización al conductor (TODO)
```

---

## 🔒 **Seguridad:**

### **Validaciones Backend:**
- ✅ Usuario autenticado (Firebase Auth)
- ✅ Usuario es participante del viaje (client_id o driver_id)
- ✅ Viaje en estado cancelable
- ✅ Razón obligatoria si progreso >= 20%
- ✅ Transacción atómica en PostgreSQL

### **Validaciones Frontend:**
- ✅ Razón mínima 10 caracteres
- ✅ Razón máxima 200 caracteres
- ✅ Confirmación antes de cancelar
- ✅ Loading state durante proceso

---

## 📝 **Archivos Creados/Modificados:**

### **Backend:**
1. ✅ `functions/src/api/rides.ts` - Función `cancelRide` actualizada
2. ✅ `database/migrations/003_add_canceled_by.sql` - Nueva migración

### **Frontend:**
3. ✅ `Frontend/src/components/CancelRideDialog.tsx` - Nuevo componente
4. ✅ `Frontend/src/services/ridesService.ts` - Actualizado tipo de retorno

---

## 🚀 **Deployment:**

### **1. Ejecutar Migración SQL:**
```bash
# En Supabase SQL Editor
psql -h db.ceytngpresytjhafcadu.supabase.co -U postgres -d postgres -f database/migrations/003_add_canceled_by.sql
```

### **2. Compilar y Desplegar Functions:**
```bash
cd functions
npm run build
firebase deploy --only functions:cancelRide
```

### **3. Reiniciar Frontend:**
```bash
cd Frontend
npm start -- --clear
```

---

## 🧪 **Testing:**

### **Test 1: Cancelar viaje sin progreso**
- [ ] Solicitar viaje
- [ ] Cancelar inmediatamente
- [ ] Verificar: No requiere razón
- [ ] Verificar: canceled_by = 'client'

### **Test 2: Cancelar viaje con 15% progreso**
- [ ] Iniciar viaje
- [ ] Recorrer 15% del trayecto
- [ ] Cancelar
- [ ] Verificar: No requiere razón

### **Test 3: Cancelar viaje con 25% progreso**
- [ ] Iniciar viaje
- [ ] Recorrer 25% del trayecto
- [ ] Intentar cancelar sin razón
- [ ] Verificar: Error "Debes proporcionar una razón"
- [ ] Proporcionar razón válida
- [ ] Verificar: Cancelación exitosa

### **Test 4: Notificación a la otra parte**
- [ ] Conductor cancela viaje
- [ ] Verificar: Cliente recibe notificación
- [ ] Verificar: Notificación incluye razón
- [ ] Verificar: Notificación incluye progreso

---

## ✅ **Conclusión:**

**Sistema implementado con:**
- ✅ Validación de progreso (20% threshold)
- ✅ Razón obligatoria si progreso >= 20%
- ✅ Campo `canceled_by` para identificar quién canceló
- ✅ Notificaciones a la otra parte
- ✅ Componente UI con razones sugeridas
- ✅ Actualización de Realtime DB
- ✅ Transacciones atómicas

**Próximos pasos:**
- ⏳ Implementar penalizaciones por cancelaciones frecuentes
- ⏳ Implementar reembolsos automáticos según progreso
- ⏳ Analytics de razones de cancelación

---

**Última actualización:** 10 de Octubre 2025, 23:10  
**Estado:** ✅ IMPLEMENTADO - LISTO PARA DEPLOYMENT
