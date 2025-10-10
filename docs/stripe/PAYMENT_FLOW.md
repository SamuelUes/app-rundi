# 💳 Flujo de Pago con Pre-Autorización - DriveAngel.ni

## 🔄 Nuevo Flujo Implementado

### **Concepto: Hold & Capture**

El sistema ahora utiliza **pre-autorización** (hold) de Stripe, que:
- ✅ Verifica que el cliente tiene fondos disponibles
- ✅ Reserva el monto en la tarjeta del cliente
- ✅ NO cobra hasta que el viaje finalice
- ✅ Libera automáticamente los fondos si se cancela

---

## 📋 Flujo Completo Paso a Paso

### **1. Cliente Solicita Viaje**
```
Cliente → SearchRideScreen
  ↓
Ingresa origen y destino
  ↓
Backend calcula precio estimado
  ↓
Cliente confirma solicitud
  ↓
Estado: REQUESTED
```

### **2. Conductor Acepta Viaje**
```
Conductor ve viaje en AvailableRidesScreen
  ↓
Conductor acepta con precio propuesto
  ↓
Backend actualiza estado: ACCEPTED
  ↓
Cliente recibe notificación
```

### **3. Cliente Autoriza Pago (PRE-AUTORIZACIÓN)**
```
Cliente → Navega automáticamente a PaymentScreen
  ↓
Selecciona propina (opcional): 10%, 15%, 20% o personalizado
  ↓
Presiona "Pagar con Tarjeta"
  ↓
Backend crea Payment Intent con capture_method: 'manual'
  ↓
Frontend muestra Stripe Payment Sheet
  ↓
Cliente ingresa datos de tarjeta
  ↓
Stripe AUTORIZA el pago (NO lo cobra aún)
  ↓
Fondos quedan "en hold" en la tarjeta
  ↓
Cliente ve: "¡Pago Autorizado! El cargo se realizará al finalizar el viaje"
  ↓
Navega a RideTrackingScreen
```

**Estado del Pago:** `PENDING` (Autorizado pero no capturado)

### **4. Viaje en Progreso**
```
Conductor inicia viaje
  ↓
Estado: IN_PROGRESS
  ↓
Cliente ve tracking en tiempo real
  ↓
Chat disponible entre cliente y conductor
  ↓
Pago sigue en estado PENDING (autorizado)
```

**Importante:** Durante el viaje, el dinero NO se ha movido aún.

### **5. Conductor Completa Viaje**
```
Conductor llega al destino
  ↓
Conductor presiona "Completar Viaje"
  ↓
Backend actualiza estado: COMPLETED
  ↓
Backend CAPTURA el pago automáticamente
  ↓
Stripe cobra el monto de la tarjeta
  ↓
Estado del Pago: COMPLETED
```

**Aquí es cuando se cobra realmente el dinero.**

### **6. Confirmación y Recibo**
```
Backend genera recibo digital
  ↓
Webhook de Stripe confirma pago exitoso
  ↓
Cliente y Conductor reciben confirmación
  ↓
Cliente puede calificar el viaje
  ↓
Navega a Home
```

---

## 🔄 Casos Especiales

### **Cancelación por Cliente (Antes de Iniciar)**
```
Cliente cancela viaje
  ↓
Backend cancela Payment Intent en Stripe
  ↓
Fondos se liberan automáticamente (1-7 días)
  ↓
Estado del Pago: FAILED
  ↓
NO se cobra nada al cliente
```

### **Cancelación por Conductor**
```
Conductor cancela viaje
  ↓
Backend cancela Payment Intent en Stripe
  ↓
Fondos se liberan automáticamente
  ↓
Estado del Pago: FAILED
  ↓
NO se cobra nada al cliente
```

### **Auto-Cancelación (10 minutos)**
```
Conductor no inicia viaje en 10 minutos
  ↓
Backend auto-cancela viaje
  ↓
Backend cancela Payment Intent en Stripe
  ↓
Fondos se liberan automáticamente
  ↓
Cliente recibe notificación
```

