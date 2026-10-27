# Código de verificación para inicio de viaje — Diseño

## Objetivo

Para viajes normales (`rideType` distinto de `designated_driver`, vehículos auto y moto), generar un código de 4 dígitos que el cliente ve en su app y dicta al conductor al abordar. El conductor debe ingresarlo para poder iniciar el viaje (`driver_on_route`/`driver_arrived` → `in_progress`). Sin código válido, el viaje no arranca.

## Contexto confirmado

- Los viajes viven en RTDB `activeRides/{rideId}` (espejo en tiempo real) y PostgreSQL vía Sequelize (fuente de verdad de transiciones). Estados: `accepted → driver_on_route → driver_arrived → in_progress → pending_payment → completed`.
- Las reglas RTDB permiten leer `activeRides/{rideId}` tanto al cliente como al conductor — un campo nuevo ahí sería legible por el conductor y la verificación se podría saltar.
- `onActiveRidesWrite` (`functions/src/triggers/onActiveRidesWrite.ts`) ya es un trigger `onWrite` sobre `activeRides/{rideId}` que despacha por transición de estado.
- Un viaje llega a `accepted` por múltiples caminos: `acceptRide`, `confirmDriver`, `acceptClientPrice`, `acceptCounterOffer` y la activación de viajes programados (`scheduled/programmedRides.ts`).
- `startRide` (`functions/src/api/rides_sequelize.ts`) valida ownership temprano contra `activeRides`, tiene rama `IS_LOAD_TEST`, y luego llama `rideService.startRide` + sincroniza `activeRides`.
- Existe precedente de código corto: `generateCashCode` (4 dígitos, `randomInt(0,10000).padStart(4,'0')`) en `payments_sequelize.ts`.
- El frontend ya tiene `OtpCodeInput` (`components/ui/OtpCodeInput.tsx`) para entrada de códigos, `useFirebaseItem` para listeners RTDB, y `DesignatedDriverEvidenceModal` como patrón de modal en `components/driver/ActiveRide/`.
- `cleanupRideFromRealtime` (`helpers/cleanupHelpers.ts`) hace borrado multi-path; `handleDelayedRideStatus` (`helpers/cloudTasks.ts`) acción `cleanup_active_ride` borra solo `activeRides/{rideId}`.

## Diseño aprobado

### Almacenamiento: nodo dedicado `rideVerificationCodes/{rideId}`

```
rideVerificationCodes/{rideId}: {
  code: "4831",          // string de 4 dígitos
  clientId: string,      // para la regla de lectura
  driverId: string,
  createdAt: timestamp,
  attempts: 0            // intentos fallidos del conductor
}
```

Separado de `activeRides` porque el conductor no debe poder leerlo.

### Generación — trigger sobre `activeRides`

Nuevo caso en `onActiveRidesWrite`: cuando el estado entra a `accepted` (o a `driver_on_route`/`driver_arrived` como red de seguridad si el nodo de código aún no existe) y el viaje no es `designated_driver`, escribir el nodo con un código aleatorio de 4 dígitos. Idempotente: si ya existe `code`, no regenerar. Cubre todos los caminos a `accepted` sin tocar cada endpoint.

### Validación — `startRide`

1. `StartRideSchema` acepta `pickupCode` opcional (string).
2. En `startRide`, para viajes normales (no designated), si existe `rideVerificationCodes/{rideId}`:
   - `pickupCode` ausente o con formato inválido → `failed-precondition` pidiendo el código.
   - `pickupCode` no coincide → `attempts + 1` y error `failed-precondition` "código incorrecto".
   - `attempts` llega a 10 → se regenera un código nuevo, `attempts` se resetea a 0 y se devuelve el error de código incorrecto (el cliente ve el nuevo código en vivo por su listener; auto-recuperación sin soporte).
   - Coincide → flujo normal a `in_progress`.
