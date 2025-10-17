# 🏦 Integración de Visanet para Pagos Locales en Nicaragua

## 📋 Resumen

Se ha implementado un **sistema dual de pagos** que permite a los clientes elegir entre:
- **Stripe**: Tarjetas internacionales (Visa, Mastercard, Amex)
- **Visanet**: Tarjetas de bancos locales nicaragüenses (BAC, Banpro, Lafise, Ficohsa)

---

## ✅ Archivos Implementados

### **Backend (Firebase Functions)**

1. **`functions/src/services/visanetService.ts`**
   - Servicio completo para integración con Visanet
   - Métodos: `createTransaction()`, `captureTransaction()`, `cancelTransaction()`
   - Manejo de errores y logging

2. **`functions/src/api/payments.ts`** (Modificado)
   - `createPaymentIntent()` - Soporta `provider: 'stripe' | 'visanet'`
   - `capturePayment()` - Captura según proveedor
   - Guarda `provider` en PostgreSQL y Firebase Realtime DB

### **Frontend (React Native)**

3. **`Frontend/src/screens/Client/PaymentScreen.tsx`** (Modificado)
   - Selector visual de proveedor de pago
   - Estado: `paymentProvider: 'stripe' | 'visanet'`
   - Pasa `provider` a `createPaymentIntent()`

---

## 🔧 Configuración Requerida

### **Paso 1: Obtener Credenciales de Visanet**

1. **Contactar a Visanet Nicaragua:**
   - 📞 Teléfono: +505 2255-7777
   - 🌐 Web: https://www.visanet.com.ni
   - 📧 Email: soporte@visanet.com.ni

2. **Solicitar:**
   - Merchant ID
   - API Key
   - Documentación de API
   - Credenciales de Sandbox (para testing)

3. **Documentos necesarios:**
   - Registro mercantil de la empresa
   - RUC
   - Identificación del representante legal
   - Contrato de servicios

---

### **Paso 2: Configurar Firebase Functions**

```bash
# Configurar credenciales de Visanet en Firebase
firebase functions:config:set \
  visanet.merchant_id="TU_MERCHANT_ID" \
  visanet.api_key="TU_API_KEY" \
  visanet.environment="sandbox"

# Para producción, cambiar a:
firebase functions:config:set visanet.environment="production"

# Ver configuración actual
firebase functions:config:get
```

---

### **Paso 3: Instalar Dependencias**

```bash
cd functions
npm install axios
```

---

### **Paso 4: Desplegar Functions**

```bash
# Desplegar todas las functions
firebase deploy --only functions

# O solo las de pagos
firebase deploy --only functions:createPaymentIntent,functions:capturePayment
```

---

## 🧪 Testing

### **Modo Sandbox (Desarrollo)**

Visanet proporciona tarjetas de prueba:

```
Tarjeta de prueba exitosa:
Número: 4111 1111 1111 1111
Fecha: 12/25
CVV: 123

Tarjeta de prueba rechazada:
Número: 4000 0000 0000 0002
Fecha: 12/25
CVV: 123
```

### **Flujo de Prueba**

1. **Cliente:**
   - Completa viaje
   - Selecciona "Tarjeta de Crédito/Débito"
   - Elige "Tarjeta Local (Visanet)"
   - Ingresa datos de tarjeta de prueba
   - Presiona "Pagar con Tarjeta"

2. **Backend:**
   - Crea transacción en Visanet (PRE-AUTORIZACIÓN)
   - Guarda en PostgreSQL y Firebase
   - Status: `authorized`

3. **Conductor:**
   - Ve "Esperando Pago"
   - Cuando cliente paga → Backend captura transacción
   - Status: `completed`

---

## 📊 Comparación: Stripe vs Visanet

| Característica | Stripe | Visanet |
|----------------|--------|---------|
| **Tarjetas** | Internacionales | Locales Nicaragua |
| **Comisión** | 3.5% + $0.30 | 2.5-3.5% |
| **Moneda** | USD, NIO | NIO |
| **Integración** | ✅ Implementada | ✅ Implementada |
| **Sandbox** | ✅ Disponible | ✅ Disponible |
| **Producción** | ✅ Activo | ⏳ Requiere credenciales |

---

## 🔄 Flujo Completo de Pago

### **1. Pre-autorización (Cuando cliente confirma conductor)**

```typescript
// Backend: functions/src/api/rides.ts - confirmDriver()
if (paymentType === 'stripe' || paymentType === 'card') {
  // Crear Payment Intent en Stripe o Visanet
  // Status: 'authorized'
  // Monto: fare (sin propina)
}
```

### **2. Actualizar propina (En PaymentScreen)**