### **Pago en Efectivo**
```
Cliente selecciona "Efectivo" en PaymentScreen
  ↓
NO se crea Payment Intent
  ↓
Viaje continúa normalmente
  ↓
Al finalizar, se registra pago en efectivo
  ↓
Cliente paga directamente al conductor
```

---

## 🔧 Implementación Técnica

### **Backend - PaymentsService**

#### **1. Crear Pre-Autorización**
```typescript
async createPaymentIntent(rideId: string, tip: number = 0) {
  // Crear Payment Intent con capture_method: 'manual'
  const paymentIntent = await this.stripe.paymentIntents.create({
    amount: totalAmount,
    currency: 'nio',
    capture_method: 'manual', // ⭐ CLAVE: No capturar automáticamente
    metadata: { rideId, clientId, driverId, fare, tip },
    description: 'Pre-autorización de viaje - DriveAngel.ni',
  });
  
  // Guardar en BD con status: PENDING
  const payment = this.paymentRepository.create({
    rideId,
    amount,
    tip,
    status: PaymentStatus.PENDING,
    stripePaymentIntentId: paymentIntent.id,
  });
  
  return { clientSecret, paymentId, amount };
}
```

#### **2. Capturar Pago al Finalizar**
```typescript
async capturePayment(rideId: string) {
  const payment = await this.paymentRepository.findOne({ where: { rideId } });
  
  // Capturar el pago en Stripe
  const paymentIntent = await this.stripe.paymentIntents.capture(
    payment.stripePaymentIntentId
  );
  
  // Actualizar estado
  payment.status = PaymentStatus.COMPLETED;
  payment.paidAt = new Date();
  await this.paymentRepository.save(payment);
  
  return { success: true, payment };
}
```

#### **3. Cancelar Autorización**
```typescript
async cancelPaymentAuthorization(rideId: string) {
  const payment = await this.paymentRepository.findOne({ where: { rideId } });
  
  // Cancelar en Stripe
  await this.stripe.paymentIntents.cancel(payment.stripePaymentIntentId);
  
  // Actualizar estado
  payment.status = PaymentStatus.FAILED;
  await this.paymentRepository.save(payment);
  
  return { success: true };
}
```

### **Backend - RidesService**

#### **Auto-Captura al Completar Viaje**
```typescript
async updateStatus(rideId: string, updateRideStatusDto: UpdateRideStatusDto) {
  const ride = await this.findOne(rideId);
  this.validateStatusTransition(ride.status, updateRideStatusDto.status);
  
  Object.assign(ride, updateRideStatusDto);
  const updatedRide = await this.rideRepository.save(ride);

  // Si el viaje se completa, capturar el pago automáticamente
  if (updateRideStatusDto.status === RideStatus.COMPLETED) {
    await this.paymentsService.capturePayment(rideId);
  }
  
  return updatedRide;
}
```

#### **Auto-Cancelación al Cancelar Viaje**
```typescript
async cancelRide(rideId: string, reason?: string) {
  const ride = await this.findOne(rideId);
  
  ride.status = RideStatus.CANCELED;
  const canceledRide = await this.rideRepository.save(ride);

  // Cancelar autorización de pago si existe
  await this.paymentsService.cancelPaymentAuthorization(rideId);

  return canceledRide;
}
```

### **Frontend - Flujo de Navegación**

#### **RideConfirmationScreen**
```typescript
// Cuando conductor acepta, navegar a PaymentScreen
if (rideData.status === 'accepted') {
  navigation.replace('Payment', {
    rideId: rideData.id,
    amount: rideData.estimatedPrice || 0,
    driverId: rideData.driverId,
    driverName: 'Conductor',
    vehiclePlate: 'N/A',
  });
}
```

#### **PaymentScreen**
```typescript
// Después de autorizar pago, navegar a RideTrackingScreen
Alert.alert(
  '¡Pago Autorizado!',
  'Tu método de pago ha sido autorizado. El cargo se realizará al finalizar el viaje.',
  [{
    text: 'Continuar',
    onPress: () => {
      navigation.replace('RideTracking', {
        rideId,
        driverId,
        driverName,
        vehiclePlate,
        estimatedFare: amount,
      });
    },
  }]
);
```

---

