# 🏦 IMPLEMENTACIÓN: PAGOS CON BANCOS LOCALES DE NICARAGUA

**Fecha:** 2025-10-13  
**Estado:** ✅ **ESTRUCTURA LISTA - PENDIENTE APIs DE BANCOS**

---

## 🎯 **OBJETIVO**

Permitir que los clientes paguen con tarjetas de bancos locales de Nicaragua, además de Stripe.

---

## 🏦 **BANCOS SOPORTADOS**

1. **BAC** - Banco de América Central
2. **Banpro** - Banco de la Producción
3. **Lafise Bancentro**
4. **Ficohsa** - Banco Ficohsa
5. **Avanz** - Banco Avanz

---

## 📊 **TABLA `payments` ACTUALIZADA**

### **Nuevas Columnas:**
```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY,
  ride_id UUID,
  amount NUMERIC(10, 2),
  tip NUMERIC(10, 2),
  commission NUMERIC(10, 2),
  total NUMERIC(10, 2) GENERATED ALWAYS AS (amount + tip) STORED,
  
  -- Método y Proveedor
  payment_method VARCHAR(20),      -- 'stripe', 'bac', 'banpro', 'lafise', 'ficohsa', 'avanz'
  payment_provider VARCHAR(20),    -- 'stripe' o 'local'
  status VARCHAR(20),
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  
  -- Bancos Locales ✅ NUEVO
  local_transaction_id VARCHAR(255) UNIQUE,
  local_authorization_code VARCHAR(255),
  local_bank VARCHAR(20),          -- 'bac', 'banpro', 'lafise', 'ficohsa', 'avanz'
  
  paid_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 **FLUJO DE PAGO**

### **1. Cliente Confirma Conductor**
```
Acción: confirmDriver()

Por defecto:
- Se crea pre-autorización con Stripe
- payment_provider = 'stripe'
- payment_method = 'stripe'

Cliente puede cambiar después:
- Llamar a switchToLocalPayment()
- Seleccionar banco local
- Ingresar datos de tarjeta
```

### **2. Cliente Cambia a Banco Local (Opcional)**
```
Acción: switchToLocalPayment()

Pasos:
1. Cancelar pre-autorización de Stripe
2. Crear pre-autorización con banco local
3. Actualizar payment:
   - payment_provider = 'local'
   - payment_method = 'bac' (o el banco seleccionado)
   - local_transaction_id = 'bac_auth_xxx'
   - local_authorization_code = 'BACxxx'
   - local_bank = 'bac'
   - stripe_payment_intent_id = NULL
```

### **3. Captura de Pago**
```
Acción: completeRide() o cancelRide()

Si payment_provider = 'stripe':
  - Capturar con Stripe API

Si payment_provider = 'local':
  - Capturar con API del banco local
  - Usar local_transaction_id
```

---

## 📁 **ARCHIVOS CREADOS**

### **1. `functions/src/utils/localPaymentUtils.ts`** ✅

**Funciones:**
- `createLocalPaymentAuthorization()` - Crear pre-autorización
- `captureLocalPayment()` - Capturar pago
- `cancelLocalPaymentAuthorization()` - Cancelar autorización

**Implementaciones por banco:**
- `createBACAuthorization()` - TODO: Implementar API de BAC
- `createBanproAuthorization()` - TODO: Implementar API de Banpro
- `createLafiseAuthorization()` - TODO: Implementar API de Lafise
- `createFicohsaAuthorization()` - TODO: Implementar API de Ficohsa
- `createAvanzAuthorization()` - TODO: Implementar API de Avanz

**Estado actual:** Simulación (retorna respuestas exitosas)

---

### **2. `functions/src/api/localPayments.ts`** ✅

**Funciones exportadas:**
- `switchToLocalPayment()` - Cambiar de Stripe a banco local
- `getAvailableBanks()` - Obtener lista de bancos disponibles

---

### **3. Actualizaciones en `functions/src/api/rides.ts`** ✅

**Función `confirmDriver()`:**
- Crea pre-autorización con Stripe por defecto
- Guarda `payment_provider = 'stripe'`

**Función `completeRide()`:**
- Detecta `payment_provider`
- Captura con Stripe o banco local según corresponda

**Función `cancelRide()`:**
- Detecta `payment_provider`
- Cancela con Stripe o banco local según corresponda

---

## 🔧 **FUNCIONES FIREBASE EXPORTADAS**

```typescript
// functions/src/index.ts

