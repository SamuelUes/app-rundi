# Código estable de tracking por viaje — Diseño

## Objetivo

Al compartir varias veces el mismo viaje, reutilizar el mismo código de tracking mientras siga vigente. Conservar la expiración actual de cuatro horas; una nueva solicitud puede obtener un código nuevo solo después de expirar el anterior.

## Contexto confirmado

- `createRideShareToken` genera un código aleatorio en cada invocación y guarda una entrada por código bajo `rideTrackingCodes/{code}`. No consulta códigos existentes por `rideId`, por lo que cada pulsación agrega otra entrada.
- El resolver público obtiene `rideId` desde `rideTrackingCodes/{code}` y rechaza los códigos expirados. No devuelve el `rideId` real cuando el acceso se hace por código.
- Las reglas actuales bloquean lectura y escritura de cliente en `rideTrackingCodes`; Admin SDK escribe en el backend.
- Puede haber varias entradas legacy vigentes para un mismo viaje. No se borrarán ni se acortará su vigencia. Al inicializar el índice nuevo, se escogerá la entrada vigente más reciente para reutilizarla.

## Diseño aprobado

### Índice privado por viaje

Añadir en el árbol privado existente `rideTrackingCodes/_byRide/{rideId}` un registro canónico que contenga el código activo, su fecha de creación y expiración. El segmento `_byRide` no pertenece al alfabeto de códigos, y las reglas heredadas del nodo mantienen este índice inaccesible desde clientes.

### Creación/reutilización idempotente

1. Mantener la autenticación y la autorización actual: solo el cliente o conductor participante puede solicitar el código.
2. Consultar el índice por viaje. Si apunta a un código vigente, devolver ese código sin cambiar su expiración.
3. Si no hay índice, consultar los códigos legacy de ese viaje y adoptar el más reciente que siga vigente. Añadir un índice RTDB por `rideId` para evitar recorrer la tabla completa.
4. Si no existe código vigente, seleccionar un código nuevo y usar una transacción en el índice por viaje. Solicitudes concurrentes para el mismo viaje deben converger al registro que confirmó la transacción.
5. Asegurar que `rideTrackingCodes/{code}` resuelve al mismo viaje antes de devolver el código. Si existe un código asociado a otro viaje, generar otro candidato sin reemplazar el índice canónico de otra solicitud.
6. Mantener el resolver público y su respuesta/expiración actuales. No eliminar los códigos legacy ni los expirados como parte del cambio.

### Expiración

El TTL continúa siendo cuatro horas desde la creación del código canónico. Las solicitudes durante esa ventana reutilizan el código y no extienden silenciosamente la vigencia. Una vez vencido, la siguiente solicitud crea un código y un vencimiento nuevos.

## Seguridad y compatibilidad

- No cambiar `context.auth`, la comprobación de participación, App Check, reglas de lectura/escritura ni acceso público al tracking.
- No guardar el índice fuera del subárbol ya restringido ni devolver `rideId` al usuario público.
- Los enlaces legacy siguen resolviendo hasta su propia expiración.
- La aplicación cliente mantiene el contrato `{ code, expiresInHours }`; el cambio es interno al backend y al índice RTDB.

## Verificación y criterios de aceptación

1. Dos solicitudes secuenciales para el mismo viaje antes del vencimiento retornan exactamente el mismo código y no crean otro nodo de código.
2. Solicitudes simultáneas para el mismo viaje convergen al mismo código.
3. En el primer uso después del despliegue, una entrada legacy vigente se adopta en vez de generar otro código; si hay varias, se adopta la más reciente.
4. Un código expirado no se devuelve; la siguiente solicitud crea un código nuevo con TTL de cuatro horas.
5. Una colisión de código no sobrescribe una entrada perteneciente a otro viaje.
6. Usuario no autenticado sigue recibiendo `unauthenticated`; un usuario ajeno al viaje sigue recibiendo `permission-denied`.
7. El resolver público sigue aceptando códigos vigentes y rechazando expirados, y no filtra el `rideId` cuando se consulta por código.
8. Typecheck/build de Functions, pruebas disponibles y validación sintáctica de reglas pasan. No desplegar Functions ni reglas remotas como parte de esta implementación.