3. Si el nodo NO existe para un viaje normal → viaje legacy (anterior al despliegue): fail-open, permite iniciar y registra warning en log.
4. `IS_LOAD_TEST` salta la validación, igual que la inspección de designated driver.
5. Los viajes `designated_driver` no requieren código (mantienen su flujo de inspección).

### Reglas RTDB

```json
"rideVerificationCodes": {
  "$rideId": {
    ".read": "auth != null && data.child('clientId').val() === auth.uid",
    ".write": false
  }
}
```

Solo el cliente lee; solo Admin SDK escribe.

### Limpieza

- Agregar `rideVerificationCodes/${rideId}` al borrado multi-path de `cleanupRideFromRealtime`.
- En `handleDelayedRideStatus` acción `cleanup_active_ride`, borrar también `rideVerificationCodes/{rideId}`.

### Cliente — `RideTrackingScreenNewDesign.tsx`

Componente flotante nuevo `RideVerificationCodeCard` en `components/client/RideTracking/`, posicionado sobre el mapa (patrón de `RideTrackingDesignatedDriverNotice`). Escucha `rideVerificationCodes/{rideId}` con `useFirebaseItem`. Visible cuando `status ∈ {accepted, driver_on_route, driver_arrived}` y el viaje no es designated. Muestra los 4 dígitos en grande y el texto "Dile este código a tu conductor". Se oculta al pasar a `in_progress` o si no hay código.

### Conductor — `ActiveRideScreen.tsx`

Modal nuevo `RideVerificationCodeModal` en `components/driver/ActiveRide/` (patrón de `DesignatedDriverEvidenceModal`): `OtpCodeInput` de 4 dígitos, botón confirmar con spinner, error inline y limpieza del input si el código es incorrecto. `handleStartRide`: para viajes normales abre el modal en vez de llamar `startRide` directo; el submit llama `ridesService.updateRideStatus(rideId, 'in_progress', { pickupCode })`. `ridesService.updateRideStatus` pasa `pickupCode` al callable `startRide`. Viajes designated mantienen su flujo actual.

### i18n

Strings nuevas en `src/i18n/index.ts` (es/en): `shared.rideTracking.verificationCode.*` (título, hint, cargando) y `driver.activeRide.verification.*` (título del modal, placeholder, errores, confirmar).

## Seguridad y compatibilidad

- El código nunca se escribe en `activeRides` ni en ningún nodo legible por el conductor.
- Solo el `clientId` del viaje puede leer `rideVerificationCodes/{rideId}`.
- La validación es server-side; el frontend nunca compara códigos.
- Fail-open solo para viajes que quedaron `accepted` antes del despliegue del trigger.
- Sin cambios en `paymentStatus` ni en el flujo de pagos/códigos de efectivo existente.
- Los viajes programados normales reciben código automáticamente al activarse a `accepted`.

## Verificación y criterios de aceptación

1. Al pasar un viaje normal a `accepted` existe `rideVerificationCodes/{rideId}` con código de 4 dígitos; repetir la transición no lo regenera.
2. El cliente ve el código en `RideTracking` desde `accepted` hasta `driver_arrived`; desaparece en `in_progress`.
3. El conductor no puede leer `rideVerificationCodes/{rideId}` desde cliente (permission_denied).
4. `startRide` sin código o con código incorrecto en viaje normal → `failed-precondition`; con el código correcto → `in_progress`.
5. Tras 10 intentos fallidos el código se regenera y el cliente ve el nuevo.
6. Viaje legacy `accepted` sin nodo de código → `startRide` funciona sin código.
7. Viaje `designated_driver` → `startRide` sigue pidiendo inspección, no código.
8. Al archivar/limpiar el viaje se elimina `rideVerificationCodes/{rideId}`.
9. Typecheck/build de Functions y Frontend pasan; reglas RTDB validan sintaxis (`firebase deploy --only database` en emulador o `--dry-run`).
