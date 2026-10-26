# Viajes recurrentes para clientes — Diseño

Fecha: 2026-10-25
Estado: Aprobado (enfoque A)

## Objetivo

Permitir que el cliente guarde viajes frecuentes ("Casa → Trabajo") y los
solicite con un tap desde el Home. Los viajes recurrentes se crean y editan en
una pantalla dedicada con mapa (no en `SearchRideScreen`), se listan/gestionan
en otra pantalla, y se solicitan abriendo `SearchRide` precargado.

## Alcance

- Chips de viajes recurrentes en `HomeScreen` del cliente (fila horizontal sobre
  el CTA "Solicitar viaje", mismo patrón visual que `DriverHomeNavChips`).
- Pantalla nueva `RecurringRideFormScreen` para crear/editar (mapa + pines +
  polyline + formulario).
- Pantalla nueva `RecurringRidesScreen` para listar, editar y eliminar.
- `SearchRide` acepta un viaje recurrente y precarga ruta + preferencias.
- Persistencia en Firestore: campo `recurringRides` en `users/{uid}`.
- i18n en/es.

Fuera de alcance (futuro): sugerencias automáticas de la app (la estructura de
datos ya lo permite — el backend puede escribir el mismo campo).

## Modelo de datos

Campo `recurringRides: RecurringRide[]` en el documento `users/{uid}`:

```ts
interface RecurringRide {
  id: string;                      // generado en cliente (timestamp + random)
  title: string;                   // requerido, escrito por el usuario
  origin: { lat: number; lng: number; address: string };
  destination: { lat: number; lng: number; address: string };
  extraStops: Array<{ lat: number; lng: number; address: string }>; // 0..3
  vehicleType: 'moto' | 'auto' | 'designated_driver';
  designatedDriverMode?: 'auto' | 'moto';   // solo si vehicleType = designated_driver
  paymentMethod: 'cash' | 'card';
  passengers: number;              // para el vehicleType elegido
  comment?: string;
  priceSuggestion?: number | null;
  createdAt: number;               // epoch ms
  updatedAt: number;
}
```

Límite de UI: máximo 10 viajes recurrentes (suficiente para chips, mantiene el
documento pequeño — límite Firestore 1MB).

## Persistencia y reglas

**Enfoque A (aprobado):** campo array en `users/{uid}`.

- Nuevo servicio `recurringRidesService.ts`:
  - `listRecurringRides(uid)` — `getDoc` (o usado vía `onSnapshot` en hook).
  - `saveRecurringRide(uid, ride)` — lee el array, upsert por `id`, `updateDoc`.
  - `deleteRecurringRide(uid, id)` — lee, filtra, `updateDoc`.
  - `subscribeRecurringRides(uid, cb)` — `onSnapshot` sobre el doc para chips en vivo.
- Escrituras directas desde el cliente (patrón existente de
  `updateUserProfile` con `updateDoc`); sin Cloud Function.
- `database/firestore.rules`: agregar `'recurringRides'` al
  `affectedKeys().hasOnly([...])` del `update` de `match /users/{userId}`.

## Arquitectura / archivos

### Nuevos

| Archivo | Propósito |
|---|---|
| `Frontend/src/services/recurringRidesService.ts` | CRUD + suscripción Firestore del array `recurringRides` en `users/{uid}` |
| `Frontend/src/types/recurringRide.ts` | Tipo `RecurringRide` compartido |
| `Frontend/src/hooks/client/HomeScreen/useRecurringRides.ts` | Hook: `onSnapshot` del doc de usuario → lista de viajes para chips |
| `Frontend/src/components/client/HomeScreen/HomeScreenRecurringChips.tsx` | Fila horizontal de chips |
| `Frontend/src/screens/Client/RecurringRidesScreen.tsx` | Lista/gestión (editar, eliminar, crear) |
| `Frontend/src/screens/Client/RecurringRideFormScreen.tsx` | Crear/editar con `DynamicMap` |
| `Frontend/src/hooks/client/RecurringRideForm/useRecurringRideForm.ts` | Estado + lógica del formulario (selección de puntos, polyline, guardar) |

### Modificados

| Archivo | Cambio |
|---|---|
| `Frontend/src/navigation/ClientStack.tsx` | Agregar `RecurringRides` y `RecurringRideForm` routes; `SearchRide` pasa a `{ recurringRide?: RecurringRide } \| undefined` |
| `Frontend/src/screens/Client/HomeScreen.tsx` | Renderiza chips; handlers de navegación |
| `Frontend/src/components/client/HomeScreen/HomeScreenBottomActions.tsx` | Nueva fila de chips dentro de `bottomStack` (solo estado normal, no con `pendingAction`) |
| `Frontend/src/screens/Client/SearchRideScreen.tsx` | Lee `route.params?.recurringRide`, hidrata estado inicial |
| `Frontend/src/hooks/client/SearchRideScreen/useSearchRideState.ts` | Acepta valores iniciales opcionales para hidratación |
| `database/firestore.rules` | Whitelist `recurringRides` en update de `users` |
| `Frontend/src/i18n/index.ts` | Keys `client.recurringRides.*` (en/es) |

## Flujos de UI

### 1. Chips en HomeScreen

Dentro de `bottomStack`, arriba del hint de región y del CTA:

```
[＋ Nuevo viaje] [🏷 Casa → Trabajo] [🏷 Gym] … [✏️]
```

- `＋ Nuevo viaje` → `navigation.navigate('RecurringRideForm')` (modo crear).
- Chip de viaje → `navigation.navigate('SearchRide', { recurringRide })`.
- Chip `✏️` (solo si hay ≥1 viaje) → `navigation.navigate('RecurringRides')`.
- ScrollView horizontal, `showsHorizontalScrollIndicator={false}`, estilos
  `navChip`/`navChipsRow` equivalentes a los del driver (card translúcida,
  borde accent, ícono `repeat` o por vehículo + título truncado).
- No se muestran cuando `pendingAction` está activo (ese branch ya reemplaza
  todo el `bottomStack`).

### 2. `RecurringRideFormScreen` (crear/editar)

Layout inspirado en `SearchRideScreen` pero simplificado:

- `DynamicMap` a pantalla completa con `originMarker`, `destinationMarker`,
  `extraStopMarkers`, `routeCoordinates` (polyline), pin bubbles con labels,
  `onMapPress` y modos de selección center-pin (`onRegionChangeCenter` /
  `onRegionChangeCompleteCenter`).
- Arriba: botón back + `SearchRideRouteBubble`-like: filas Origen / paradas /
  Destino → abren overlay de búsqueda (reutilizar `SearchRideSearchOverlay` +
  `useAddressSearch`) o modo "elegir en mapa".
- Panel inferior (sheet fijo, sin gestos complejos): 
  - Campo **Nombre del viaje** (TextInput, requerido).
  - Chips de vehículo (moto/auto/designated driver), pago (cash/card),
    stepper de pasajeros, input de comentario — mismo look que
    `SearchRideVehicleOptions`/`SearchRideSummary`, simplificado.
  - Botón primario "Guardar viaje" (deshabilitado sin título + origen +
    destino). En edición, botón secundario "Eliminar".
- Param `rideId?: string` para edición: carga el viaje, precarga todo.
- Al guardar: `recurringRidesService.saveRecurringRide` → `navigation.goBack()`.
- Polyline: al tener origen+destino, encadenar `mapsService.getDirections` por
  tramo (igual que `calculateRouteWithStops`) → `routeCoordinates`. Mostrar
  distancia/duración estimadas como info, sin precios.

### 3. `RecurringRidesScreen` (lista/gestión)

- Header con back + título "Viajes recurrentes" + botón `add`.
- `FlatList` de viajes: título, `origen → destino` (2 líneas), ícono de
  vehículo, pasajeros. Acciones por fila: **Editar** (→ form con `rideId`),
  **Eliminar** (`alertService.showConfirmAlert` → `deleteRecurringRide`),
  **Solicitar** (tap en la fila → `SearchRide` precargado).
- Empty state: ícono + copy + CTA "Crear mi primer viaje".

### 4. `SearchRide` precargado

`navigation.navigate('SearchRide', { recurringRide })`:

- `useSearchRideState` acepta `initial` opcional: hidrata `origin`,
  `originCoords`, `destination`, `destinationCoords`, `extraDestinations`,
  `vehicleType`, `designatedDriverMode`, `paymentMethod`,
  `passengersByVehicle[vehicleType]`, `rideComment`, `priceSuggestion`,
  `manualOriginAddress`, `manualOriginDraft`, y flags
  `hasManualOriginOverride = true` + `hasPinnedOrigin = true` (evita que el
  init de GPS/sobre-escritura pise el origen guardado).
- En `SearchRideScreen`, efecto one-shot: cuando hay `recurringRide` y ambos
  coords presentes → `recomputeRouteWith()` para calcular ruta/precios.
- El usuario revisa opciones y confirma → flujo de solicitud normal
  (`onConfirmRequest` sin cambios).
- Si el viaje guardado es `designated_driver`, la solicitud pedirá foto y
  biometría como siempre (no se guarda foto en el recurrente).

## Manejo de errores / edge cases

- Firestore offline/fallo de lectura: chips simplemente no aparecen;
  guardar falla → `alertService.showErrorAlert`.
- `users/{uid}` sin doc o sin campo → lista vacía (no error).
- `onSnapshot` sin permisos → fallback silencioso a `getDoc` una vez.
- Viaje con origen fuera de zona soportada al solicitar: `SearchRide` ya
  valida con `validateLocationForContext`.
- Duplicados de `id`: ids con timestamp+random; upsert por `id`.
- Título vacío → botón guardar deshabilitado (trim).

## i18n

Keys bajo `client.recurringRides.*` (en + es): `addNew`, `title`, `nameLabel`,
`namePlaceholder`, `emptyTitle`, `emptyBody`, `createFirst`, `edit`, `delete`,
`deleteConfirmTitle`, `deleteConfirmBody`, `save`, `saved`, `saveError`,
`manage`, `request`, `stops`… más lo necesario en el form.

## Verificación

- `npx tsc --noEmit` (o script de typecheck del proyecto).
- Flujo manual: crear viaje → chip aparece (onSnapshot) → tap → SearchRide
  precargado calcula precio → confirmar solicita normal.
- Editar desde lista → cambios reflejados en chip.
- Eliminar → chip desaparece.
- Reglas: deploy/manual check que `updateDoc` con solo `recurringRides` pasa.
