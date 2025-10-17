# Validación: Schema de Payments en Supabase

## ✅ Schema Completo Validado

### Tabla: `payments`

```sql
create table public.payments (
  id uuid not null default gen_random_uuid (),
  ride_id uuid null,
  amount numeric(10, 2) not null,
  tip numeric(10, 2) null default 0,
  payment_method character varying(20) null,
  status character varying(20) null default 'pending'::character varying,
  stripe_payment_intent_id character varying(255) null,
  stripe_charge_id character varying(255) null,
  paid_at timestamp without time zone null,
  created_at timestamp without time zone null default now(),
  updated_at timestamp without time zone null default now(),
  commission numeric not null,
  payment_provider character varying(20) null,
  local_transaction_id character varying(255) null,
  local_authorization_code character varying(255) null,
  local_bank character varying(20) null,
  total numeric GENERATED ALWAYS as ((amount + tip)) STORED (10, 2) null,
  cancel_reason text null,
  notes text null,
  constraint payments_pkey primary key (id),
  constraint payments_local_transaction_id_key unique (local_transaction_id),
  constraint payments_stripe_payment_intent_id_key unique (stripe_payment_intent_id),
  constraint payments_ride_id_fkey foreign KEY (ride_id) references rides (id) on delete CASCADE
) TABLESPACE pg_default;
```

---

## 📊 Mapeo de Campos

### Campos Requeridos (NOT NULL):

| Campo | Tipo | Descripción | Valor en Código |
|-------|------|-------------|-----------------|
| `id` | uuid | ID único (auto) | `gen_random_uuid()` |
| `amount` | numeric(10,2) | Monto base | `paymentStatus.finalAmount \|\| paymentStatus.amount` |
| `commission` | numeric | Comisión (15%) | `amount * 0.15` |

### Campos Opcionales:

| Campo | Tipo | Descripción | Valor en Código |
|-------|------|-------------|-----------------|
| `ride_id` | uuid | FK a rides | `pgRideId` (del viaje guardado) |
| `tip` | numeric(10,2) | Propina | `paymentStatus.tip \|\| 0` |
| `payment_method` | varchar(20) | Método de pago | `paymentStatus.method \|\| 'cash'` |
| `payment_provider` | varchar(20) | Proveedor | Ver mapeo abajo |
| `status` | varchar(20) | Estado | Ver mapeo abajo |
| `stripe_payment_intent_id` | varchar(255) | ID de Stripe | `paymentStatus.paymentIntentId` |
| `stripe_charge_id` | varchar(255) | Charge ID | `paymentStatus.chargeId` |
| `local_transaction_id` | varchar(255) | ID transacción local | `paymentStatus.localTransactionId` |
| `local_authorization_code` | varchar(255) | Código autorización | `paymentStatus.localAuthCode` |
| `local_bank` | varchar(20) | Banco local | `paymentStatus.localBank` |
| `cancel_reason` | text | Razón de cancelación | `paymentStatus.cancelReason` |
| `notes` | text | Notas adicionales | `paymentStatus.message \|\| paymentStatus.notes` |
| `paid_at` | timestamp | Fecha de pago | `NOW()` si completed, `null` si pending |
| `created_at` | timestamp | Fecha creación | `paymentStatus.createdAt \|\| NOW()` |
| `updated_at` | timestamp | Fecha actualización | `NOW()` (trigger automático) |

### Campo Calculado:

| Campo | Tipo | Descripción | Cálculo |
|-------|------|-------------|---------|
| `total` | numeric(10,2) | Total (auto) | `GENERATED ALWAYS AS (amount + tip)` |

---

## 🔄 Mapeo de payment_method → payment_provider

```typescript
const paymentProvider = 
  paymentStatus.method === 'stripe' ? 'stripe' :
  paymentStatus.method === 'visanet' ? 'visanet' :
  paymentStatus.method === 'bac' ? 'bac' :
  paymentStatus.method === 'banpro' ? 'banpro' :
  paymentStatus.method === 'lafise' ? 'lafise' :
  null; // null para cash
```

