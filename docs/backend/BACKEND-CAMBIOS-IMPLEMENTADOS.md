# 🔧 Backend - Cambios Implementados

**Fecha**: 2025-10-08 00:06  
**Estado**: ✅ Completado

---

## ✅ CAMBIOS REALIZADOS

### **1. Entidad Ride Actualizada**

**Archivo**: `Backend/src/rides/entities/ride.entity.ts`

**Nuevos campos agregados:**

```typescript
// Enum para tipo de viaje
export enum RideType {
  NORMAL = 'normal',
  DESIGNATED_DRIVER = 'designated_driver',
}

// Campos en la entidad
@Column({
  type: 'enum',
  enum: RideType,
  default: RideType.NORMAL,
})
rideType: RideType;

@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
clientSuggestedPrice: number;

@Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
driverProposedPrice: number;

@Column({ type: 'text', nullable: true })
notes: string;
```

---

### **2. DTOs Actualizados**

#### **RequestRideDto** (`dto/request-ride.dto.ts`)

```typescript
@IsEnum(RideType)
@IsOptional()
rideType?: RideType;

@IsNumber()
@IsOptional()
clientSuggestedPrice?: number;

@IsString()
@IsOptional()
notes?: string;
```

#### **AcceptRideDto** (NUEVO - `dto/accept-ride.dto.ts`)

```typescript
export class AcceptRideDto {
  @IsUUID('4')
  driverId: string;

  @IsNumber()
  @IsOptional()
  driverProposedPrice?: number;
}
```

---

### **3. Servicio Actualizado**

**Archivo**: `Backend/src/rides/rides.service.ts`

#### **Método `requestRide` actualizado:**

```typescript
async requestRide(requestRideDto: RequestRideDto): Promise<Ride> {
  const ride = this.rideRepository.create({
    clientId: requestRideDto.clientId,
    originLat: requestRideDto.origin.lat,
    originLng: requestRideDto.origin.lng,
    originAddress: requestRideDto.origin.address || '',
    destinationLat: requestRideDto.destination.lat,
    destinationLng: requestRideDto.destination.lng,
    destinationAddress: requestRideDto.destination.address || '',
    rideType: requestRideDto.rideType || RideType.NORMAL,
    clientSuggestedPrice: requestRideDto.clientSuggestedPrice,
    notes: requestRideDto.notes,
    status: RideStatus.REQUESTED,
    estimatedDistance: 0, // TODO: Calcular con TomTom
    estimatedDuration: 0, // TODO: Calcular con TomTom
    estimatedFare: requestRideDto.clientSuggestedPrice || 0,
  });
  return this.rideRepository.save(ride);
}
```

#### **Nuevo método: `findAvailableRides`**

```typescript
async findAvailableRides(
  lat?: number,
  lng?: number,
  radius?: number,
  rideType?: RideType,
): Promise<Ride[]> {
  const queryBuilder = this.rideRepository
    .createQueryBuilder('ride')
    .leftJoinAndSelect('ride.client', 'client')
    .where('ride.status = :status', { status: RideStatus.REQUESTED })
    .orderBy('ride.createdAt', 'DESC');

  if (rideType) {
    queryBuilder.andWhere('ride.rideType = :rideType', { rideType });
  }

  return queryBuilder.getMany();
}
```

#### **Nuevo método: `acceptRide`**

```typescript
async acceptRide(rideId: string, acceptRideDto: AcceptRideDto): Promise<Ride> {
  const ride = await this.findOne(rideId);

  if (ride.status !== RideStatus.REQUESTED) {
    throw new BadRequestException('This ride is no longer available');
  }

  if (ride.driverId) {
    throw new BadRequestException('This ride has already been accepted by another driver');
  }

  ride.driverId = acceptRideDto.driverId;
  if (acceptRideDto.driverProposedPrice !== undefined) {
    ride.driverProposedPrice = acceptRideDto.driverProposedPrice;
  }
  ride.status = RideStatus.ACCEPTED;
  ride.acceptedAt = new Date();

  return this.rideRepository.save(ride);
}
```