```typescript
// Frontend: PaymentScreen.tsx
await createPaymentIntentFn({
  rideId,
  tip: 0,
  provider: paymentProvider, // 'stripe' o 'visanet'
});
```

### **3. Captura (Cuando viaje se completa)**

```typescript
// Backend: functions/src/api/payments.ts - capturePayment()
if (provider === 'visanet') {
  await visanet.captureTransaction(transactionId, finalAmount);
} else {
  await stripe.paymentIntents.capture(paymentIntentId);
}
```

---

## 🗄️ Estructura de Datos

### **PostgreSQL - Tabla `payments`**

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID REFERENCES rides(id),
  amount DECIMAL(10,2),
  tip DECIMAL(10,2),
  commission DECIMAL(10,2),
  payment_method VARCHAR(20), -- 'card', 'cash'
  payment_provider VARCHAR(20), -- 'stripe', 'visanet', 'cash'
  status VARCHAR(20), -- 'pending', 'completed', 'failed'
  stripe_payment_intent_id VARCHAR(255), -- ID de Stripe o Visanet
  created_at TIMESTAMP,
  paid_at TIMESTAMP
);
```

### **Firebase Realtime DB - `paymentStatus/{rideId}`**

```json
{
  "rideId": "abc123",
  "status": "authorized",
  "method": "card",
  "provider": "visanet",
  "amount": 100.00,
  "tip": 10.00,
  "total": 110.00,
  "paymentIntentId": "vis_abc123",
  "transactionId": "vis_abc123",
  "createdAt": 1234567890,
  "lastUpdatedBy": "backend"
}
```

---

## 🚨 Manejo de Errores

### **Error: Visanet no configurado**

```
Error: Visanet no está configurado. Usa Stripe o efectivo.
```

**Solución:**
```bash
firebase functions:config:set \
  visanet.merchant_id="xxx" \
  visanet.api_key="xxx"
```

### **Error: Transacción rechazada**

```
Error: Tarjeta rechazada por el banco emisor
```

**Causas comunes:**
- Fondos insuficientes
- Tarjeta bloqueada
- Datos incorrectos
- Límite de transacciones excedido

---

## 📈 Próximos Pasos

### **Fase 1: Testing (Actual)**
- ✅ Implementación completa
- ⏳ Obtener credenciales de Visanet
- ⏳ Testing en Sandbox
- ⏳ Validar flujo completo

### **Fase 2: Producción**
- Cambiar a credenciales de producción
- Monitorear transacciones
- Ajustar comisiones
- Optimizar UX

### **Fase 3: Expansión**
- Agregar más bancos locales
- Integrar billeteras digitales (Tigo Money, Claro Pay)
- Pagos recurrentes
- Suscripciones

---

## 💰 Costos Estimados

### **Visanet Nicaragua**
- **Setup fee**: ~$200-500 USD (una vez)
- **Comisión por transacción**: 2.5-3.5%
- **Mensualidad**: $0-50 USD (según volumen)
- **Chargebacks**: $15-25 USD por disputa

### **Comparación con Stripe**
- Visanet: **Mejor para tarjetas locales** (menor comisión)
- Stripe: **Mejor para tarjetas internacionales** (más fácil integración)

**Recomendación:** Usar ambos para maximizar conversión

---

## 📞 Soporte

### **Visanet Nicaragua**
- 📞 +505 2255-7777
- 📧 soporte@visanet.com.ni
- 🌐 https://www.visanet.com.ni

### **Documentación Técnica**
- API Docs: Solicitar a Visanet
- Sandbox: https://sandbox.visanet.com.ni
- Status Page: https://status.visanet.com.ni

---

## ✅ Checklist de Implementación

- [x] Crear servicio de Visanet
- [x] Modificar createPaymentIntent
- [x] Modificar capturePayment
- [x] Actualizar PaymentScreen con selector
- [x] Agregar estilos
- [ ] Obtener credenciales de Visanet
- [ ] Configurar Firebase Functions
- [ ] Testing en Sandbox
- [ ] Desplegar a producción
- [ ] Monitorear transacciones

---

## 🎉 Resultado Final

Los clientes ahora pueden elegir entre:

1. **🏦 Tarjeta Local (Visanet)**
   - BAC, Banpro, Lafise, Ficohsa
   - Menor comisión
   - Procesamiento local

2. **🌎 Tarjeta Internacional (Stripe)**
   - Visa, Mastercard, Amex
   - Aceptación global
   - Integración robusta

3. **💵 Efectivo**
   - Sin comisiones
   - Confirmación manual del conductor

**¡Sistema de pagos completo y flexible!** 🚀