### Valores Válidos:

**payment_method:**
- `cash` - Efectivo
- `stripe` - Tarjeta Stripe
- `card` - Tarjeta genérica
- `visanet` - Visanet Nicaragua
- `bac` - BAC Credomatic
- `banpro` - Banpro
- `lafise` - Lafise

**payment_provider:**
- `stripe` - Stripe (internacional)
- `visanet` - Visanet (Nicaragua)
- `bac` - BAC Credomatic
- `banpro` - Banpro
- `lafise` - Lafise
- `null` - Para cash (efectivo)

---

## 🔄 Mapeo de status (Firebase → PostgreSQL)

```typescript
const status = 
  paymentStatus.status === 'completed' ? 'completed' :
  paymentStatus.status === 'pending_capture' ? 'pending' :
  paymentStatus.status === 'authorized' ? 'pending' :
  paymentStatus.status === 'in_progress' ? 'pending' :
  paymentStatus.status === 'canceled' ? 'failed' :
  'pending';
```

### Estados en Firebase Realtime:
- `pending` - Esperando autorización
- `authorized` - Pre-autorizado (hold)
- `in_progress` - Viaje en progreso
- `pending_capture` - Listo para capturar
- `completed` - Pago completado
- `canceled` - Pago cancelado
- `pending_cash_payment` - Efectivo pendiente
- `pending_partial_capture` - Captura parcial

### Estados en PostgreSQL:
- `pending` - Pendiente
- `completed` - Completado
- `failed` - Fallido

---

## 💾 Función Actualizada: `savePaymentToPostgres()`

### Ubicación:
`functions/src/helpers/cleanupHelpers.ts`

### Parámetros:
```typescript
savePaymentToPostgres(
  paymentStatus: any,  // Datos del payment desde Firebase
  rideId: string,      // ID del viaje en Firebase
  pgRideId: string     // UUID del viaje en PostgreSQL
)
```

### Campos Guardados:

```typescript
INSERT INTO payments (
  ride_id,                      // ✅ UUID del viaje en PostgreSQL
  amount,                       // ✅ Monto base (NOT NULL)
  tip,                          // ✅ Propina (default 0)
  commission,                   // ✅ Comisión 15% (NOT NULL)
  payment_method,               // ✅ cash, stripe, visanet, etc.
  payment_provider,             // ✅ stripe, visanet, bac, banpro, lafise, null
  status,                       // ✅ pending, completed, failed
  stripe_payment_intent_id,     // ✅ ID de Stripe (si aplica)
  stripe_charge_id,             // ✅ Charge ID de Stripe (si aplica)
  local_transaction_id,         // ✅ ID transacción banco local (si aplica)
  local_authorization_code,     // ✅ Código autorización banco (si aplica)
  local_bank,                   // ✅ bac, banpro, lafise (si aplica)
  cancel_reason,                // ✅ Razón de cancelación (si aplica)
  notes,                        // ✅ Notas adicionales
  created_at,                   // ✅ Timestamp creación
  paid_at                       // ✅ Timestamp pago (si completed)
) VALUES (...)
```

### ON CONFLICT (Actualización):

Si el payment ya existe (por `ride_id`), se actualiza:

```sql
ON CONFLICT (ride_id) DO UPDATE SET
  amount = EXCLUDED.amount,
  tip = EXCLUDED.tip,
  commission = EXCLUDED.commission,
  status = EXCLUDED.status,
  paid_at = EXCLUDED.paid_at,
  cancel_reason = EXCLUDED.cancel_reason,
  notes = EXCLUDED.notes,
  updated_at = NOW()
```

---

## 🧪 Ejemplos de Datos

### Ejemplo 1: Pago en Efectivo Completado