---

### **4. Controlador Actualizado**

**Archivo**: `Backend/src/rides/rides.controller.ts`

#### **Nuevo endpoint: GET /api/rides/available/list**

```typescript
@Get('available/list')
findAvailableRides(
  @Query('lat') lat?: number,
  @Query('lng') lng?: number,
  @Query('radius') radius?: number,
  @Query('rideType') rideType?: RideType,
) {
  return this.ridesService.findAvailableRides(lat, lng, radius, rideType);
}
```

**Uso:**
```bash
GET /api/rides/available/list
GET /api/rides/available/list?rideType=normal
GET /api/rides/available/list?rideType=designated_driver
GET /api/rides/available/list?lat=14.6349&lng=-90.5069&radius=5000
```

#### **Nuevo endpoint: POST /api/rides/:id/accept**

```typescript
@Post(':id/accept')
acceptRide(
  @Param('id') id: string,
  @Body() acceptRideDto: AcceptRideDto,
) {
  return this.ridesService.acceptRide(id, acceptRideDto);
}
```

**Uso:**
```bash
POST /api/rides/123e4567-e89b-12d3-a456-426614174000/accept
Body: {
  "driverId": "driver-uuid",
  "driverProposedPrice": 150
}
```

---

### **5. Migración de Base de Datos**

**Archivo**: `Backend/src/migrations/1733634382000-AddRideTypeAndPricing.ts`

**Cambios en la tabla `rides`:**
- ✅ Columna `rideType` (enum: 'normal' | 'designated_driver')
- ✅ Columna `clientSuggestedPrice` (decimal, nullable)
- ✅ Columna `driverProposedPrice` (decimal, nullable)
- ✅ Columna `notes` (text, nullable)

**Ejecutar migración:**
```bash
npm run migration:run
```

---

## 📡 ENDPOINTS DISPONIBLES

### **Para Clientes:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| POST | `/api/rides/request` | Solicitar viaje (normal o conductor designado) |
| GET | `/api/rides/client/:clientId` | Ver mis viajes |
| PATCH | `/api/rides/:id/cancel` | Cancelar viaje |

### **Para Conductores:**

| Método | Endpoint | Descripción |
|--------|----------|-------------|
| GET | `/api/rides/available/list` | Ver solicitudes disponibles |
| GET | `/api/rides/available/list?rideType=designated_driver` | Filtrar por tipo |
| POST | `/api/rides/:id/accept` | Aceptar un viaje |
| GET | `/api/rides/driver/:driverId` | Ver mis viajes aceptados |

---

## 🧪 EJEMPLOS DE USO

### **1. Cliente solicita viaje normal:**

```json
POST /api/rides/request
{
  "clientId": "client-uuid",
  "origin": {
    "lat": 14.6349,
    "lng": -90.5069,
    "address": "Zona 10, Guatemala"
  },
  "destination": {
    "lat": 14.5833,
    "lng": -90.5167,
    "address": "Aeropuerto La Aurora"
  },
  "rideType": "normal",
  "notes": "Distancia: 5.2 km, Duración: 15 min, Precio: C$150"
}
```

### **2. Cliente solicita conductor designado:**

```json
POST /api/rides/request
{
  "clientId": "client-uuid",
  "origin": {
    "lat": 14.6349,
    "lng": -90.5069,
    "address": "Centro Histórico"
  },
  "destination": {
    "lat": 14.6500,
    "lng": -90.5100,
    "address": "Carretera al Sur"
  },
  "rideType": "designated_driver",
  "clientSuggestedPrice": 200,
  "notes": "🚗 Conductor Designado | Distancia: 3.8 km"
}
```

### **3. Conductor ve solicitudes disponibles:**

