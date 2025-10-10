# 🔥 Firebase Functions + Backend Híbrido - DriveAngel.ni

## 🎯 Arquitectura Híbrida

```
┌─────────────────────────────────────────────────┐
│              FRONTEND (React Native)             │
└───────────┬─────────────────────────────────────┘
            │
    ┌───────┴────────┐
    │                │
    ▼                ▼
┌──────────────┐  ┌──────────────┐
│   FIREBASE   │  │   BACKEND    │
│  FUNCTIONS   │  │   (NestJS)   │
│              │  │              │
│ • Auth       │  │ • Drivers    │
│ • Triggers   │  │ • Rides      │
│ • Webhooks   │  │ • Payments   │
│ • Notif      │  │ • Analytics  │
└──────┬───────┘  └──────┬───────┘
       │                 │
       ▼                 ▼
┌──────────────┐  ┌──────────────┐
│   FIREBASE   │  │  POSTGRESQL  │
│   FIRESTORE  │  │              │
│              │  │ • Drivers    │
│ • Users      │  │ • Rides      │
│ • Active     │  │ • Payments   │
│ • Chat       │  │ • Ratings    │
└──────────────┘  └──────────────┘
```

---

## 📋 ¿Qué va en Firebase Functions?

### **1. Triggers Automáticos**
```javascript
// Cuando se crea un usuario, crear perfil en Firestore
exports.onUserCreated = functions.auth.user().onCreate(async (user) => {
  await admin.firestore().collection('users').doc(user.uid).set({
    email: user.email,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
});

// Cuando se completa un viaje, enviar notificación
exports.onRideCompleted = functions.firestore
  .document('activeRides/{rideId}')
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    if (newData.status === 'completed') {
      // Enviar notificación al cliente
      await sendNotification(newData.clientId, 'Viaje completado');
    }
  });
```

### **2. Webhooks de Stripe**
```javascript
// Procesar webhook de Stripe
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
  
  if (event.type === 'payment_intent.succeeded') {
    // Actualizar pago en Firestore
    await admin.firestore()
      .collection('payments')
      .doc(event.data.object.id)
      .update({ status: 'completed' });
  }
  
  res.json({ received: true });
});
```

### **3. Notificaciones Push**
```javascript
// Enviar notificación a conductor
exports.notifyDriver = functions.https.onCall(async (data, context) => {
  const { driverId, title, body } = data;
  
  // Obtener token FCM del conductor
  const driverDoc = await admin.firestore()
    .collection('users')
    .doc(driverId)
    .get();
  
  const fcmToken = driverDoc.data().fcmToken;
  
  // Enviar notificación
  await admin.messaging().send({
    token: fcmToken,
    notification: { title, body }
  });
  
  return { success: true };
});
```

### **4. API Endpoints Ligeros**
```javascript
// Obtener conductores disponibles
exports.getAvailableDrivers = functions.https.onCall(async (data, context) => {
  const { lat, lng, radius } = data;
  
  // Consultar Firestore
  const drivers = await admin.firestore()
    .collection('users')
    .where('role', '==', 'driver')
    .where('status', '==', 'available')
    .get();
  
  return drivers.docs.map(doc => doc.data());
});
```

---

## 📋 ¿Qué va en tu Backend NestJS?

### **1. Lógica Compleja**
```typescript
// Calcular precio de viaje
async calculateFare(origin, destination) {
  const distance = await this.mapsService.getDistance(origin, destination);
  const duration = await this.mapsService.getDuration(origin, destination);
  
  // Lógica compleja de precios
  let fare = this.baseFare + (distance * this.perKmRate);
  
  // Surge pricing
  if (this.isRushHour()) {
    fare *= 1.5;
  }
  
  // Descuentos
  if (user.isPremium) {
    fare *= 0.9;
  }
  
  return fare;
}
```

### **2. PostgreSQL**
```typescript
// Guardar viaje completo en PostgreSQL
async saveRide(rideData) {
  const ride = await this.rideRepository.save({
    ...rideData,
    createdAt: new Date()
  });
  
  // Guardar historial de ubicaciones
  await this.saveRideLocations(ride.id, locations);
  
  return ride;
}
```

### **3. Analytics**
```typescript
// Generar reporte de viajes
async getMonthlyReport(month, year) {
  return await this.rideRepository
    .createQueryBuilder('ride')
    .select('COUNT(*)', 'totalRides')
    .addSelect('SUM(finalFare)', 'totalRevenue')
    .where('MONTH(createdAt) = :month', { month })
    .andWhere('YEAR(createdAt) = :year', { year })
    .getRawOne();
}
```

---

## 🔧 Instalación de Firebase Functions

### **Paso 1: Instalar Firebase CLI**
```bash
npm install -g firebase-tools
```

### **Paso 2: Login en Firebase**
```bash
firebase login
```