## ⏱️ Tiempos de Liberación de Fondos

### **Stripe - Autorización**
- **Duración del hold**: 7 días (automático)
- **Liberación manual**: Inmediata al cancelar
- **Liberación automática**: 1-7 días hábiles (depende del banco)

### **Recomendaciones**
- ✅ Cancelar manualmente si el viaje se cancela (ya implementado)
- ✅ Capturar dentro de las primeras 24 horas para mejor experiencia
- ✅ Informar al cliente sobre tiempos de liberación

---

## 📊 Estados del Pago

| Estado | Descripción | Dinero Cobrado |
|--------|-------------|----------------|
| `PENDING` | Autorizado pero no capturado | ❌ NO |
| `PROCESSING` | En proceso de captura | ❌ NO |
| `COMPLETED` | Capturado exitosamente | ✅ SÍ |
| `FAILED` | Falló o fue cancelado | ❌ NO |
| `REFUNDED` | Reembolsado | ❌ NO (devuelto) |

---

## 🔐 Seguridad

### **Ventajas de Pre-Autorización**
1. ✅ Cliente no puede cancelar tarjeta durante el viaje
2. ✅ Fondos garantizados antes de iniciar
3. ✅ Protección contra fraude
4. ✅ Mejor experiencia para el conductor
5. ✅ Cumple con mejores prácticas de la industria

### **Protección al Cliente**
1. ✅ NO se cobra hasta finalizar el viaje
2. ✅ Liberación automática si se cancela
3. ✅ Transparencia total del proceso
4. ✅ Puede ver el monto autorizado en su banco

---

## 🧪 Testing

### **Probar Pre-Autorización**

1. **Crear viaje y aceptarlo**
2. **En PaymentScreen, usar tarjeta de prueba:**
   - Número: `4242 4242 4242 4242`
   - Fecha: `12/34`
   - CVC: `123`
3. **Verificar en Stripe Dashboard:**
   - Estado: `requires_capture`
   - Monto: Autorizado pero no capturado
4. **Completar viaje**
5. **Verificar en Stripe Dashboard:**
   - Estado: `succeeded`
   - Monto: Capturado

### **Probar Cancelación**

1. **Crear viaje y aceptarlo**
2. **Autorizar pago**
3. **Cancelar viaje**
4. **Verificar en Stripe Dashboard:**
   - Estado: `canceled`
   - Monto: Liberado

---

## 📞 Soporte

### **Preguntas Frecuentes**

**P: ¿Cuándo se cobra mi tarjeta?**
R: Al finalizar el viaje, no al inicio.

**P: ¿Por qué veo un cargo pendiente?**
R: Es una autorización temporal. El cargo real se hace al finalizar.

**P: ¿Qué pasa si cancelo?**
R: Los fondos se liberan automáticamente en 1-7 días.

**P: ¿Puedo cambiar la propina después?**
R: No, la propina se fija al autorizar el pago.

---

## ✅ Ventajas del Nuevo Flujo

### **Para el Cliente:**
- ✅ Transparencia total
- ✅ NO se cobra hasta finalizar
- ✅ Protección contra cobros indebidos
- ✅ Puede cancelar sin cargos

### **Para el Conductor:**
- ✅ Pago garantizado
- ✅ NO puede cancelar tarjeta durante viaje
- ✅ Recibe pago automáticamente al finalizar
- ✅ Menos disputas

### **Para la Plataforma:**
- ✅ Menos fraude
- ✅ Mejor experiencia de usuario
- ✅ Cumple con estándares de la industria
- ✅ Menos soporte requerido

---

## 🚀 Estado de Implementación

- ✅ Backend: Pre-autorización implementada
- ✅ Backend: Captura automática al completar
- ✅ Backend: Cancelación automática al cancelar viaje
- ✅ Frontend: Flujo de navegación actualizado
- ✅ Frontend: Mensajes informativos
- ✅ Webhook: Confirmación automática
- ✅ Testing: Listo para pruebas

**Implementación: 100% Completa** 🎉

---

**Última actualización:** 2025-10-08
**Versión:** 2.0.0 (Pre-Autorización)