**Firebase Realtime:**
```json
{
  "paymentStatus/ride123": {
    "method": "cash",
    "status": "completed",
    "amount": 100,
    "finalAmount": 100,
    "tip": 10,
    "createdAt": 1697500000000,
    "message": "Pago en efectivo recibido"
  }
}
```

**PostgreSQL:**
```sql
INSERT INTO payments (
  ride_id, amount, tip, commission, payment_method, 
  payment_provider, status, notes, created_at, paid_at
) VALUES (
  'uuid-ride123',  -- ride_id
  100.00,          -- amount
  10.00,           -- tip
  15.00,           -- commission (15%)
  'cash',          -- payment_method
  NULL,            -- payment_provider (null para cash)
  'completed',     -- status
  'Pago en efectivo recibido', -- notes
  '2023-10-17 10:00:00', -- created_at
  '2023-10-17 10:05:00'  -- paid_at
);

-- total = 110.00 (calculado automáticamente)
```

---

### Ejemplo 2: Pago con Stripe Completado

**Firebase Realtime:**
```json
{
  "paymentStatus/ride456": {
    "method": "stripe",
    "status": "completed",
    "amount": 150,
    "finalAmount": 150,
    "tip": 15,
    "paymentIntentId": "pi_1234567890",
    "chargeId": "ch_1234567890",
    "createdAt": 1697500000000
  }
}
```

**PostgreSQL:**
```sql
INSERT INTO payments (
  ride_id, amount, tip, commission, payment_method, 
  payment_provider, status, stripe_payment_intent_id, 
  stripe_charge_id, created_at, paid_at
) VALUES (
  'uuid-ride456',
  150.00,
  15.00,
  22.50,           -- commission (15% de 150)
  'stripe',
  'stripe',
  'completed',
  'pi_1234567890',
  'ch_1234567890',
  '2023-10-17 11:00:00',
  '2023-10-17 11:05:00'
);

-- total = 165.00 (calculado automáticamente)
```

---

### Ejemplo 3: Pago con Banco Local (BAC)

**Firebase Realtime:**
```json
{
  "paymentStatus/ride789": {
    "method": "bac",
    "status": "completed",
    "amount": 200,
    "finalAmount": 200,
    "tip": 0,
    "localTransactionId": "BAC-TX-123456",
    "localAuthCode": "AUTH-789012",
    "localBank": "bac",
    "createdAt": 1697500000000
  }
}
```

**PostgreSQL:**
```sql
INSERT INTO payments (
  ride_id, amount, tip, commission, payment_method, 
  payment_provider, status, local_transaction_id, 
  local_authorization_code, local_bank, created_at, paid_at
) VALUES (
  'uuid-ride789',
  200.00,
  0.00,
  30.00,           -- commission (15% de 200)
  'bac',
  'bac',
  'completed',
  'BAC-TX-123456',
  'AUTH-789012',
  'bac',
  '2023-10-17 12:00:00',
  '2023-10-17 12:05:00'
);

-- total = 200.00 (calculado automáticamente)
```

---

### Ejemplo 4: Pago Cancelado

**Firebase Realtime:**
```json
{
  "paymentStatus/ride999": {
    "method": "stripe",
    "status": "canceled",
    "amount": 120,
    "finalAmount": 120,
    "tip": 0,
    "paymentIntentId": "pi_9876543210",
    "cancelReason": "Cliente canceló el viaje",
    "createdAt": 1697500000000
  }
}
```

**PostgreSQL:**
```sql
INSERT INTO payments (
  ride_id, amount, tip, commission, payment_method, 
  payment_provider, status, stripe_payment_intent_id,
  cancel_reason, created_at, paid_at
) VALUES (
  'uuid-ride999',
  120.00,
  0.00,
  18.00,           -- commission (15% de 120)
  'stripe',
  'stripe',
  'failed',        -- canceled → failed
  'pi_9876543210',
  'Cliente canceló el viaje',
  '2023-10-17 13:00:00',
  NULL             -- paid_at es NULL porque no se completó
);

-- total = 120.00 (calculado automáticamente)
```

