# Rundi App — notas del agente

## Conductor designado con colega
- Emparejamiento en RTDB: `driverCrews/{captainId}`, `driverCrewMembership/{uid}`, `driverCrewInvites/{followerId}` (solo el backend escribe).
- El capitán es `activeRides.driverId` / `rides.driver_id`; el seguidor es `activeRides.followerId` / `rides.follower_driver_id`. Pago y comisión solo al capitán.
- Adjuntar/liberar seguidor: `functions/src/triggers/onActiveRidesWrite.ts` → `functions/src/helpers/designatedCrewStore.ts`. Abandono: `functions/src/triggers/driverOffline.ts`.
- Ubicación del seguidor: `activeRides/{id}/follower/location` (frontend: `updateFollowerRideLocation`, `updateTrackingRideId(rideId, 'follower')`).
- Foto del vehículo de llegada: `designatedArrivalPhotos/{uid}` en RTDB (12h), `rides.arrival_vehicle_photo` en Supabase; gate en `useArrivalPhotoGate`.
- Ganancias separadas: `earnings.normalEarnings` / `earnings.designatedEarnings` (con `±` vía `formatApproxAmount`).
- Calificación opcional por rol: `ratings.rated_role` = `captain|follower`; `submitRating` acepta `targetRole` + `finalize`.
- Migración aplicada: `database/migration-designated-driver-crew.sql` (baseline `database/supabase-only.sql`).

## i18n
- Traducciones divididas por locale y namespace: `Frontend/src/i18n/{en,es}/{common,authScreens,client,settings,driver,shared}.ts`; `zh` está vacío (stub en `zh/index.ts`).
- `src/i18n/index.ts` solo importa los locales y llama `i18n.init` — no agregar imports de servicios aquí (fueron removidos: eran imports muertos que evaluaban toda la capa de servicios al arranque).

## Rendimiento
- `metro.config.js` tiene `inlineRequires: true` (evaluación diferida de módulos); validado con `npx expo export --platform ios`.
- `babel.config.js` elimina `console.*` en producción (se conservan `error`/`warn`): no asumir que logs aparecen en builds release.
- `proximityService.handleLocationForProximity` está throttled (30s foreground / 15s background): llamadas más frecuentes retornan temprano sin efecto.
- `useFirebaseData` comparte cache entre instancias (key `path|orderBy|limit`, maxCacheAge por opción); al limpiar usar el `unsubscribe` que retorna `onValue`, nunca `off(ref)` sin callback (mata listeners ajenos del mismo path).
- `useLocation` default es 15s/25m (cliente); pantallas de viaje driver usan `DRIVER_LOCATION_OPTIONS` (2.5s/5m).
- Heartbeats: `useClientPresence`/`usePresence` 55s (sesión/presencia), `driverAvailabilityService` 60s (defensivo — el backend no aplica TTL de disponibilidad), escritura de ubicación 15s. Consolidarlos en un solo callable requiere endpoint backend combinado (pendiente).
- `StorageImage` usa `expo-image` (cache memory-disk de URLs firmadas); pasar `contentFit`, no `resizeMode` (hay compat para los valores RN).
- Iconos: NUNCA importar del barrel `@expo/vector-icons` (re-exporta las 19 familias → todas las .ttf entran al bundle). Usar subpath por familia: `import MaterialIcons from '@expo/vector-icons/MaterialIcons'`. Solo se bundlean MaterialIcons e Ionicons (~750KB vs ~3.9MB).
- `@react-native-firebase/database` y `/firestore` fueron desinstalados (0 imports — RTDB/Firestore van por el SDK JS). Solo se usan `app`, `auth`, `messaging`, `app-check` (vía `src/utils/nativeFirebase.ts`).
- `useKeepAwake` NO es global (quitado de App.tsx): se activa por pantalla en flujos de viaje (DriverHome, ActiveRide, FollowerActiveRide, RideTracking).
- `RideRequestsScreen`: el callable `getAvailableRides` corre solo cuando cambia la firma de rides `requested` en `activeRidesByArea` (listener compartido con el guard de viaje activo) — no hay polling por intervalo.
- `useProgrammedRidePrompt`: el `onValue` filtrado es la fuente de verdad; solo hay resync `get()` al volver a foreground (sin intervalo de 45s).

## Verificación
- Backend: `cd functions && npm run build && node --test test/designatedCrew.test.mjs`
- Frontend: `cd Frontend && npx tsc --noEmit` (los errores en `src/utils/tests/designatedDriverEvidence.test.ts` sobre `describe/it/expect` son preexistentes: faltan globals de Jest en tsconfig)
- Tests locales no versionados por .gitignore: `functions/test/*.test.mjs`, `Frontend/src/utils/tests/` — ejecutarlos explícitamente.
