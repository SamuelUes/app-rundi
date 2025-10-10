# 🔗 Configuración Stripe Webhook - DriveAngel.ni

**Fecha:** 2025-10-08  
**Estado:** ✅ CÓDIGO IMPLEMENTADO - PENDIENTE CONFIGURAR EN STRIPE

---

## 📋 RESUMEN

El webhook de Stripe está **completamente implementado** y **desplegado** en Firebase Functions. Solo falta configurarlo en el Dashboard de Stripe.

---

## 🔗 URL DEL WEBHOOK

```
https://us-central1-driveangel-ni.cloudfunctions.net/stripeWebhookHandler
```

---

## ✅ EVENTOS QUE MANEJA

### **1. payment_intent.succeeded**
- ✅ Actualiza pago en PostgreSQL → `status = 'completed'`
- ✅ Actualiza viaje → `payment_status = 'completed'`
- ✅ Crea notificación en Firestore para el cliente
- ✅ Log: "Pago exitoso"

### **2. payment_intent.payment_failed**
- ✅ Actualiza pago en PostgreSQL → `status = 'failed'`
- ✅ Crea notificación de error para el cliente
- ✅ Log: "Pago fallido"

### **3. payment_intent.canceled**
- ✅ Actualiza pago en PostgreSQL → `status = 'canceled'`
- ✅ Log: "Pago cancelado"

### **4. charge.refunded**
- ✅ Actualiza pago en PostgreSQL → `status = 'refunded'`
- ✅ Crea notificación de reembolso para el cliente
- ✅ Log: "Reembolso procesado"

---

## 🚀 PASOS PARA CONFIGURAR EN STRIPE

### **Paso 1: Ir al Dashboard de Stripe**

```
https://dashboard.stripe.com/webhooks
```

---

### **Paso 2: Agregar Endpoint**

1. Click en **"Add endpoint"**
2. En **"Endpoint URL"** pegar:
   ```
   https://us-central1-driveangel-ni.cloudfunctions.net/stripeWebhookHandler
   ```
3. En **"Description"** escribir:
   ```
   DriveAngel.ni - Webhook de pagos
   ```

---

### **Paso 3: Seleccionar Eventos**

Marcar los siguientes eventos:

```
✅ payment_intent.succeeded
✅ payment_intent.payment_failed
✅ payment_intent.canceled
✅ charge.refunded
```

---

### **Paso 4: Obtener Webhook Secret**

1. Después de crear el endpoint, Stripe mostrará el **Signing secret**
2. Se verá algo como: `whsec_xxxxxxxxxxxxxxxxxxxxx`
3. **Copiar este secret**

---

### **Paso 5: Agregar Secret a Firebase**

#### **Opción A: Usando Firebase CLI (Recomendado)**

```bash
firebase functions:config:set stripe.webhook_secret="whsec_xxxxxxxxxxxxxxxxxxxxx"
firebase deploy --only functions
```

#### **Opción B: Usando .env local**

Editar `functions/.env.template` y agregar:

```env
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
```

Luego copiar a `.env`:

```bash
cd functions
cp .env.template .env
```

Y redesplegar:

```bash
npm run build
firebase deploy --only functions
```

---

## 🧪 PROBAR EL WEBHOOK

### **Opción 1: Desde Stripe Dashboard**

1. Ir a: https://dashboard.stripe.com/webhooks
2. Click en tu webhook
3. Click en **"Send test webhook"**
4. Seleccionar evento: `payment_intent.succeeded`
5. Click en **"Send test webhook"**

**Resultado esperado:**
```
✅ 200 OK
✅ { "received": true }
```

---

### **Opción 2: Con Stripe CLI (Desarrollo local)**

```bash
# Instalar Stripe CLI
# https://stripe.com/docs/stripe-cli

# Login
stripe login

# Escuchar webhooks
stripe listen --forward-to https://us-central1-driveangel-ni.cloudfunctions.net/stripeWebhookHandler

# Trigger un evento de prueba
stripe trigger payment_intent.succeeded
```

---

## 📊 FLUJO COMPLETO DE PAGO

### **1. Cliente solicita viaje:**
```
Frontend → requestRide() → PostgreSQL (rides)
```

### **2. Conductor acepta:**
```
Frontend → acceptRide() → createPaymentIntent()
→ Stripe crea Payment Intent (PRE-AUTORIZACIÓN)
→ PostgreSQL (payments) status = 'pending'
```

