# 💵 SISTEMA DE RECARGAS PARA PAGOS EN EFECTIVO

**Fecha:** 2025-10-13  
**Estado:** ✅ **BACKEND IMPLEMENTADO - PENDIENTE FRONTEND**

---

## 🎯 **OBJETIVO**

Implementar un sistema de recargas donde los conductores depositan las comisiones de viajes pagados en efectivo. Si no realizan la recarga antes del pago mensual/quincenal, se les retiene el 40% de su pago total bruto.

---

## 📋 **FLUJO COMPLETO**

### **1. Cliente Solicita Viaje**
```
Pantalla: SearchRideScreen

Cliente selecciona método de pago:
- 💵 Efectivo (cash)
- 💳 Tarjeta Local (card_local) - Bancos de Nicaragua
- 💳 Stripe (stripe) - Tarjetas internacionales

Método se guarda en: rides.payment_type
```

### **2. Conductor Ve Solicitud**
```
Pantalla: AvailableRidesScreen

Conductor ve:
- Origen → Destino
- Precio estimado: C$100.00
- Método de pago: 💵 Efectivo
- Pasajeros: 2
- Tipo: Normal
```

### **3. Viaje Completado**
```
Si payment_type = 'cash':
- Cliente paga en efectivo al conductor
- Conductor recibe: C$100.00
- Comisión pendiente: C$10.00 (10%)
- Estado: pending_recharge
```

### **4. Conductor Ve Sus Ganancias**
```
Pantalla: EarningsScreen

┌─────────────────────────────────────┐
│  💰 Resumen de Ganancias           │
│                                     │
│  Total Bruto:        C$5,000.00    │
│  Comisión (10%):    -C$500.00      │
│  ─────────────────────────────────  │
│  Ganancia Neta:      C$4,500.00    │
│                                     │
│  💵 Viajes en Efectivo:            │
│  - Total viajes: 10                │
│  - Comisiones pendientes: C$100.00 │
│                                     │
│  [🔄 Recargar Comisiones]          │
│                                     │
│  ⚠️ Si no recargas antes del pago: │
│  Retención 40%: -C$2,000.00        │
│  ─────────────────────────────────  │
│  Total a Recibir:    C$2,400.00    │
└─────────────────────────────────────┘
```

### **5. Conductor Hace Recarga**
```
Acción: Botón "Recargar Comisiones"

Pantalla: CashRechargeScreen

┌─────────────────────────────────────┐
│  💵 Recargar Comisiones            │
│                                     │
│  Viajes en efectivo: 10            │
│  Total comisiones: C$100.00        │
│                                     │
│  Selecciona viajes a cubrir:       │
│  ☑ Viaje 1 - C$10.00              │
│  ☑ Viaje 2 - C$10.00              │
│  ☑ Viaje 3 - C$10.00              │
│  ... (más viajes)                  │
│                                     │
│  Total a depositar: C$100.00       │
│                                     │
│  Método de depósito:               │
│  ○ Transferencia bancaria          │
│  ○ Depósito en efectivo            │
│  ○ Tarjeta                         │
│                                     │
│  Referencia: _________________     │
│  Comprobante: [Subir foto]         │
│                                     │
│  [Enviar Recarga]                  │
└─────────────────────────────────────┘
```

### **6. Administrador Verifica Recarga**
```
Pantalla: AdminRechargesScreen

Recarga pendiente:
- Conductor: Juan Pérez
- Monto: C$100.00
- Viajes: 10
- Método: Transferencia
- Referencia: TRF123456
- Comprobante: [Ver foto]

[✅ Verificar] [❌ Rechazar]
```

### **7. Pago Mensual/Quincenal**
```
Escenario A: Conductor hizo recarga
- Ganancia neta: C$4,500.00
- Penalizaciones: -C$0.00
- Retención: -C$0.00
- Total a pagar: C$4,500.00 ✅

Escenario B: Conductor NO hizo recarga
- Ganancia neta: C$4,500.00
- Penalizaciones: -C$0.00
- Retención 40%: -C$2,000.00
- Total a pagar: C$2,500.00 ⚠️
```

---

## 📊 **TABLAS DE BASE DE DATOS**

### **1. Tabla `rides` - Actualizada** ✅
```sql
ALTER TABLE rides 
ADD COLUMN payment_type VARCHAR(20) DEFAULT 'cash';

-- Valores: 'cash', 'card_local', 'stripe'
```

### **2. Tabla `cash_recharges` - Nueva** ✅
```sql
CREATE TABLE cash_recharges (
  id UUID PRIMARY KEY,
  driver_id VARCHAR(255) NOT NULL,
  amount NUMERIC(10, 2) NOT NULL,
  commission_total NUMERIC(10, 2) NOT NULL,
  rides_count INTEGER NOT NULL,
  ride_ids UUID[] NULL,
  payment_method VARCHAR(50) NULL,
  payment_reference VARCHAR(255) NULL,
  payment_proof VARCHAR(500) NULL,
  status VARCHAR(20) DEFAULT 'pending',
  verified_by VARCHAR(255) NULL,
  verified_at TIMESTAMP NULL,
  rejection_reason TEXT NULL,
  notes TEXT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

**Estados:**
- `pending` - Pendiente de verificación
- `verified` - Verificado por admin
- `rejected` - Rechazado

---

## 🔧 **FUNCIONES IMPLEMENTADAS**

### **Backend (Firebase Functions):**

**1. `requestRide()` - Actualizada** ✅
```typescript
// Ahora incluye payment_type
const { paymentType } = data; // 'cash', 'card_local', 'stripe'

