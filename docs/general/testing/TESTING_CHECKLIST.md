# ✅ Checklist de Testing - Flujo de Pago Actualizado

**Fecha:** 2025-10-13  
**Estado:** 🧪 **LISTO PARA PROBAR**

---

## 🎯 Cambios Implementados Hoy

### **Backend:**
1. ✅ `confirmDriver()` - Inicia pago según método seleccionado (tarjeta/efectivo)
2. ✅ `completeRide()` - Actualiza paymentStatus a 'pending_capture'
3. ✅ `cancelRide()` - Actualiza paymentStatus con datos de cancelación
4. ✅ Todas las funciones de payments.ts actualizadas con Realtime DB

### **Frontend:**
1. ✅ `PaymentScreen` - Solo captura pago (no crea)
2. ✅ `ActiveRideScreen` - Escucha paymentStatus y navega según método
3. ✅ `EarningsScreen` - Removido getCommissionBreakdown

---

## 🧪 Flujo de Testing

### **Test 1: Viaje con Tarjeta** 💳

**Pasos:**
1. **Cliente:** Abre SearchRideScreen
2. **Cliente:** Selecciona origen y destino
3. **Cliente:** Selecciona método: 💳 **Tarjeta**
4. **Cliente:** Presiona "Buscar Conductor"
   - ✅ Verificar: Viaje creado en Firebase
   
5. **Conductor:** Ve el viaje en AvailableRidesScreen
6. **Conductor:** Acepta el viaje
   - ✅ Verificar: Estado cambia a 'accepted'
   
7. **Cliente:** Ve RideConfirmationScreen
8. **Cliente:** Presiona "Confirmar Viaje"
   - ✅ Verificar: `confirmDriver()` se ejecuta
   - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/status = 'authorized'`
   - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/method = 'stripe'`
   
9. **Conductor:** Presiona "Iniciar Viaje"
   - ✅ Verificar: Estado cambia a 'in_progress'
   
10. **Conductor:** Presiona "Completar Viaje"
    - ✅ Verificar: Estado cambia a 'completed'
    - ✅ Verificar: Conductor navega a WaitingPaymentScreen
    - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/status = 'pending_capture'`
    
11. **Cliente:** Ve PaymentScreen automáticamente
12. **Cliente:** Agrega propina (opcional)
13. **Cliente:** Presiona "Pagar con Tarjeta"
    - ✅ Verificar: `capturePayment()` se ejecuta
    - ✅ Verificar: Alert "¡Pago Completado!"
    - ✅ Verificar: Navega a RatingScreen
    - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/status = 'completed'`
    
14. **Conductor:** Ve notificación "¡Pago Recibido!"
15. **Conductor:** Navega a AvailableRidesScreen

---

### **Test 2: Viaje con Efectivo** 💵

**Pasos:**
1. **Cliente:** Abre SearchRideScreen
2. **Cliente:** Selecciona origen y destino
3. **Cliente:** Selecciona método: 💵 **Efectivo**
4. **Cliente:** Presiona "Buscar Conductor"
   
5. **Conductor:** Acepta el viaje
   
6. **Cliente:** Presiona "Confirmar Viaje"
   - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/status = 'pending_confirmation'`
   - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/method = 'cash'`
   
7. **Conductor:** Inicia viaje
   
8. **Conductor:** Presiona "Completar Viaje"
   - ✅ Verificar: Conductor navega a ConfirmCashPaymentScreen
   
9. **Cliente:** Ve PaymentScreen
10. **Cliente:** Agrega propina (opcional)
11. **Cliente:** Presiona "Confirmar Pago en Efectivo"
    - ✅ Verificar: Alert "Pago en Efectivo"
    - ✅ Verificar: Cliente navega a Home
    
12. **Conductor:** Ve ConfirmCashPaymentScreen
13. **Conductor:** Presiona "Recibí el Pago"
    - ✅ Verificar: `completeCashPayment()` se ejecuta
    - ✅ Verificar: Alert "¡Pago Confirmado!"
    - ✅ Verificar: Conductor navega a AvailableRidesScreen
    - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/status = 'completed'`

---

### **Test 3: Cancelación con Cobro Parcial** ⚠️

**Pasos:**
1. **Cliente:** Solicita viaje con tarjeta
2. **Conductor:** Acepta
3. **Cliente:** Confirma conductor (pago pre-autorizado)
4. **Conductor:** Inicia viaje
5. **Conductor:** Avanza hasta 70% del trayecto
6. **Cliente:** Presiona "Cancelar Viaje"
   - ✅ Verificar: Alert pide razón de cancelación
   - ✅ Verificar: Se cobra 70% del total
   - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/status = 'partial_charged'`
   - ✅ Verificar en Firebase Console: `paymentStatus/{rideId}/chargedAmount = X`

---

## 🔍 Verificaciones en Firebase Console

### **Realtime Database:**
```
https://console.firebase.google.com/project/driveangel-ni/database/driveangel-ni-default-rtdb/data
```

**Verificar:**
- `paymentStatus/{rideId}/status`
- `paymentStatus/{rideId}/method`
- `paymentStatus/{rideId}/amount`
- `paymentStatus/{rideId}/tip`
- `paymentStatus/{rideId}/total`

### **PostgreSQL (Supabase):**
```sql
-- Ver pago
SELECT * FROM payments WHERE ride_id = '{rideId}';

-- Ver viaje completo
SELECT 
  r.id,
  r.status,
  r.payment_type,
  r.final_fare,
  p.payment_method,
  p.status as payment_status,
  p.amount,
  p.tip,
  p.commission
FROM rides r
LEFT JOIN payments p ON r.id = p.ride_id
WHERE r.id = '{rideId}';
```

---

## 🐛 Problemas Comunes

### **1. "Error obteniendo ganancias"**
- ✅ **Solucionado:** Deshabilitado `getCommissionBreakdown()`

### **2. PaymentScreen no aparece**
- Verificar que `completeRide()` actualice `paymentStatus`
- Verificar que `RideTrackingScreen` detecte status = 'completed'

### **3. Conductor no navega después de completar**
- Verificar que `ActiveRideScreen` escuche `paymentStatus`
- Verificar timeout de 10 segundos

### **4. Pago no se captura**
- Verificar que `capturePayment()` reciba el rideId correcto
- Verificar logs en Firebase Functions

---

## 📱 Comandos Útiles

### **Ver logs de Functions:**
```bash
firebase functions:log --only confirmDriver,completeRide,capturePayment
```

### **Limpiar caché del Frontend:**
```bash
cd Frontend
npm start -- --reset-cache
```

### **Redesplegar Functions:**
```bash
cd functions
npm run build
firebase deploy --only functions
```

---

## ✅ Checklist Final

- [ ] Test 1: Viaje con tarjeta completo
- [ ] Test 2: Viaje con efectivo completo
- [ ] Test 3: Cancelación con cobro parcial
- [ ] Verificar paymentStatus en Firebase
- [ ] Verificar payments en PostgreSQL
- [ ] Verificar navegación en ambos roles
- [ ] Verificar notificaciones

---

**¡Buena suerte con el testing!** 🚀

**Tip:** Abre Firebase Console en una pestaña para ver los cambios en tiempo real.