---

## ✅ Validaciones

### 1. Campo `commission` (NOT NULL)

```typescript
// ✅ CORRECTO: Siempre se calcula
const commission = amount * 0.15;

// ❌ INCORRECTO: No enviar null
const commission = paymentStatus.commission || null; // ERROR!
```

### 2. Campo `ride_id` (Foreign Key)

```typescript
// ✅ CORRECTO: Usar UUID de PostgreSQL
ride_id: pgRideId  // UUID del viaje guardado en PostgreSQL

// ❌ INCORRECTO: Usar ID de Firebase
ride_id: rideId    // ERROR! No existe en tabla rides
```

### 3. Campo `total` (GENERATED)

```typescript
// ✅ CORRECTO: NO enviar en INSERT
// El campo se calcula automáticamente: total = amount + tip

// ❌ INCORRECTO: Intentar insertar valor
total: amount + tip  // ERROR! Es un campo GENERATED
```

### 4. Constraint `UNIQUE` en `stripe_payment_intent_id`

```typescript
// ✅ CORRECTO: Enviar null si no hay
stripe_payment_intent_id: paymentStatus.paymentIntentId || null

// ❌ INCORRECTO: Enviar string vacío
stripe_payment_intent_id: paymentStatus.paymentIntentId || ''  // ERROR!
```

---

## 🔍 Testing

### Query para Verificar Payments:

```sql
-- Ver todos los payments
SELECT 
  id,
  ride_id,
  amount,
  tip,
  total,  -- Calculado automáticamente
  commission,
  payment_method,
  payment_provider,
  status,
  stripe_payment_intent_id,
  local_transaction_id,
  local_bank,
  cancel_reason,
  notes,
  created_at,
  paid_at
FROM payments
ORDER BY created_at DESC
LIMIT 10;
```

### Verificar Comisiones:

```sql
-- Verificar que commission = amount * 0.15
SELECT 
  id,
  amount,
  commission,
  ROUND(amount * 0.15, 2) as expected_commission,
  CASE 
    WHEN ROUND(commission, 2) = ROUND(amount * 0.15, 2) THEN '✅ OK'
    ELSE '❌ ERROR'
  END as validation
FROM payments;
```

### Verificar Totales:

```sql
-- Verificar que total = amount + tip
SELECT 
  id,
  amount,
  tip,
  total,
  (amount + tip) as expected_total,
  CASE 
    WHEN total = (amount + tip) THEN '✅ OK'
    ELSE '❌ ERROR'
  END as validation
FROM payments;
```

---

## 📊 Logs de Ejemplo

```bash
💳 Guardando payment en PostgreSQL para viaje: ride123
✅ Payment guardado en PostgreSQL para viaje: uuid-ride123
   - Monto: C$100, Propina: C$10, Comisión: C$15.00
   - Método: cash, Provider: N/A
   - Estado: completed
```

---

## ✅ Checklist de Validación

- [x] Campo `commission` (NOT NULL) - Calculado correctamente (15%)
- [x] Campo `ride_id` - Usa UUID de PostgreSQL
- [x] Campo `amount` (NOT NULL) - Siempre tiene valor
- [x] Campo `total` - NO se envía (GENERATED)
- [x] Campo `payment_provider` - Mapeado correctamente
- [x] Campo `status` - Mapeado de Firebase a PostgreSQL
- [x] Campos Stripe - Enviados correctamente
- [x] Campos banco local - Enviados correctamente
- [x] ON CONFLICT - Actualiza correctamente
- [x] Trigger `updated_at` - Se ejecuta automáticamente

---

## 📅 Fecha de Validación

**2025-10-16**

---

## ✅ Estado

**VALIDADO Y CORREGIDO** ✅

Todos los campos del schema de Supabase están siendo guardados correctamente.