await client.query(
  `INSERT INTO rides (..., payment_type) 
   VALUES (..., $18)`,
  [..., paymentType || 'cash']
);
```

**2. `getPendingCashRides()`** ✅ NUEVA
```typescript
// Obtener viajes en efectivo pendientes de recarga
// Retorna: lista de viajes + total de comisiones
```

**3. `createCashRecharge()`** ✅ NUEVA
```typescript
// Crear solicitud de recarga
// Parámetros: rideIds[], paymentMethod, reference, proof
// Retorna: recharge creada con status 'pending'
```

**4. `getDriverRecharges()`** ✅ NUEVA
```typescript
// Obtener historial de recargas del conductor
// Filtros: status ('all', 'pending', 'verified', 'rejected')
```

**5. `verifyRecharge()` - Admin** ✅ NUEVA
```typescript
// Verificar o rechazar recarga
// Parámetros: rechargeId, action ('verify' | 'reject'), reason
```

**6. `calculateCashCommissionRetention()`** ✅ NUEVA
```typescript
// Calcular retención del 40% si hay comisiones pendientes
// Retorna: hasRetention, retentionAmount, pendingCommission
```

**7. `getDriverEarnings()` - Actualizada** ✅
```typescript
// Ahora incluye:
summary: {
  totalEarnings: 5000.00,
  commission: 500.00,
  netEarnings: 4500.00,
  cashRidesCount: 10,
  cashCommissionTotal: 100.00,
  cashCommissionPending: 100.00,
  retentionAmount: 2000.00,      // 40% si no hay recarga
  hasRetention: true,
  netEarningsAfterPenalties: 2400.00
}
```

---

## 💰 **CÁLCULO DE RETENCIÓN**

### **Fórmula:**
```
Si pendingCashCommission > 0:
  retentionAmount = totalEarnings * 0.40
  netEarningsAfterPenalties = netEarnings - retentionAmount
Sino:
  retentionAmount = 0
  netEarningsAfterPenalties = netEarnings
```

### **Ejemplo:**
```
Total Bruto: C$5,000.00
Comisión: -C$500.00
Ganancia Neta: C$4,500.00

Viajes en efectivo: 10
Comisiones pendientes: C$100.00

Retención 40%: C$5,000.00 * 0.40 = C$2,000.00

Total a Recibir: C$4,500.00 - C$2,000.00 = C$2,500.00
```

---

## 📱 **PANTALLAS A CREAR (FRONTEND)**

### **1. SearchRideScreen - Actualizar** ⏳
```typescript
// Agregar selector de método de pago
<PaymentMethodSelector
  value={paymentType}
  onChange={setPaymentType}
  options={[
    { value: 'cash', label: '💵 Efectivo', icon: 'cash' },
    { value: 'card_local', label: '💳 Tarjeta Local', icon: 'card' },
    { value: 'stripe', label: '💳 Stripe', icon: 'credit-card' },
  ]}
/>
```

### **2. AvailableRidesScreen - Actualizar** ⏳
```typescript
// Mostrar método de pago en cada solicitud
<RideCard>
  <Text>Método de pago: {getPaymentIcon(ride.paymentType)}</Text>
</RideCard>
```

### **3. EarningsScreen - Actualizar** ⏳
```typescript
// Agregar sección de recargas
<CashCommissionSection>
  <Text>Viajes en efectivo: {cashRidesCount}</Text>
  <Text>Comisiones pendientes: C${cashCommissionPending}</Text>
  <Button onPress={navigateToRecharge}>
    🔄 Recargar Comisiones
  </Button>
  {hasRetention && (
    <Alert>
      ⚠️ Retención 40%: -C${retentionAmount}
    </Alert>
  )}
</CashCommissionSection>
```

### **4. CashRechargeScreen - Nueva** ⏳
```typescript
Frontend/src/screens/Driver/CashRechargeScreen.tsx

Funcionalidad:
- Listar viajes en efectivo pendientes
- Seleccionar viajes a cubrir
- Ingresar método de pago
- Subir comprobante
- Enviar recarga
```

### **5. RechargeHistoryScreen - Nueva** ⏳
```typescript
Frontend/src/screens/Driver/RechargeHistoryScreen.tsx

Funcionalidad:
- Ver historial de recargas
- Filtrar por estado
- Ver detalles de cada recarga
```

---

## 🔌 **SERVICIOS A CREAR (FRONTEND)**

### **`cashRechargeService.ts`** ⏳
```typescript
export const cashRechargeService = {
  getPendingCashRides: async () => {...},
  createRecharge: async (data) => {...},
  getRecharges: async (status) => {...},
  uploadProof: async (file) => {...},
};
```

---

## 📈 **EJEMPLOS DE USO**

### **Ejemplo 1: Conductor con 10 viajes en efectivo**
```
Viajes completados: 50
- 40 con tarjeta (pagados automáticamente)
- 10 en efectivo (conductor recibió C$1,000.00)