### **3. Viaje completa:**
```
Frontend → completeRide() → capturePayment()
→ Stripe captura el pago
→ Stripe envía webhook: payment_intent.succeeded
→ Webhook actualiza PostgreSQL: status = 'completed'
→ Webhook crea notificación en Firestore
```

### **4. Cliente recibe notificación:**
```
Firestore → notifications/{userId}/items
→ Frontend muestra: "Pago exitoso: C$150"
```

---

## 🔒 SEGURIDAD

### **Verificación de Firma:**

El webhook **verifica la firma** de Stripe usando el webhook secret:

```typescript
event = stripe.webhooks.constructEvent(
  req.rawBody,
  sig,
  webhookSecret
);
```

Esto garantiza que:
- ✅ El webhook viene de Stripe
- ✅ No ha sido modificado
- ✅ Es auténtico

---

## 📝 LOGS Y DEBUGGING

### **Ver logs en Firebase:**

```bash
firebase functions:log --only stripeWebhookHandler
```

### **Ver logs en Firebase Console:**

```
https://console.firebase.google.com/project/driveangel-ni/functions/logs
```

### **Logs que verás:**

```
✅ 🪝 Webhook recibido: payment_intent.succeeded
✅ ✅ Pago exitoso: pi_xxxxxxxxxxxxx
✅ ✅ Pago procesado para viaje ride_xxxxx

❌ ❌ Pago fallido: pi_xxxxxxxxxxxxx
❌ ❌ Pago fallido para viaje ride_xxxxx

🔄 🔄 Pago cancelado: pi_xxxxxxxxxxxxx

💸 💸 Reembolso procesado: ch_xxxxxxxxxxxxx
```

---

## ⚠️ TROUBLESHOOTING

### **Error: "No signature header"**

**Causa:** Stripe no está enviando la firma  
**Solución:** Verificar que la URL del webhook esté correcta en Stripe Dashboard

---

### **Error: "Webhook Error: No signatures found matching the expected signature"**

**Causa:** El webhook secret es incorrecto  
**Solución:** 
1. Obtener el secret correcto de Stripe Dashboard
2. Actualizar en Firebase:
   ```bash
   firebase functions:config:set stripe.webhook_secret="whsec_nuevo_secret"
   firebase deploy --only functions
   ```

---

### **Error: "No rideId en metadata"**

**Causa:** El Payment Intent no tiene rideId en metadata  
**Solución:** Verificar que `createPaymentIntent()` esté agregando el metadata:
```typescript
metadata: {
  rideId: ride.id,
  clientId: ride.client_id,
  driverId: ride.driver_id || "",
}
```

---

## 📊 TESTING CHECKLIST

```
✅ Webhook configurado en Stripe Dashboard
✅ Webhook secret agregado a Firebase
✅ Eventos seleccionados correctamente
✅ Test webhook desde Stripe: 200 OK
✅ Pago de prueba procesado correctamente
✅ Notificación creada en Firestore
✅ PostgreSQL actualizado correctamente
✅ Logs visibles en Firebase Console
```

---

## 🎯 PRÓXIMOS PASOS

1. **Configurar webhook en Stripe Dashboard** (5 minutos)
2. **Agregar webhook secret a Firebase** (2 minutos)
3. **Probar con test webhook** (1 minuto)
4. **Hacer un pago de prueba real** (5 minutos)

---

## 💡 NOTAS IMPORTANTES

1. **Modo Test vs Producción:**
   - Test: `whsec_test_xxxxx`
   - Producción: `whsec_xxxxx`
   - Configurar ambos en Stripe

2. **Reintentos:**
   - Stripe reintenta automáticamente si el webhook falla
   - Hasta 3 días de reintentos

3. **Idempotencia:**
   - El webhook puede recibir el mismo evento múltiples veces
   - Usar `stripe_payment_intent_id` como clave única

---

## ✅ ESTADO ACTUAL

```
✅ Código del webhook: Implementado y desplegado
✅ URL del webhook: Disponible
✅ Eventos: Configurados (4 eventos)
✅ Seguridad: Verificación de firma implementada
✅ Notificaciones: Integradas con Firestore
✅ PostgreSQL: Actualizaciones automáticas
⏳ Configuración en Stripe: PENDIENTE
⏳ Webhook secret: PENDIENTE
```

---

**🔗 URL del Webhook:**
```
https://us-central1-driveangel-ni.cloudfunctions.net/stripeWebhookHandler
```

**📝 Configurar en:** https://dashboard.stripe.com/webhooks

**¡Listo para configurar!** 🚀