// Local Payments
export const switchToLocalPayment = localPaymentsAPI.switchToLocalPayment;
export const getAvailableBanks = localPaymentsAPI.getAvailableBanks;
```

---

## 📱 **FRONTEND - PANTALLAS A CREAR**

### **1. Pantalla de Selección de Método de Pago**
```typescript
Frontend/src/screens/Client/PaymentMethodScreen.tsx
```

**Muestra:**
- Opción: Stripe (Tarjeta Internacional)
- Opción: BAC
- Opción: Banpro
- Opción: Lafise
- Opción: Ficohsa
- Opción: Avanz

**Al seleccionar banco local:**
- Navegar a formulario de tarjeta

---

### **2. Pantalla de Datos de Tarjeta Local**
```typescript
Frontend/src/screens/Client/LocalCardFormScreen.tsx
```

**Campos:**
- Número de tarjeta
- Nombre del titular
- Mes de expiración
- Año de expiración
- CVV

**Botón:**
- "Confirmar Método de Pago"
- Llama a `switchToLocalPayment()`

---

## 🔌 **INTEGRACIÓN CON BANCOS (PENDIENTE)**

### **Información Necesaria de Cada Banco:**

#### **1. BAC**
```typescript
// TODO: Obtener de BAC
- API Endpoint: https://api.bac.net/v1/payments
- API Key: xxx
- Merchant ID: xxx
- Documentación: URL
```

#### **2. Banpro**
```typescript
// TODO: Obtener de Banpro
- API Endpoint: https://api.banpro.com.ni/payments
- API Key: xxx
- Merchant ID: xxx
- Documentación: URL
```

#### **3. Lafise**
```typescript
// TODO: Obtener de Lafise
- API Endpoint: https://api.lafise.com/payments
- API Key: xxx
- Merchant ID: xxx
- Documentación: URL
```

#### **4. Ficohsa**
```typescript
// TODO: Obtener de Ficohsa
- API Endpoint: https://api.ficohsa.com/payments
- API Key: xxx
- Merchant ID: xxx
- Documentación: URL
```

#### **5. Avanz**
```typescript
// TODO: Obtener de Avanz
- API Endpoint: https://api.avanz.com.ni/payments
- API Key: xxx
- Merchant ID: xxx
- Documentación: URL
```

---

## 🧪 **TESTING**

### **Caso 1: Pago con Stripe (Por Defecto)**
1. Cliente confirma conductor
2. Pre-autorización creada con Stripe
3. Conductor completa viaje
4. Pago capturado con Stripe
5. ✅ Verificar payment.payment_provider = 'stripe'

### **Caso 2: Cambio a BAC**
1. Cliente confirma conductor (Stripe por defecto)
2. Cliente cambia a BAC
3. Stripe cancelado, BAC autorizado
4. Conductor completa viaje
5. Pago capturado con BAC
6. ✅ Verificar payment.payment_provider = 'local'
7. ✅ Verificar payment.local_bank = 'bac'

### **Caso 3: Cancelación con Banco Local**
1. Cliente confirma conductor
2. Cliente cambia a Banpro
3. Cliente cancela con 40% de progreso
4. Autorización de Banpro cancelada
5. ✅ Verificar payment.status = 'canceled'

---

## 📋 **CHECKLIST DE IMPLEMENTACIÓN**

### **Backend:**
- [x] Actualizar schema de `payments`
- [x] Crear `localPaymentUtils.ts`
- [x] Crear `localPayments.ts`
- [x] Actualizar `confirmDriver()`
- [x] Actualizar `completeRide()`
- [x] Actualizar `cancelRide()`
- [x] Exportar funciones en `index.ts`
- [ ] Obtener credenciales de bancos
- [ ] Implementar APIs reales de bancos
- [ ] Testing con bancos en sandbox

### **Frontend:**
- [ ] Crear `PaymentMethodScreen.tsx`
- [ ] Crear `LocalCardFormScreen.tsx`
- [ ] Crear servicio `localPaymentsService.ts`
- [ ] Agregar navegación
- [ ] Testing UI

### **Base de Datos:**
- [ ] Ejecutar ALTER TABLE en Supabase
- [ ] Agregar índices para local_transaction_id
- [ ] Verificar constraints

---

## 🚀 **DEPLOYMENT**

### **1. Actualizar schema en Supabase:**
```sql
ALTER TABLE payments 
ADD COLUMN payment_provider VARCHAR(20),
ADD COLUMN local_transaction_id VARCHAR(255) UNIQUE,
ADD COLUMN local_authorization_code VARCHAR(255),
ADD COLUMN local_bank VARCHAR(20);

CREATE INDEX idx_payments_local_transaction_id 
ON payments(local_transaction_id);
```

### **2. Desplegar funciones:**
```bash
cd functions
npm run build
firebase deploy --only functions:switchToLocalPayment,getAvailableBanks
```

---

## 💡 **VENTAJAS**

1. ✅ **Flexibilidad:** Cliente elige su banco preferido
2. ✅ **Cobertura:** Soporta los 5 bancos principales de Nicaragua
3. ✅ **Estructura lista:** Solo falta implementar APIs reales
4. ✅ **Fallback:** Si falla banco local, puede usar Stripe
5. ✅ **Transparente:** Mismo flujo para ambos métodos

---

## ⚠️ **NOTAS IMPORTANTES**

1. **Simulación Activa:**
   - Las funciones de bancos locales actualmente simulan respuestas
   - Retornan transacciones exitosas con IDs ficticios
   - NO se realizan cargos reales

2. **Próximos Pasos:**
   - Contactar a cada banco para obtener credenciales
   - Solicitar acceso a sandbox/testing
   - Implementar APIs reales
   - Testing exhaustivo

3. **Seguridad:**
   - Nunca guardar CVV en la base de datos
   - Usar HTTPS para todas las comunicaciones
   - Implementar tokenización si el banco lo soporta
   - Cumplir con PCI DSS

---

**Implementado por:** Cascade AI  
**Fecha:** 2025-10-13  
**Estado:** ✅ **ESTRUCTURA LISTA - PENDIENTE APIs DE BANCOS**
