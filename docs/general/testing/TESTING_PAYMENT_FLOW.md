# 🧪 Testing - Flujo de Pago Completo con Realtime DB

**Fecha:** 2025-10-13  
**Estado:** ✅ **LISTO PARA TESTING**

---

## ✅ Cambios Implementados

### **Backend (functions/src/api/):**
- ✅ `rides.ts` - completeRide() inicializa paymentStatus
- ✅ `payments.ts` - createPaymentIntent() actualiza Realtime DB
- ✅ `payments.ts` - capturePayment() actualiza Realtime DB
- ✅ `payments.ts` - registerCashPayment() actualiza Realtime DB
- ✅ `payments.ts` - completeCashPayment() actualiza Realtime DB
- ✅ `payments.ts` - cancelCashPayment() actualiza Realtime DB

### **Proceso de Negociación:**
- ✅ `acceptRide()` establece `final_fare` correctamente:
  - Con negociación: `final_fare = offeredPrice`
  - Sin negociación: `final_fare = estimated_price`

---

## 🧪 Plan de Testing

### **Test 1: Viaje Normal con Tarjeta (Sin Negociación)**

**Pasos:**
1. Cliente solicita viaje
2. Conductor acepta SIN negociar (usa precio estimado)
3. Conductor inicia viaje
4. Conductor completa viaje
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'initiated'`
   - ✅ Verificar: `paymentStatus/{rideId}/amount = final_fare`
5. Cliente ve PaymentScreen
6. Cliente selecciona tarjeta y agrega propina
7. Cliente confirma pago
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'processing'`
   - ✅ Verificar: `paymentStatus/{rideId}/method = 'card'`
   - ✅ Verificar: `paymentStatus/{rideId}/tip = X`
8. Cliente autoriza en Payment Sheet
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'authorized'`
9. Backend captura pago automáticamente
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'completed'`
   - ✅ Verificar: `payments` table status = 'completed'
10. Conductor ve notificación "¡Pago Recibido!"
11. Conductor navega a AvailableRides

**Comisión Esperada:** 10% (viaje normal)

---

### **Test 2: Viaje Designado con Tarjeta (Con Negociación)**

**Pasos:**
1. Cliente solicita viaje designado con precio sugerido
2. Conductor contraoferta con precio diferente
3. Cliente acepta contraoferta
   - ✅ Verificar: `final_fare = offeredPrice`
4. Conductor inicia viaje
5. Conductor completa viaje
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'initiated'`
   - ✅ Verificar: `paymentStatus/{rideId}/amount = offeredPrice`
6. Cliente ve PaymentScreen
7. Cliente selecciona tarjeta
8. Cliente confirma pago
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'processing'`
9. Cliente autoriza
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'authorized'`
10. Backend captura pago
    - ✅ Verificar: `paymentStatus/{rideId}/status = 'completed'`
    - ✅ Verificar: Comisión = 15% (viaje designado)
11. Conductor recibe notificación

**Comisión Esperada:** 15% (viaje designado)

---

### **Test 3: Viaje Normal con Efectivo (Sin Negociación)**

**Pasos:**
1. Cliente solicita viaje
2. Conductor acepta
3. Conductor inicia viaje
4. Conductor completa viaje
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'initiated'`
5. Cliente ve PaymentScreen
6. Cliente selecciona EFECTIVO
7. Cliente confirma
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'pending_confirmation'`
   - ✅ Verificar: `paymentStatus/{rideId}/method = 'cash'`
8. Conductor ve ConfirmCashPaymentScreen
9. Conductor confirma "Recibí el Pago"
   - ✅ Verificar: `paymentStatus/{rideId}/status = 'completed'`
   - ✅ Verificar: `paymentStatus/{rideId}/confirmedBy = 'driver'`
   - ✅ Verificar: `payments` table status = 'completed'
10. Conductor navega a AvailableRides

**Comisión Esperada:** 10% (viaje normal)

---

### **Test 4: Viaje con Efectivo - Conductor Reporta Problema**

**Pasos:**
1-7. Igual que Test 3
8. Conductor ve ConfirmCashPaymentScreen
9. Conductor presiona "Reportar Problema"
10. Conductor selecciona razón: "Cliente no pagó"
11. Conductor confirma
    - ✅ Verificar: `paymentStatus/{rideId}/status = 'canceled'`
    - ✅ Verificar: `paymentStatus/{rideId}/cancelReason = 'Cliente no pagó'`
    - ✅ Verificar: `paymentStatus/{rideId}/canceledBy = 'driver'`
    - ✅ Verificar: `payments` table status = 'canceled'
12. Conductor navega a AvailableRides
13. Sistema registra incidente para revisión

---

### **Test 5: Pago con Tarjeta Falla**

**Pasos:**
1-6. Igual que Test 1
7. Cliente confirma pago
8. Cliente cancela en Payment Sheet
   - ✅ Verificar: Alerta "Pago cancelado por el usuario"
   - ✅ Verificar: Cliente permanece en PaymentScreen
9. Cliente puede reintentar

---

## 📊 Verificaciones en Firebase Realtime DB

### **Estructura a Verificar:**
```javascript
paymentStatus/{rideId}: {
  rideId: string,
  status: string, // initiated, processing, authorized, pending_confirmation, completed, canceled
  method: string, // card, cash
  provider: string, // stripe, cash
  amount: number,
  tip: number,
  total: number,
  
  // Timestamps
  createdAt: timestamp,
  authorizedAt?: timestamp,
  completedAt?: timestamp,
  canceledAt?: timestamp,
  
  // Metadata
  paymentIntentId?: string,
  confirmedBy?: string,
  cancelReason?: string,
  canceledBy?: string,
  
  // Debugging
  lastUpdatedBy: string, // client, driver, backend
  lastUpdatedAt: timestamp
}
```

---

## 🔍 Comandos de Verificación

### **1. Ver paymentStatus en Realtime DB:**
```bash
# Firebase Console
https://console.firebase.google.com/project/driveangel-ni/database/driveangel-ni-default-rtdb/data/paymentStatus

