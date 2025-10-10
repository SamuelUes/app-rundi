# 💳 Configuración de Stripe - DriveAngel.ni

## 📋 Requisitos Previos

1. Cuenta de Stripe (https://stripe.com)
2. Claves de API de Stripe (Test y Production)

---

## 🔧 Configuración Backend

### 1. Obtener Claves de Stripe

1. Ir a https://dashboard.stripe.com/apikeys
2. Copiar las claves:
   - **Publishable key** (pk_test_...)
   - **Secret key** (sk_test_...)

### 2. Configurar Variables de Entorno

Editar `Backend/.env`:

```env
# Stripe Configuration
STRIPE_SECRET_KEY=sk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH
STRIPE_WEBHOOK_SECRET=whsec_your_webhook_secret_here
```

### 3. Configurar Webhook

1. Ir a https://dashboard.stripe.com/webhooks
2. Crear nuevo endpoint:
   - **URL**: `https://api.driveangel.online/payments/webhook`
   - **Eventos a escuchar**:
     - `payment_intent.succeeded`
     - `payment_intent.payment_failed`
     - `charge.refunded`
3. Copiar el **Signing secret** (whsec_...)
4. Agregarlo a `STRIPE_WEBHOOK_SECRET` en `.env`

---

## 📱 Configuración Frontend

### 1. Configurar Publishable Key

Editar `Frontend/.env`:

```env
STRIPE_PUBLIC_KEY=pk_test_51SEkQKHVOBNC1WbUcQQAYs6FDD0dYO3wMA8dQzzHFTLFkEJsNpgBXe9V7ZOfQ85uvhivpzT88ntqoITyLoadFDGd00hoCYtolH
```

### 2. Instalar Dependencias

```bash
cd Frontend
npm install @stripe/stripe-react-native
```

### 3. Configurar Deep Linking (iOS)

Editar `app.json`:

```json
{
  "expo": {
    "scheme": "driveangel",
    "ios": {
      "bundleIdentifier": "com.driveangel.ni"
    }
  }
}
```

### 4. Configurar Deep Linking (Android)

Editar `app.json`:

```json
{
  "expo": {
    "android": {
      "package": "com.driveangel.ni",
      "intentFilters": [
        {
          "action": "VIEW",
          "data": [
            {
              "scheme": "driveangel"
            }
          ],
          "category": ["BROWSABLE", "DEFAULT"]
        }
      ]
    }
  }
}
```

---

## 🧪 Testing

### Tarjetas de Prueba de Stripe

**Pago Exitoso:**
- Número: `4242 4242 4242 4242`
- Fecha: Cualquier fecha futura
- CVC: Cualquier 3 dígitos
- ZIP: Cualquier 5 dígitos

**Pago Rechazado:**
- Número: `4000 0000 0000 0002`

**Requiere Autenticación 3D Secure:**
- Número: `4000 0025 0000 3155`

### Probar Flujo Completo

1. Cliente solicita viaje
2. Conductor acepta
3. Conductor completa viaje
4. Cliente ve PaymentScreen
5. Cliente selecciona propina
6. Cliente presiona "Pagar con Tarjeta"
7. Se abre Stripe Payment Sheet
8. Ingresar tarjeta de prueba
9. Confirmar pago
10. Ver recibo

---

## 🔐 Seguridad

### Producción

**IMPORTANTE:** Antes de ir a producción:

1. ✅ Cambiar a claves de producción (pk_live_... y sk_live_...)
2. ✅ Configurar webhook en producción
3. ✅ Habilitar HTTPS en el servidor
4. ✅ Validar que STRIPE_WEBHOOK_SECRET esté configurado
5. ✅ Revisar logs de Stripe Dashboard

### Variables de Entorno Seguras

**NUNCA** commitear las claves reales en Git:
- ❌ `.env` debe estar en `.gitignore`
- ✅ Solo commitear `.env.example` con valores de ejemplo
- ✅ Usar variables de entorno en servidor de producción

---

## 📊 Monitoreo

### Dashboard de Stripe

Monitorear en https://dashboard.stripe.com:
- **Pagos**: Ver todos los pagos procesados
- **Clientes**: Ver clientes registrados
- **Webhooks**: Ver logs de webhooks
- **Eventos**: Ver todos los eventos de Stripe

### Logs del Backend

```bash
# Ver logs en tiempo real
tail -f logs/payments.log

# Buscar pagos exitosos
grep "✅ Pago" logs/payments.log

# Buscar errores
grep "❌" logs/payments.log
```

---

## 🐛 Troubleshooting

### Error: "No se pudo inicializar el pago"

**Causa:** Publishable key incorrecta o no configurada

**Solución:**
1. Verificar `STRIPE_PUBLIC_KEY` en Frontend/.env
2. Verificar que la key empiece con `pk_test_` o `pk_live_`
3. Reiniciar la app

### Error: "Webhook signature verification failed"

**Causa:** Webhook secret incorrecto

**Solución:**
1. Verificar `STRIPE_WEBHOOK_SECRET` en Backend/.env
2. Verificar que el secret empiece con `whsec_`
3. Reiniciar el servidor backend

### Error: "Payment Intent not found"

**Causa:** El Payment Intent expiró (24 horas)

**Solución:**
1. Crear un nuevo viaje
2. Intentar el pago nuevamente

### Pago exitoso pero no se confirma en la app

**Causa:** Webhook no está llegando al backend

**Solución:**
1. Verificar que el webhook esté configurado en Stripe Dashboard
2. Verificar que la URL del webhook sea correcta
3. Verificar logs del webhook en Stripe Dashboard
4. Usar Stripe CLI para testing local:
   ```bash
   stripe listen --forward-to localhost:3000/payments/webhook
   ```

---

## 🚀 Producción

### Checklist de Producción

- [ ] Cambiar a claves de producción
- [ ] Configurar webhook de producción
- [ ] Habilitar HTTPS
- [ ] Configurar variables de entorno en servidor
- [ ] Probar flujo completo con tarjeta real
- [ ] Configurar alertas de Stripe
- [ ] Revisar límites de cuenta de Stripe
- [ ] Configurar facturación automática

### Moneda

Actualmente configurado para **Córdobas nicaragüenses (NIO)**.

Para cambiar la moneda, editar en `Backend/src/payments/payments.service.ts`:

```typescript
currency: 'nio', // Cambiar a 'usd', 'eur', etc.
```

---

## 📞 Soporte

- **Documentación de Stripe**: https://stripe.com/docs
- **Stripe Support**: https://support.stripe.com
- **DriveAngel Support**: support@driveangel.online

---

## ✅ Estado de Integración

- ✅ Payment Intent creado en backend
- ✅ Stripe Payment Sheet en frontend
- ✅ Confirmación de pago
- ✅ Webhook para confirmación automática
- ✅ Generación de recibo
- ✅ Soporte para propinas
- ✅ Pago en efectivo alternativo
- ✅ Manejo de errores
- ✅ Testing con tarjetas de prueba

**Integración de Stripe: 100% Completa** 🎉