### **Paso 3: Inicializar Functions**
```bash
cd App-Uber
firebase init functions
```

Seleccionar:
- ✅ Use an existing project: `driveangel-ni`
- ✅ Language: TypeScript
- ✅ ESLint: Yes
- ✅ Install dependencies: Yes

Esto creará:
```
functions/
├── src/
│   └── index.ts
├── package.json
└── tsconfig.json
```

---

## 📝 Estructura de Firebase Functions

```
functions/
├── src/
│   ├── index.ts              # Punto de entrada
│   ├── triggers/
│   │   ├── auth.ts           # Triggers de autenticación
│   │   ├── rides.ts          # Triggers de viajes
│   │   └── payments.ts       # Triggers de pagos
│   ├── api/
│   │   ├── drivers.ts        # API de conductores
│   │   └── notifications.ts  # API de notificaciones
│   └── webhooks/
│       └── stripe.ts         # Webhook de Stripe
├── package.json
└── tsconfig.json
```

---

## 💰 Costos

### **Firebase Functions (Plan Blaze - Pay as you go):**

| Recurso | Límite Gratuito | Costo Adicional |
|---------|-----------------|-----------------|
| **Invocaciones** | 2M/mes | $0.40 por millón |
| **CPU** | 400K GB-seg/mes | $0.0000025 por GB-seg |
| **Red** | 5 GB/mes | $0.12 por GB |
| **Build Time** | 120 min/día | Gratis |

**Ejemplo de costos:**
- 100,000 invocaciones/mes = **Gratis**
- 500,000 invocaciones/mes = **$0.12**
- 1,000,000 invocaciones/mes = **$0.40**

**Muy económico para empezar** ✅

---

## 🎯 Flujo de Trabajo Híbrido

### **Ejemplo: Solicitar Viaje**

```
1. Cliente solicita viaje (App)
   ↓
2. App llama a Backend NestJS
   ↓
3. Backend calcula precio (lógica compleja)
   ↓
4. Backend guarda viaje en PostgreSQL
   ↓
5. Backend publica viaje en Firebase Realtime
   ↓
6. Firebase Function trigger detecta nuevo viaje
   ↓
7. Function busca conductores cercanos en Firestore
   ↓
8. Function envía notificaciones push a conductores
   ↓
9. Conductor acepta (App)
   ↓
10. App actualiza Firebase Realtime
   ↓
11. Firebase Function trigger detecta aceptación
   ↓
12. Function notifica al cliente
   ↓
13. Backend actualiza PostgreSQL
```

---

## 🚀 Ventajas de esta Arquitectura

### **Firebase Functions:**
- ✅ Serverless (no mantienes servidor)
- ✅ Escala automáticamente
- ✅ Triggers automáticos
- ✅ Integración perfecta con Firebase
- ✅ Muy económico

### **Backend NestJS:**
- ✅ Control total
- ✅ Lógica compleja
- ✅ PostgreSQL para datos históricos
- ✅ Puedes hacer lo que quieras
- ✅ No dependes 100% de Firebase

### **Combinados:**
- ✅ Lo mejor de ambos mundos
- ✅ Costos optimizados
- ✅ Escalabilidad
- ✅ Flexibilidad

---

## 📊 Comparación

| Aspecto | Solo NestJS | Solo Firebase | **Híbrido** |
|---------|-------------|---------------|-------------|
| **Tiempo real** | Complejo | Fácil | **Fácil** ✅ |
| **Lógica compleja** | Fácil | Limitado | **Fácil** ✅ |
| **Escalabilidad** | Manual | Automática | **Automática** ✅ |
| **Costos** | Fijo | Variable | **Optimizado** ✅ |
| **Control** | Total | Limitado | **Total** ✅ |
| **Triggers** | Manual | Automático | **Automático** ✅ |

---

## ✅ Recomendación Final

**Para DriveAngel.ni, te recomiendo:**

1. ✅ **Firebase Functions** para:
   - Triggers automáticos
   - Notificaciones push
   - Webhooks de Stripe
   - API ligera

2. ✅ **Backend NestJS** para:
   - Lógica de negocio compleja
   - PostgreSQL (datos históricos)
   - Analytics y reportes
   - Control total

3. ✅ **Firebase Firestore/Realtime** para:
   - Usuarios (perfil básico)
   - Tracking en tiempo real
   - Chat
   - Viajes activos

4. ✅ **PostgreSQL** para:
   - Conductores (documentos)
   - Viajes (historial completo)
   - Pagos (Stripe)
   - Ratings

---

## 🎯 Próximos Pasos

1. **Crear proyecto en Firebase Console**
2. **Habilitar plan Blaze** (pay-as-you-go)
3. **Instalar Firebase CLI**
4. **Inicializar Functions**
5. **Crear primeras functions**
6. **Integrar con Backend NestJS**

---

**¿Quieres que implemente Firebase Functions ahora?** 🔥