Comisiones:
- Tarjeta: C$400.00 (ya descontadas)
- Efectivo: C$100.00 (pendientes)

Conductor hace recarga de C$100.00:
- Estado: pending
- Admin verifica: verified
- En próximo pago: No hay retención
```

### **Ejemplo 2: Conductor NO hace recarga**
```
Viajes completados: 50
- 40 con tarjeta
- 10 en efectivo

Comisiones pendientes: C$100.00

Día de pago:
- Ganancia neta: C$4,500.00
- Retención 40%: -C$2,000.00
- Total a recibir: C$2,500.00

Conductor pierde: C$2,000.00 por no recargar C$100.00
```

### **Ejemplo 3: Recarga parcial**
```
Viajes en efectivo: 10
Comisiones totales: C$100.00

Conductor recarga: C$50.00 (5 viajes)
Comisiones pendientes: C$50.00

Retención: Sí (40%)
Razón: Aún hay comisiones pendientes
```

---

## ⚠️ **REGLAS IMPORTANTES**

1. **Retención del 40%:**
   - Se aplica sobre el **total bruto** (totalEarnings)
   - Se aplica si hay **cualquier comisión pendiente**
   - No importa el monto pendiente

2. **Verificación de Recargas:**
   - Solo admin puede verificar/rechazar
   - Requiere comprobante de pago
   - Una vez verificada, no se puede revertir

3. **Viajes Cubiertos:**
   - Una vez incluidos en recarga verificada, no se pueden usar en otra
   - Se guardan en `ride_ids` de la recarga

4. **Métodos de Pago Aceptados:**
   - Transferencia bancaria
   - Depósito en efectivo
   - Tarjeta
   - Otros (especificar)

---

## 🚀 **DEPLOYMENT**

### **1. Actualizar schema en Supabase:**
```sql
-- Agregar payment_type a rides
ALTER TABLE rides 
ADD COLUMN payment_type VARCHAR(20) DEFAULT 'cash';

-- Crear tabla cash_recharges
CREATE TABLE cash_recharges (...);
```

### **2. Desplegar funciones:**
```bash
cd functions
npm run build
firebase deploy --only functions:getPendingCashRides,createCashRecharge,getDriverRecharges,verifyRecharge,calculateCashCommissionRetention
```

### **3. Re-desplegar funciones actualizadas:**
```bash
firebase deploy --only functions:requestRide,getDriverEarnings
```

---

## ✅ **CHECKLIST**

### **Backend:**
- [x] Agregar `payment_type` a tabla `rides`
- [x] Crear tabla `cash_recharges`
- [x] Actualizar `requestRide()` para incluir payment_type
- [x] Crear `getPendingCashRides()`
- [x] Crear `createCashRecharge()`
- [x] Crear `getDriverRecharges()`
- [x] Crear `verifyRecharge()`
- [x] Crear `calculateCashCommissionRetention()`
- [x] Actualizar `getDriverEarnings()` con retención
- [x] Exportar funciones en `index.ts`
- [ ] Testing completo

### **Frontend:**
- [ ] Actualizar `SearchRideScreen` con selector de pago
- [ ] Actualizar `AvailableRidesScreen` para mostrar método
- [ ] Actualizar `EarningsScreen` con sección de recargas
- [ ] Crear `CashRechargeScreen`
- [ ] Crear `RechargeHistoryScreen`
- [ ] Crear `cashRechargeService.ts`
- [ ] Agregar navegación
- [ ] Testing UI

### **Base de Datos:**
- [ ] Ejecutar ALTER TABLE en Supabase
- [ ] Ejecutar CREATE TABLE en Supabase
- [ ] Verificar índices
- [ ] Testing de queries

---

## 💡 **VENTAJAS**

1. ✅ **Control de comisiones:** Todas las comisiones se cobran
2. ✅ **Incentivo:** Conductor pierde 40% si no recarga
3. ✅ **Transparencia:** Conductor ve exactamente cuánto debe
4. ✅ **Flexibilidad:** Múltiples métodos de depósito
5. ✅ **Verificación:** Admin verifica cada recarga
6. ✅ **Historial:** Registro completo de todas las recargas

---

## 📊 **MÉTRICAS A MONITOREAR**

1. **Tasa de recarga:**
   - % de conductores que recargan a tiempo
   - Promedio de días para recargar

2. **Retenciones aplicadas:**
   - Cantidad de conductores con retención
   - Monto total retenido por mes

3. **Viajes en efectivo:**
   - % de viajes pagados en efectivo
   - Tendencia mensual

4. **Comisiones pendientes:**
   - Monto total pendiente
   - Por conductor

---

**Implementado por:** Cascade AI  
**Fecha:** 2025-10-13  
**Estado:** ✅ **BACKEND LISTO - PENDIENTE FRONTEND**
