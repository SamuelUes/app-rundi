# 🗄️ Sequelize ORM - Migración SQL

Este directorio contiene la implementación de Sequelize ORM para reemplazar las consultas SQL directas.

## 📁 Estructura

```
sequelize/
├── config/
│   ├── database.ts       # Configuración de conexión
│   └── sequelize.ts      # Configuración de modelos
├── models/
│   ├── Ride.ts           # Modelo de viajes
│   ├── Payment.ts        # Modelo de pagos
│   ├── Driver.ts         # Modelo de conductores
│   ├── Rating.ts         # Modelo de calificaciones
│   └── index.ts          # Índice con asociaciones
├── repositories/
│   ├── RideRepository.ts
│   ├── PaymentRepository.ts
│   ├── RatingRepository.ts
│   ├── DriverRepository.ts
│   └── index.ts
├── services/
│   ├── RideService.ts
│   ├── PaymentService.ts
│   ├── RatingService.ts
│   └── index.ts
├── migrations/
│   ├── 001_create_rides.ts
│   ├── 002_create_payments.ts
│   ├── 003_create_drivers.ts
│   ├── 004_create_ratings.ts
│   └── runMigrations.ts
└── README.md
```

## 🚀 Instalación

### 1. Instalar dependencias

```bash
npm install sequelize pg pg-hstore dotenv
npm install --save-dev @types/sequelize
```

### 2. Configurar variables de entorno

Crear archivo `.env` en la carpeta `functions/`:

```env
DB_NAME=driveangel
DB_USER=postgres
DB_PASSWORD=tu_contraseña
DB_HOST=localhost
DB_PORT=5432
NODE_ENV=development
```

### 3. Ejecutar migraciones

```bash
# Compilar TypeScript
npm run build

# Ejecutar migraciones
npx ts-node src/sequelize/migrations/runMigrations.ts
```

## 📊 Modelos

### Ride
- `id` (UUID, PK)
- `firebase_ride_id` (STRING, UNIQUE)
- `client_id` (STRING)
- `driver_id` (STRING)
- `status` (ENUM: requested, accepted, in_progress, completed, canceled)
- `origin_lat`, `origin_lng`, `destination_lat`, `destination_lng`
- `estimated_price`, `final_fare`, `distance`, `duration`
- `created_at`, `completed_at`, `canceled_at`

### Payment
- `id` (UUID, PK)
- `ride_id` (UUID, FK → Ride)
- `amount`, `tip`, `commission`
- `payment_method` (ENUM: cash, card, bank_transfer)
- `status` (ENUM: pending, completed, failed, canceled)
- `cancel_reason`
- `created_at`, `paid_at`, `updated_at`

### Driver
- `id` (UUID, PK)
- `user_id` (STRING, UNIQUE)
- `license_number`, `license_expiry`
- `average_rating`, `total_rides`, `total_earnings`
- `status` (ENUM: active, inactive, suspended)
- `created_at`, `updated_at`

### Rating
- `id` (UUID, PK)
- `ride_id` (UUID, FK → Ride)
- `from_user_id`, `to_user_id` (STRING)
- `rating` (INTEGER: 1-5)
- `comment`
- `punctuality`, `cleanliness`, `communication`, `driving`, `safety`, `friendliness`
- `created_at`

## 🔗 Asociaciones

- **Ride ↔ Payment**: 1:1 (hasOne/belongsTo)
- **Driver ↔ Rating**: 1:N (hasMany/belongsTo)

## 📝 Uso en Cloud Functions

### Antes (SQL Directo)
```typescript
const result = await client.query(
  'SELECT * FROM payments WHERE ride_id = $1',
  [rideId]
);
const payment = result.rows[0];
```

### Después (Sequelize)
```typescript
import { PaymentService } from '../sequelize/services/PaymentService';

const paymentService = new PaymentService();
const payment = await paymentService.getPaymentByRide(rideId);
```

## 🧪 Testing

```bash
# Tests unitarios
npm test

# Tests con coverage
npm test -- --coverage
```

## 📚 Documentación Completa

Ver documentación en: `docs/sequelize/`

- `01_PLAN_MIGRACION_SEQUELIZE.md` - Plan completo
- `02_MODELOS_SEQUELIZE.md` - Definición de modelos
- `03_REPOSITORIES_SERVICES.md` - Repositories y Services
- `04_EJEMPLOS_MIGRACION.md` - Ejemplos prácticos
- `05_CHECKLIST_MIGRACION.md` - Checklist de tareas
- `06_GUIA_PASO_A_PASO.md` - Guía paso a paso

## 🔄 Migraciones

### Crear nueva migración

```typescript
// migrations/005_create_vehicles.ts
import { QueryInterface, DataTypes } from 'sequelize';

export async function up(queryInterface: QueryInterface) {
  await queryInterface.createTable('vehicles', {
    // ... definición de columnas
  });
}

export async function down(queryInterface: QueryInterface) {
  await queryInterface.dropTable('vehicles');
}
```

### Ejecutar migraciones

```bash
npx ts-node src/sequelize/migrations/runMigrations.ts
```

## 🐛 Troubleshooting

### Error: "Cannot find module 'sequelize'"
```bash
npm install sequelize pg pg-hstore @types/sequelize
```

### Error: "Connection refused"
Verificar que PostgreSQL está corriendo y las credenciales en `.env` son correctas.

### Error: "Table already exists"
Las migraciones detectan si la tabla ya existe y saltan automáticamente.

## 📞 Soporte

Para preguntas o problemas, revisar:
1. `docs/sequelize/` - Documentación completa
2. [Sequelize Docs](https://sequelize.org/)
3. [PostgreSQL Docs](https://www.postgresql.org/docs/)

---

**Última actualización:** 2025-10-26  
**Estado:** ✅ Migraciones completadas
