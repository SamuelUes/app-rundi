# 🛡️ Guards y Decorators - Guía de Uso

## 📋 Archivos Creados

```
src/
├── common/
│   ├── guards/
│   │   └── roles.guard.ts         ✅ Guard para protección por roles
│   └── decorators/
│       ├── roles.decorator.ts     ✅ Decorator @Roles()
│       └── current-user.decorator.ts  ✅ Decorator @CurrentUser()
```

---

## 🛡️ RolesGuard

Guard que verifica si el usuario tiene los roles requeridos para acceder a una ruta.

### **Cómo Funciona**

1. Lee los roles requeridos del metadata usando Reflector
2. Obtiene el usuario de `request.user` (inyectado por Firebase Auth Middleware)
3. Verifica si el rol del usuario coincide con alguno de los roles requeridos

### **Uso Básico**

```typescript
import { UseGuards } from '@nestjs/common';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { UserRole } from '../users/entities/user.entity';

@Controller('users')
@UseGuards(RolesGuard) // Aplicar guard a todo el controller
export class UsersController {
  
  @Get()
  @Roles(UserRole.ADMIN) // Solo admins pueden listar usuarios
  findAll() {
    return this.usersService.findAll();
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN) // Solo admins pueden eliminar
  delete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
```

---

## 🎯 @Roles Decorator

Decorator para especificar qué roles pueden acceder a una ruta.

### **Sintaxis**

```typescript
@Roles(...roles: UserRole[])
```

### **Ejemplos**

```typescript
// Un solo rol
@Roles(UserRole.ADMIN)

// Múltiples roles (el usuario debe tener al menos uno)
@Roles(UserRole.ADMIN, UserRole.DRIVER)

// En controladores completos
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  // Todas las rutas requieren ser ADMIN
}
```

---

## 👤 @CurrentUser Decorator

Decorator para obtener el usuario autenticado actual de la request.

### **Uso Básico**

```typescript
import { CurrentUser } from '../common/decorators/current-user.decorator';

@Get('profile')
getProfile(@CurrentUser() user: any) {
  console.log(user); // { uid: '123', email: 'user@test.com', ... }
  return this.usersService.findOne(user.uid);
}
```

### **Ejemplos Avanzados**

```typescript
// Obtener solo el ID del usuario
@Get('my-rides')
getMyRides(@CurrentUser() user: any) {
  return this.ridesService.findByClient(user.uid);
}

// Usar en combinación con otros decorators
@Post('rides')
@Roles(UserRole.CLIENT)
createRide(
  @CurrentUser() user: any,
  @Body() createRideDto: CreateRideDto,
) {
  return this.ridesService.create(user.uid, createRideDto);
}

// Validar que el usuario solo acceda a sus propios datos
@Patch('rides/:id')
updateRide(
  @CurrentUser() user: any,
  @Param('id') id: string,
  @Body() updateDto: UpdateRideDto,
) {
  // Validar que el ride pertenezca al usuario
  return this.ridesService.update(user.uid, id, updateDto);
}
```

---

## 🎯 Ejemplos Completos por Módulo

### **Users Controller**

```typescript
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  
  // Público - Sin protección de roles
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

  // Usuario autenticado - Su propio perfil
  @Get('profile')
  getProfile(@CurrentUser() user: any) {
    return this.usersService.findOne(user.uid);
  }

  // Solo admins
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.usersService.findAll();
  }

  // Solo admins
  @Delete(':id')
  @Roles(UserRole.ADMIN)
  delete(@Param('id') id: string) {
    return this.usersService.delete(id);
  }
}
```

### **Drivers Controller**

```typescript
@Controller('drivers')
@UseGuards(RolesGuard)
export class DriversController {
  
  // Solo conductores pueden actualizar su ubicación
  @Patch('location')
  @Roles(UserRole.DRIVER)
  updateLocation(
    @CurrentUser() user: any,
    @Body() locationDto: UpdateLocationDto,
  ) {
    return this.driversService.updateLocation(user.uid, locationDto);
  }

  // Solo conductores cambian su estado
  @Patch('status')
  @Roles(UserRole.DRIVER)
  updateStatus(
    @CurrentUser() user: any,
    @Body('status') status: DriverStatus,
  ) {
    return this.driversService.updateStatus(user.uid, status);
  }

  // Admins pueden ver todos los conductores
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.driversService.findAll();
  }
}
```

