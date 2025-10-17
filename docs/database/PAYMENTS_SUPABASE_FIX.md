# Fix: Payments No Se Guardaban en Supabase

## 🐛 Problema Identificado

**Fecha:** 2025-10-16

### Síntoma:
- Tabla `payments` en Supabase está vacía
- Los pagos no se estaban guardando en PostgreSQL
- Solo se guardaban en Firebase Realtime Database

### Causa:
```typescript
// ❌ ANTES: ON CONFLICT incorrecto
await client.query(
  `INSERT INTO payments (...) VALUES (...)
   ON CONFLICT (ride_id) DO UPDATE SET ...`  // ❌ No hay UNIQUE constraint en ride_id
);
```

**Error:** La tabla `payments` NO tiene un constraint `UNIQUE` en `ride_id`, por lo que el `ON CONFLICT (ride_id)` causaba un error silencioso.

---

## ✅ Solución Implementada

### Archivo: `functions/src/helpers/cleanupHelpers.ts`

**Función:** `savePaymentToPostgres()`

**Cambio:**
```typescript
// ✅ DESPUÉS: Verificar primero si existe
const existingPayment = await client.query(
  'SELECT id FROM payments WHERE ride_id = $1',
  [pgRideId]
);

if (existingPayment.rows.length > 0) {
  // Actualizar payment existente
  await client.query(
    `UPDATE payments SET
      amount = $2,
      tip = $3,
      commission = $4,
      status = $5,
      paid_at = $6,
      updated_at = NOW()
    WHERE ride_id = $1`,
    [pgRideId, amount, tip, commission, status, ...]
  );
} else {
  // Insertar nuevo payment
  await client.query(
    `INSERT INTO payments (
      ride_id, amount, tip, commission, ...
    ) VALUES ($1, $2, $3, $4, ...)`,
    [pgRideId, amount, tip, commission, ...]
  );
}
```

---

## 📊 Schema de Payments

```sql
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id UUID REFERENCES rides(id),  -- ✅ Foreign Key (NO unique)
  amount NUMERIC(10,2) NOT NULL,
  tip NUMERIC(10,2) DEFAULT 0,
  commission NUMERIC NOT NULL,        -- ✅ 15% del monto
  payment_method VARCHAR(20),         -- cash, stripe, visanet, bac, etc.
  payment_provider VARCHAR(20),       -- stripe, visanet, bac, banpro, lafise
  status VARCHAR(20) DEFAULT 'pending',
  
  -- Stripe
  stripe_payment_intent_id VARCHAR(255) UNIQUE,
  stripe_charge_id VARCHAR(255),
  
  -- Bancos locales
  local_transaction_id VARCHAR(255) UNIQUE,
  local_authorization_code VARCHAR(255),
  local_bank VARCHAR(20),
  
  -- Metadata
  cancel_reason TEXT,
  notes TEXT,
  total NUMERIC GENERATED ALWAYS AS (amount + tip) STORED,
  
  created_at TIMESTAMP DEFAULT NOW(),
  paid_at TIMESTAMP,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

---

## 🔄 Flujo Completo

### 1. Viaje Completado

```
1. Conductor completa viaje
   ↓
2. completeRide() actualiza Firebase
   ├─ activeRides/${rideId}.status = 'pending_rating'
   └─ paymentStatus/${rideId}.status = 'completed' (cash) o 'pending_capture' (tarjeta)
```

### 2. Sistema de Limpieza (1 hora después)

```
3. cleanupOldRides() se ejecuta
   ↓
4. archiveCompletedRide() guarda en PostgreSQL
   ├─ saveCompletedRideToPostgres() → Guarda viaje
   └─ savePaymentToPostgres() → ✅ Guarda payment
```

### 3. Guardar Payment

```
5. savePaymentToPostgres()
   ├─ Verificar si existe payment para ride_id
   ├─ Si existe → UPDATE
   └─ Si NO existe → INSERT