# O con Firebase CLI
firebase database:get /paymentStatus/{rideId}
```

### **2. Ver payments en PostgreSQL:**
```sql
-- Ver pago específico
SELECT * FROM payments WHERE ride_id = '{rideId}';

-- Ver comisión calculada
SELECT 
  ride_id,
  amount,
  tip,
  commission,
  payment_method,
  status,
  created_at,
  paid_at
FROM payments 
WHERE ride_id = '{rideId}';
```

### **3. Ver ride completo:**
```sql
SELECT 
  r.id,
  r.status,
  r.estimated_price,
  r.final_fare,
  r.ride_type,
  r.driver_offered_price,
  p.amount as payment_amount,
  p.commission,
  p.payment_method,
  p.status as payment_status
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.id = '{rideId}';
```

---

## 📱 Testing en Frontend

### **Pantallas a Verificar:**

#### **Cliente:**
1. **RideTrackingScreen**
   - Detecta cuando ride.status = 'completed'
   - Navega automáticamente a PaymentScreen

2. **PaymentScreen**
   - Muestra monto correcto (final_fare)
   - Permite agregar propina
   - Actualiza Realtime DB correctamente
   - Navega según método seleccionado

#### **Conductor:**
1. **ActiveRideScreen**
   - Al completar viaje, escucha paymentStatus
   - Navega a WaitingPayment (tarjeta) o ConfirmCashPayment (efectivo)

2. **WaitingPaymentScreen**
   - Muestra monto total
   - Detecta cuando status = 'completed'
   - Muestra notificación
   - Navega a AvailableRides

3. **ConfirmCashPaymentScreen**
   - Muestra desglose del pago
   - Permite confirmar o reportar problema
   - Actualiza Realtime DB
   - Navega a AvailableRides

---

## 🐛 Debugging

### **Si el pago no se procesa:**

1. **Verificar Realtime DB:**
   ```
   paymentStatus/{rideId} existe?
   status es correcto?
   lastUpdatedBy muestra quién actualizó?
   ```

2. **Verificar PostgreSQL:**
   ```sql
   SELECT * FROM payments WHERE ride_id = '{rideId}';
   -- Debe existir un registro
   ```

3. **Verificar Logs de Firebase:**
   ```bash
   firebase functions:log --only createPaymentIntent,capturePayment
   ```

4. **Verificar Frontend:**
   - Console.log en listeners de Realtime DB
   - Verificar que navigation.replace() se ejecute

---

## ✅ Checklist de Testing

### **Antes de Desplegar:**
- [ ] Test 1: Viaje normal con tarjeta (sin negociación)
- [ ] Test 2: Viaje designado con tarjeta (con negociación)
- [ ] Test 3: Viaje normal con efectivo
- [ ] Test 4: Efectivo con problema reportado
- [ ] Test 5: Pago con tarjeta falla
- [ ] Verificar comisiones: 10% normal, 15% designado
- [ ] Verificar Realtime DB se actualiza en cada paso
- [ ] Verificar PostgreSQL guarda historial correcto
- [ ] Verificar navegación funciona en ambos roles
- [ ] Verificar notificaciones se muestran

### **Después de Desplegar:**
- [ ] Probar en dispositivos reales
- [ ] Verificar con Stripe en modo test
- [ ] Verificar tiempos de respuesta
- [ ] Verificar sincronización Realtime DB
- [ ] Monitorear logs de errores

---

## 🚀 Comandos para Desplegar

```bash
# 1. Compilar functions
cd functions
npm run build

# 2. Desplegar solo las funciones actualizadas
firebase deploy --only functions:completeRide,functions:createPaymentIntent,functions:capturePayment,functions:registerCashPayment,functions:completeCashPayment,functions:cancelCashPayment

# 3. O desplegar todas las functions
firebase deploy --only functions

# 4. Verificar deployment
firebase functions:log --only completeRide
```

---

## 📋 Notas Importantes

1. **Realtime DB es la fuente de verdad** para el status del pago
2. **PostgreSQL guarda el historial** permanente
3. **Comisiones se calculan automáticamente** según ride_type
4. **final_fare se establece en acceptRide()** (con o sin negociación)
5. **paymentStatus se limpia** después de X días (opcional)

---

**Estado: LISTO PARA TESTING COMPLETO** ✅