```bash
GET /api/rides/available/list

Response:
[
  {
    "id": "ride-uuid-1",
    "client": {
      "id": "client-uuid",
      "name": "María González",
      "email": "maria@example.com"
    },
    "originLat": 14.6349,
    "originLng": -90.5069,
    "originAddress": "Zona 10, Guatemala",
    "destinationLat": 14.5833,
    "destinationLng": -90.5167,
    "destinationAddress": "Aeropuerto La Aurora",
    "rideType": "normal",
    "estimatedFare": 150,
    "status": "requested",
    "createdAt": "2025-10-08T06:00:00Z"
  },
  {
    "id": "ride-uuid-2",
    "client": {
      "id": "client-uuid-2",
      "name": "Juan Pérez"
    },
    "rideType": "designated_driver",
    "clientSuggestedPrice": 200,
    ...
  }
]
```

### **4. Conductor acepta viaje:**

```json
POST /api/rides/ride-uuid-1/accept
{
  "driverId": "driver-uuid",
  "driverProposedPrice": 180
}

Response:
{
  "id": "ride-uuid-1",
  "status": "accepted",
  "driverId": "driver-uuid",
  "driverProposedPrice": 180,
  "acceptedAt": "2025-10-08T06:05:00Z",
  ...
}
```

---

## ⚠️ PENDIENTES / TODO

### **1. Integración con TomTom en Backend**

Actualmente los campos `estimatedDistance` y `estimatedDuration` se guardan como 0. Necesitan calcularse:

```typescript
// TODO en requestRide:
const route = await tomtomService.getDirections(
  { lat: origin.lat, lng: origin.lng },
  { lat: destination.lat, lng: destination.lng }
);

ride.estimatedDistance = route.distance / 1000; // km
ride.estimatedDuration = route.duration / 60; // min
```

### **2. Filtro por Radio de Distancia**

El método `findAvailableRides` acepta `lat`, `lng` y `radius` pero no los usa aún. Necesita:

```sql
-- Función de distancia geográfica en PostgreSQL
SELECT *, 
  (6371 * acos(cos(radians(:lat)) * cos(radians(originLat)) * 
  cos(radians(originLng) - radians(:lng)) + 
  sin(radians(:lat)) * sin(radians(originLat)))) AS distance
FROM rides
WHERE status = 'requested'
HAVING distance < :radius
ORDER BY distance;
```

### **3. WebSockets para Actualizaciones en Tiempo Real**

Implementar notificaciones push cuando:
- Nueva solicitud de viaje disponible
- Conductor acepta viaje
- Cambios de estado del viaje

---

## 🚀 CÓMO PROBAR

### **1. Ejecutar migración:**

```bash
cd Backend
npm run migration:run
```

### **2. Iniciar backend:**

```bash
npm run start:dev
```

### **3. Probar endpoints con Postman/Thunder Client:**

```bash
# Ver solicitudes disponibles
GET http://localhost:3000/api/rides/available/list

# Solicitar viaje
POST http://localhost:3000/api/rides/request
Content-Type: application/json
{
  "clientId": "existing-user-uuid",
  "origin": { "lat": 14.6349, "lng": -90.5069, "address": "Zona 10" },
  "destination": { "lat": 14.5833, "lng": -90.5167, "address": "Aeropuerto" },
  "rideType": "designated_driver"
}

# Aceptar viaje
POST http://localhost:3000/api/rides/{ride-id}/accept
{
  "driverId": "existing-driver-uuid",
  "driverProposedPrice": 150
}
```

---

## ✅ RESUMEN

**Archivos creados:**
- ✅ `dto/accept-ride.dto.ts`
- ✅ `migrations/1733634382000-AddRideTypeAndPricing.ts`

**Archivos modificados:**
- ✅ `entities/ride.entity.ts` - Agregados 4 campos nuevos
- ✅ `dto/request-ride.dto.ts` - Agregados 3 campos opcionales
- ✅ `rides.service.ts` - 2 métodos nuevos + actualización de requestRide
- ✅ `rides.controller.ts` - 2 endpoints nuevos

**Endpoints nuevos:**
- ✅ `GET /api/rides/available/list` - Ver solicitudes
- ✅ `POST /api/rides/:id/accept` - Aceptar viaje

**Base de datos:**
- ✅ Migración lista para ejecutar

---

**¡Backend completamente actualizado y listo para probar!** 🎉