### **Rides Controller**

```typescript
@Controller('rides')
@UseGuards(RolesGuard)
export class RidesController {
  
  // Solo clientes solicitan viajes
  @Post('request')
  @Roles(UserRole.CLIENT)
  requestRide(
    @CurrentUser() user: any,
    @Body() requestRideDto: RequestRideDto,
  ) {
    return this.ridesService.requestRide(user.uid, requestRideDto);
  }

  // Cliente ve sus propios viajes
  @Get('my-rides')
  @Roles(UserRole.CLIENT)
  getMyRides(@CurrentUser() user: any) {
    return this.ridesService.findByClient(user.uid);
  }

  // Conductor ve sus viajes asignados
  @Get('my-assignments')
  @Roles(UserRole.DRIVER)
  getMyAssignments(@CurrentUser() user: any) {
    return this.ridesService.findByDriver(user.uid);
  }

  // Solo conductores aceptan viajes
  @Patch(':id/accept')
  @Roles(UserRole.DRIVER)
  acceptRide(
    @CurrentUser() user: any,
    @Param('id') id: string,
  ) {
    return this.ridesService.accept(id, user.uid);
  }

  // Admins ven todos los viajes
  @Get()
  @Roles(UserRole.ADMIN)
  findAll() {
    return this.ridesService.findAll();
  }
}
```

---

## ⚠️ Consideraciones Importantes

### **1. Firebase Auth Middleware**

El `RolesGuard` depende de que el usuario esté en `request.user`. Esto se configura en el `FirebaseAuthMiddleware`:

```typescript
// En auth.middleware.ts
req.user = decoded; // { uid, email, role, ... }
```

### **2. Sin Firebase (Desarrollo)**

Durante desarrollo sin Firebase, el middleware ya está configurado para retornar datos mock:

```typescript
{
  uid: 'dev-user-123',
  email: 'dev@test.com',
  role: 'client',
}
```

### **3. Roles en Base de Datos**

Los roles se almacenan en la tabla `users`:

```typescript
export enum UserRole {
  CLIENT = 'client',
  DRIVER = 'driver',
  ADMIN = 'admin',
}
```

### **4. Protección Global vs Específica**

```typescript
// Proteger todo el controller
@Controller('admin')
@UseGuards(RolesGuard)
@Roles(UserRole.ADMIN)
export class AdminController {
  // Todas las rutas requieren ADMIN
}

// Proteger rutas específicas
@Controller('users')
@UseGuards(RolesGuard)
export class UsersController {
  
  @Get() // Sin @Roles = acceso público
  publicRoute() {}

  @Get('protected')
  @Roles(UserRole.ADMIN) // Solo admins
  protectedRoute() {}
}
```

---

## 🚀 Próximos Pasos

### **Implementar en Otros Controllers**

Aplica los guards y decorators en:
- ✅ UsersController (ejemplo implementado)
- ⏳ DriversController
- ⏳ RidesController
- ⏳ PaymentsController

### **Mejoras Futuras**

1. **Custom Guard para Ownership**
   ```typescript
   // Verificar que el usuario solo acceda a sus propios recursos
   @UseGuards(OwnershipGuard)
   @Patch('rides/:id')
   updateMyRide(@Param('id') id: string) {}
   ```

2. **Guard Composable**
   ```typescript
   @UseGuards(RolesGuard, OwnershipGuard)
   ```

3. **Decorator Combinado**
   ```typescript
   @RolesAndOwnership(UserRole.CLIENT)
   ```

4. **Rate Limiting por Usuario**
   ```typescript
   @UseGuards(UserRateLimitGuard)
   ```

---

## 📚 Referencias

- [NestJS Guards](https://docs.nestjs.com/guards)
- [NestJS Custom Decorators](https://docs.nestjs.com/custom-decorators)
- [Role-Based Access Control (RBAC)](https://docs.nestjs.com/security/authorization#role-based-authentication)

---

**¡El backend ahora tiene protección por roles profesional!** 🛡️