```

---

## 📝 Campos Guardados

### Campos Básicos:
- ✅ `ride_id` - UUID de PostgreSQL
- ✅ `amount` - Monto base del viaje
- ✅ `tip` - Propina (default: 0)
- ✅ `commission` - 15% del monto (calculado automáticamente)
- ✅ `payment_method` - cash, stripe, visanet, bac, banpro, lafise
- ✅ `payment_provider` - stripe, visanet, bac, banpro, lafise (null para cash)
- ✅ `status` - pending, completed, failed

### Campos Stripe:
- ✅ `stripe_payment_intent_id` - ID del Payment Intent
- ✅ `stripe_charge_id` - ID del Charge

### Campos Bancos Locales:
- ✅ `local_transaction_id` - ID de transacción
- ✅ `local_authorization_code` - Código de autorización
- ✅ `local_bank` - bac, banpro, lafise

### Metadata:
- ✅ `cancel_reason` - Razón de cancelación (si aplica)
- ✅ `notes` - Notas adicionales
- ✅ `total` - amount + tip (calculado automáticamente)
- ✅ `created_at` - Timestamp de creación
- ✅ `paid_at` - Timestamp de pago (si status = completed)

---

## 🧪 Testing

### Test 1: Payment en Efectivo

```typescript
// 1. Completar viaje
await completeRide(rideId, { finalFare: 100 });

// 2. Esperar 1 hora
await wait(1 * 60 * 60 * 1000);

// 3. Ejecutar limpieza
await cleanupOldRides();

// 4. Verificar en PostgreSQL
const payment = await client.query(
  'SELECT * FROM payments WHERE ride_id = $1',
  [pgRideId]
);

expect(payment.rows.length).toBe(1); // ✅ Guardado
expect(payment.rows[0].amount).toBe(100);
expect(payment.rows[0].commission).toBe(15); // 15%
expect(payment.rows[0].payment_method).toBe('cash');
expect(payment.rows[0].payment_provider).toBeNull();
expect(payment.rows[0].status).toBe('completed');
```

### Test 2: Payment con Stripe

```typescript
// 1. Completar viaje con Stripe
await completeRide(rideId, { 
  finalFare: 150,
  paymentIntentId: 'pi_123456'
});

// 2. Archivar
await cleanupOldRides();

// 3. Verificar
const payment = await client.query(
  'SELECT * FROM payments WHERE ride_id = $1',
  [pgRideId]
);

expect(payment.rows[0].amount).toBe(150);
expect(payment.rows[0].commission).toBe(22.5); // 15%
expect(payment.rows[0].payment_method).toBe('stripe');
expect(payment.rows[0].payment_provider).toBe('stripe');
expect(payment.rows[0].stripe_payment_intent_id).toBe('pi_123456');
```

---

## 📊 Mapeos

### Payment Method → Provider:

| Method | Provider |
|--------|----------|
| `cash` | `null` |
| `stripe` | `stripe` |
| `visanet` | `visanet` |
| `bac` | `bac` |
| `banpro` | `banpro` |
| `lafise` | `lafise` |

### Status Firebase → PostgreSQL:

| Firebase Status | PostgreSQL Status |
|-----------------|-------------------|
| `completed` | `completed` |
| `pending_capture` | `pending` |
| `authorized` | `pending` |
| `in_progress` | `pending` |
| `canceled` | `failed` |

---

## 🚀 Deployment

```bash
# 1. Compilar functions
cd functions
npm run build

# 2. Desplegar
firebase deploy --only functions

# 3. Verificar logs
firebase functions:log --only cleanupOldRides
```

---

## 📈 Queries Útiles

### Ver Payments de un Viaje:

```sql
SELECT 
  p.*,
  r.client_id,
  r.driver_id,
  r.status as ride_status
FROM payments p
JOIN rides r ON p.ride_id = r.id
WHERE p.ride_id = 'UUID_DEL_VIAJE';
```

### Ver Comisiones Totales:

```sql
SELECT 
  SUM(commission) as total_commission,
  COUNT(*) as total_payments,
  payment_method
FROM payments
WHERE status = 'completed'
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY payment_method;
```

### Ver Payments Sin Viaje (Huérfanos):

```sql
SELECT * FROM payments
WHERE ride_id IS NULL;
```

---

## ✅ Checklist

- [x] Corregir `ON CONFLICT` incorrecto
- [x] Implementar verificación de existencia
- [x] Usar UPDATE o INSERT según corresponda
- [x] Calcular comisión (15%)
- [x] Mapear payment_provider correctamente
- [x] Mapear status correctamente
- [x] Logs informativos
- [x] Documentación completa
- [ ] Testing E2E
- [ ] Desplegar a producción
- [ ] Verificar que se guarden payments

---

**Fecha de corrección:** 2025-10-16  
**Archivo modificado:** `functions/src/helpers/cleanupHelpers.ts`  
**Estado:** ✅ Corregido - Listo para desplegar
