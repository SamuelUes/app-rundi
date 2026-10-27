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

## Verificación
- Backend: `cd functions && npm run build && node --test test/designatedCrew.test.mjs`
- Frontend: `cd Frontend && npx tsc --noEmit` (los errores en `src/utils/tests/designatedDriverEvidence.test.ts` sobre `describe/it/expect` son preexistentes: faltan globals de Jest en tsconfig)
- Tests locales no versionados por .gitignore: `functions/test/*.test.mjs`, `Frontend/src/utils/tests/` — ejecutarlos explícitamente.
