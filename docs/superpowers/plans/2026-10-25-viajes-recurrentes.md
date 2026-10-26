# Viajes recurrentes para clientes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Chips de viajes recurrentes en el Home del cliente + pantalla dedicada de creación/edición con mapa + pantalla de gestión + precarga en `SearchRide`.

**Architecture:** Los viajes se guardan como array `recurringRides` en el documento `users/{uid}` de Firestore (escritura directa del cliente, mismo patrón que `updateUserProfile`). Un hook `useRecurringRides` con `onSnapshot` alimenta los chips en vivo. `RecurringRideFormScreen` reutiliza `DynamicMap`, `SearchRideRouteBubble` y `SearchRideSearchOverlay`. `SearchRideScreen` acepta `route.params.recurringRide` e hidrata su estado inicial.

**Tech Stack:** Expo/React Native, Firebase web SDK (Firestore), React Navigation, i18next.

Spec: `docs/superpowers/specs/2026-10-25-viajes-recurrentes-design.md`

Notas:
- El repo tiene cambios del usuario sin commitear — cada `git add` debe listar SOLO los archivos de esa tarea.
- i18n es un solo archivo `Frontend/src/i18n/index.ts` con bloques `en`/`es`; las keys nuevas van bajo `client.recurringRides.*`.
- `tr` en pantallas de viaje se scopa a `shared.searchRide.*` (igual que `SearchRideScreen`); las keys propias usan `t('client.recurringRides.*')`.
- La raíz del proyecto Firebase está en `/Users/samuelues/Proyectos/app-rundi`; el código de la app en `Frontend/`.

---

### Task 1: Tipo `RecurringRide` + servicio Firestore + reglas

**Files:**
- Create: `Frontend/src/types/recurringRide.ts`
- Create: `Frontend/src/services/recurringRidesService.ts`
- Test: `Frontend/src/services/tests/recurringRidesService.test.ts`
- Modify: `database/firestore.rules` (whitelist del update de `users`)

- [ ] **Step 1: Crear el tipo**

```ts
// Frontend/src/types/recurringRide.ts
export type RecurringRideVehicleType = 'moto' | 'auto' | 'designated_driver';
export type RecurringRideDesignatedMode = 'auto' | 'moto';
export type RecurringRidePaymentMethod = 'cash' | 'card';

export interface RecurringRidePoint {
  lat: number;
  lng: number;
  address: string;
}

export interface RecurringRide {
  id: string;
  title: string;
  origin: RecurringRidePoint;
  destination: RecurringRidePoint;
  extraStops: RecurringRidePoint[];
  vehicleType: RecurringRideVehicleType;
  designatedDriverMode?: RecurringRideDesignatedMode;
  paymentMethod: RecurringRidePaymentMethod;
  passengers: number;
  comment?: string;
  priceSuggestion?: number | null;
  createdAt: number;
  updatedAt: number;
}

export type RecurringRideInput = Omit<RecurringRide, 'id' | 'createdAt' | 'updatedAt'>;
```

- [ ] **Step 2: Crear el servicio**

```ts
// Frontend/src/services/recurringRidesService.ts
import { doc, getDoc, onSnapshot, updateDoc } from 'firebase/firestore';
import { getFirebaseFirestore } from '../config/firebase';
import type { RecurringRide, RecurringRideInput, RecurringRidePoint } from '../types/recurringRide';

export const MAX_RECURRING_RIDES = 10;

const asNumber = (value: any): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

function sanitizePoint(raw: any): RecurringRidePoint | null {
  const lat = asNumber(raw?.lat ?? raw?.latitude);
  const lng = asNumber(raw?.lng ?? raw?.longitude);
  if (lat == null || lng == null) return null;
  return { lat, lng, address: String(raw?.address ?? '') };
}

export function sanitizeRecurringRides(data: any): RecurringRide[] {
  if (!Array.isArray(data)) return [];
  const rides: RecurringRide[] = [];
  for (const raw of data) {
    const origin = sanitizePoint(raw?.origin);
    const destination = sanitizePoint(raw?.destination);
    if (!origin || !destination) continue;
    const vehicleType: RecurringRide['vehicleType'] =
      raw?.vehicleType === 'moto' || raw?.vehicleType === 'designated_driver' ? raw.vehicleType : 'auto';
    rides.push({
      id: typeof raw?.id === 'string' && raw.id ? raw.id : `rr_${rides.length}`,
      title: typeof raw?.title === 'string' && raw.title.trim() ? raw.title.trim() : 'Viaje',
      origin,
      destination,
      extraStops: Array.isArray(raw?.extraStops)
        ? raw.extraStops.map(sanitizePoint).filter((p): p is RecurringRidePoint => !!p).slice(0, 3)
        : [],
      vehicleType,
      designatedDriverMode:
        raw?.designatedDriverMode === 'moto' || raw?.designatedDriverMode === 'auto'
          ? raw.designatedDriverMode
          : undefined,
      paymentMethod: raw?.paymentMethod === 'card' ? 'card' : 'cash',
      passengers: Math.max(1, Math.min(4, asNumber(raw?.passengers) ?? 1)),
      comment: typeof raw?.comment === 'string' && raw.comment.trim() ? raw.comment.trim() : undefined,
      priceSuggestion: asNumber(raw?.priceSuggestion),
      createdAt: asNumber(raw?.createdAt) ?? Date.now(),
      updatedAt: asNumber(raw?.updatedAt) ?? Date.now(),
    });
  }
  return rides;
}

export function generateRecurringRideId(): string {
  return `rr_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

async function readRides(uid: string): Promise<RecurringRide[]> {
  const firestore = await getFirebaseFirestore();
  const snap = await getDoc(doc(firestore, 'users', uid));
  return sanitizeRecurringRides(snap.data()?.recurringRides);
}

export async function listRecurringRides(uid: string): Promise<RecurringRide[]> {
  if (!uid) return [];
  try {
    return await readRides(uid);
  } catch (error) {
    console.warn('[recurringRides] list failed', error);
    return [];
  }
}

export function subscribeRecurringRides(
  uid: string,
  callback: (rides: RecurringRide[]) => void,
): () => void {
  let cancelled = false;
  let unsubscribe: (() => void) | null = null;

  (async () => {
    try {
      const firestore = await getFirebaseFirestore();
      if (cancelled) return;
      unsubscribe = onSnapshot(
        doc(firestore, 'users', uid),
        (snap) => callback(sanitizeRecurringRides(snap.data()?.recurringRides)),
        (error) => {
          console.warn('[recurringRides] snapshot failed, fallback getDoc', error);
          readRides(uid)
            .then((rides) => { if (!cancelled) callback(rides); })
            .catch(() => undefined);
        },
      );
    } catch (error) {
      console.warn('[recurringRides] subscribe init failed', error);
      try {
        const rides = await readRides(uid);
        if (!cancelled) callback(rides);
      } catch {
        /* noop */
      }
    }
  })();

  return () => {
    cancelled = true;
    unsubscribe?.();
  };
}

export async function saveRecurringRide(
  uid: string,
  input: RecurringRideInput & { id?: string },
): Promise<RecurringRide> {
  if (!uid) throw new Error('missing uid');
  const rides = await readRides(uid);
  const now = Date.now();
  const existingIndex = input.id ? rides.findIndex((r) => r.id === input.id) : -1;

  const ride: RecurringRide = {
    ...input,
    id: input.id ?? generateRecurringRideId(),
    extraStops: input.extraStops ?? [],
    createdAt: existingIndex >= 0 ? rides[existingIndex].createdAt : now,
    updatedAt: now,
  };

  const next = existingIndex >= 0
    ? rides.map((r) => (r.id === ride.id ? ride : r))
    : [...rides, ride];

  if (next.length > MAX_RECURRING_RIDES) {
    throw new Error(`MAX_RECURRING_RIDES:${MAX_RECURRING_RIDES}`);
  }

  const firestore = await getFirebaseFirestore();
  await updateDoc(doc(firestore, 'users', uid), { recurringRides: next });
  return ride;
}

export async function deleteRecurringRide(uid: string, rideId: string): Promise<void> {
  const rides = await readRides(uid);
  const next = rides.filter((r) => r.id !== rideId);
  if (next.length === rides.length) return;
  const firestore = await getFirebaseFirestore();
  await updateDoc(doc(firestore, 'users', uid), { recurringRides: next });
}
```

- [ ] **Step 3: Escribir el test que falla**

```ts
// Frontend/src/services/tests/recurringRidesService.test.ts
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { getDoc, updateDoc } from 'firebase/firestore';
import {
  deleteRecurringRide,
  listRecurringRides,
  MAX_RECURRING_RIDES,
  sanitizeRecurringRides,
  saveRecurringRide,
} from '../recurringRidesService';
import type { RecurringRideInput } from '../../types/recurringRide';

jest.mock('firebase/firestore', () => ({
  doc: jest.fn((_db: any, col: string, id: string) => ({ col, id })),
  getDoc: jest.fn(),
  updateDoc: jest.fn(async () => undefined),
  onSnapshot: jest.fn(() => () => undefined),
}));
jest.mock('../../config/firebase', () => ({
  getFirebaseFirestore: jest.fn(async () => ({})),
}));

const mockedGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockedUpdateDoc = updateDoc as jest.MockedFunction<typeof updateDoc>;

const sampleInput: RecurringRideInput = {
  title: 'Casa → Trabajo',
  origin: { lat: 12.1, lng: -86.25, address: 'Casa' },
  destination: { lat: 12.15, lng: -86.3, address: 'Trabajo' },
  extraStops: [],
  vehicleType: 'auto',
  paymentMethod: 'cash',
  passengers: 1,
};

const stored = {
  id: 'rr_existing',
  title: 'Guardado',
  origin: { lat: 12.1, lng: -86.25, address: 'A' },
  destination: { lat: 12.2, lng: -86.3, address: 'B' },
  extraStops: [],
  vehicleType: 'moto',
  paymentMethod: 'cash',
  passengers: 1,
  createdAt: 1000,
  updatedAt: 1000,
};

const docWith = (recurringRides: any) =>
  ({ data: () => ({ recurringRides }) }) as any;

describe('sanitizeRecurringRides', () => {
  it('returns [] for non-arrays and drops invalid entries', () => {
    expect(sanitizeRecurringRides(undefined)).toEqual([]);
    expect(sanitizeRecurringRides('nope')).toEqual([]);
    expect(sanitizeRecurringRides([{ title: 'x' }])).toEqual([]);
    const [ride] = sanitizeRecurringRides([{ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } }]);
    expect(ride.vehicleType).toBe('auto');
    expect(ride.paymentMethod).toBe('cash');
    expect(ride.passengers).toBe(1);
  });
});

describe('recurringRidesService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('lists sanitized rides from the user doc', async () => {
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    const rides = await listRecurringRides('u1');
    expect(rides).toHaveLength(1);
    expect(rides[0].id).toBe('rr_existing');
  });

  it('appends a new ride with generated id', async () => {
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    const ride = await saveRecurringRide('u1', sampleInput);
    expect(ride.id).toMatch(/^rr_/);
    expect(ride.createdAt).toBeGreaterThan(0);
    const [, payload] = mockedUpdateDoc.mock.calls[0] as any;
    expect(payload.recurringRides).toHaveLength(2);
    expect(payload.recurringRides[1].title).toBe('Casa → Trabajo');
  });

  it('updates an existing ride preserving createdAt', async () => {
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    await saveRecurringRide('u1', { ...sampleInput, id: 'rr_existing' });
    const [, payload] = mockedUpdateDoc.mock.calls[0] as any;
    expect(payload.recurringRides).toHaveLength(1);
    expect(payload.recurringRides[0].createdAt).toBe(1000);
    expect(payload.recurringRides[0].title).toBe('Casa → Trabajo');
  });

  it('rejects saving beyond the max', async () => {
    const full = Array.from({ length: MAX_RECURRING_RIDES }, (_, i) => ({ ...stored, id: `rr_${i}` }));
    mockedGetDoc.mockResolvedValue(docWith(full));
    await expect(saveRecurringRide('u1', sampleInput)).rejects.toThrow('MAX_RECURRING_RIDES');
  });

  it('deletes by id and no-ops when missing', async () => {
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    await deleteRecurringRide('u1', 'rr_existing');
    let [, payload] = mockedUpdateDoc.mock.calls[0] as any;
    expect(payload.recurringRides).toHaveLength(0);

    jest.clearAllMocks();
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    await deleteRecurringRide('u1', 'rr_other');
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Correr el test y verificar que pasa**

Run: `cd Frontend && npx jest src/services/tests/recurringRidesService.test.ts`
Expected: PASS (5 tests)

- [ ] **Step 5: Actualizar reglas de Firestore**

En `database/firestore.rules`, dentro de `match /users/{userId}` → `allow update`, agregar `'recurringRides'` a la lista:

```
      allow update: if isOwner(userId) &&
                      request.resource.data.diff(resource.data).affectedKeys().hasOnly([
                        'name', 'phone', 'email', 'birthDate', 'profilePhoto',
                        'authProvider', 'method', 'fcmToken',
                        'notificationsEnabled', 'currentRideId',
                        'driverStatus', 'currentLocation', 'stats',
                        'updatedAt', 'recurringRides'
                      ]);
```

- [ ] **Step 6: Commit**

```bash
git add Frontend/src/types/recurringRide.ts Frontend/src/services/recurringRidesService.ts Frontend/src/services/tests/recurringRidesService.test.ts database/firestore.rules
git commit -m "feat: servicio y reglas para viajes recurrentes de clientes"
```

---

### Task 2: Hook `useRecurringRides` (suscripción en vivo)

**Files:**
- Create: `Frontend/src/hooks/client/useRecurringRides.ts`

- [ ] **Step 1: Crear el hook**

```ts
// Frontend/src/hooks/client/useRecurringRides.ts
import { useEffect, useState } from 'react';
import { subscribeRecurringRides } from '../../services/recurringRidesService';
import type { RecurringRide } from '../../types/recurringRide';

export function useRecurringRides(userId?: string) {
  const [rides, setRides] = useState<RecurringRide[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) {
      setRides([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsubscribe = subscribeRecurringRides(userId, (next) => {
      setRides(next);
      setLoading(false);
    });
    return unsubscribe;
  }, [userId]);

  return { rides, loading };
}
```

- [ ] **Step 2: Commit**

```bash
git add Frontend/src/hooks/client/useRecurringRides.ts
git commit -m "feat: hook useRecurringRides con suscripcion a users/{uid}"
```

---

### Task 3: Keys i18n (en + es)

**Files:**
- Modify: `Frontend/src/i18n/index.ts`

- [ ] **Step 1: Agregar bloque `recurringRides` en `client` (EN)**

Dentro del bloque `client:` del locale `en` (después de `home: { ... },`, antes de `homeOffers:`):

```ts
        recurringRides: {
          addNew: 'New trip',
          manage: 'Manage',
          title: 'Saved trips',
          formTitleNew: 'New recurring trip',
          formTitleEdit: 'Edit recurring trip',
          nameLabel: 'Trip name',
          namePlaceholder: 'e.g. Home → Work',
          routeInfo: '{{distance}} km · ~{{duration}} min',
          routeCalculating: 'Calculating route…',
          save: 'Save trip',
          saved: 'Trip saved',
          saveError: 'Could not save the trip. Please try again.',
          limitReached: 'You can save up to {{max}} trips.',
          delete: 'Delete',
          deleteConfirmTitle: 'Delete trip?',
          deleteConfirmBody: '"{{title}}" will be removed from your saved trips.',
          deleted: 'Trip deleted',
          deleteError: 'Could not delete the trip.',
          emptyTitle: 'No saved trips yet',
          emptyBody: 'Save your frequent routes and request them with one tap.',
          createFirst: 'Create my first trip',
          edit: 'Edit',
          request: 'Request',
          stopsCount_one: '{{count}} stop',
          stopsCount_other: '{{count}} stops',
          passengersLabel: 'Passengers',
          commentLabel: 'Comment',
          commentPlaceholder: 'Trip details...',
          vehicleSection: 'Vehicle',
          paymentSection: 'Payment method',
          incompleteRoute: 'Set the origin and destination to save the trip.',
          cash: 'Cash',
          card: 'Card',
        },
```

- [ ] **Step 2: Agregar bloque equivalente en `es`**

Dentro del bloque `client:` del locale `es`, en la misma posición relativa:

```ts
        recurringRides: {
          addNew: 'Nuevo viaje',
          manage: 'Gestionar',
          title: 'Viajes guardados',
          formTitleNew: 'Nuevo viaje recurrente',
          formTitleEdit: 'Editar viaje recurrente',
          nameLabel: 'Nombre del viaje',
          namePlaceholder: 'Ej. Casa → Trabajo',
          routeInfo: '{{distance}} km · ~{{duration}} min',
          routeCalculating: 'Calculando ruta…',
          save: 'Guardar viaje',
          saved: 'Viaje guardado',
          saveError: 'No se pudo guardar el viaje. Intenta de nuevo.',
          limitReached: 'Puedes guardar hasta {{max}} viajes.',
          delete: 'Eliminar',
          deleteConfirmTitle: '¿Eliminar viaje?',
          deleteConfirmBody: '"{{title}}" se quitará de tus viajes guardados.',
          deleted: 'Viaje eliminado',
          deleteError: 'No se pudo eliminar el viaje.',
          emptyTitle: 'Aún no tienes viajes guardados',
          emptyBody: 'Guarda tus rutas frecuentes y solicítalas con un toque.',
          createFirst: 'Crear mi primer viaje',
          edit: 'Editar',
          request: 'Solicitar',
          stopsCount_one: '{{count}} parada',
          stopsCount_other: '{{count}} paradas',
          passengersLabel: 'Pasajeros',
          commentLabel: 'Comentario',
          commentPlaceholder: 'Detalles del viaje...',
          vehicleSection: 'Vehículo',
          paymentSection: 'Método de pago',
          incompleteRoute: 'Define el origen y el destino para guardar el viaje.',
          cash: 'Efectivo',
          card: 'Tarjeta',
        },
```

- [ ] **Step 3: Verificar que el archivo parsea**

Run: `cd Frontend && npx tsc --noEmit -p tsconfig.json 2>&1 | head -20` (o `node -e "require('esbuild')"` no aplica; si tsc no está, correr `npx jest` — i18n se importa en tests existentes)
Expected: sin errores de sintaxis en `index.ts`

- [ ] **Step 4: Commit**

```bash
git add Frontend/src/i18n/index.ts
git commit -m "feat: i18n de viajes recurrentes (en/es)"
```

---

### Task 4: Navegación — rutas y params en `ClientStack`

**Files:**
- Modify: `Frontend/src/navigation/ClientStack.tsx`

- [ ] **Step 1: Imports y param list**

Agregar al inicio:

```ts
import type { RecurringRide } from '../types/recurringRide';
import RecurringRidesScreen from '../screens/Client/RecurringRidesScreen';
import RecurringRideFormScreen from '../screens/Client/RecurringRideFormScreen';
```

En `ClientStackParamList` cambiar la línea `SearchRide: undefined;` por:

```ts
  SearchRide: { recurringRide?: RecurringRide } | undefined;
  RecurringRides: undefined;
  RecurringRideForm: { ride?: RecurringRide } | undefined;
```

- [ ] **Step 2: Registrar las pantallas**

Después del `<Stack.Screen name="SearchRide" ...>`:

```tsx
      <Stack.Screen name="RecurringRides" component={RecurringRidesScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RecurringRideForm" component={RecurringRideFormScreen} options={{ headerShown: false }} />
```

- [ ] **Step 3: Commit** (las pantallas aún no existen — commitear junto con Task 6 o mantener el cambio pendiente hasta entonces; preferido: commitear después de Task 7 cuando compile)

```bash
git add Frontend/src/navigation/ClientStack.tsx
git commit -m "feat: rutas RecurringRides y RecurringRideForm + param recurringRide en SearchRide"
```

---

### Task 5: Chips en HomeScreen del cliente

**Files:**
- Create: `Frontend/src/components/client/HomeScreen/HomeScreenRecurringChips.tsx`
- Modify: `Frontend/src/components/client/HomeScreen/HomeScreenBottomActions.tsx`
- Modify: `Frontend/src/screens/Client/HomeScreen.tsx`

- [ ] **Step 1: Crear el componente de chips**

```tsx
// Frontend/src/components/client/HomeScreen/HomeScreenRecurringChips.tsx
import React from 'react';
import { ScrollView, Pressable, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';
import type { RecurringRide } from '../../../types/recurringRide';

const VEHICLE_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  moto: 'two-wheeler',
  auto: 'directions-car',
  designated_driver: 'person-pin',
};

interface HomeScreenRecurringChipsProps {
  rides: RecurringRide[];
  onAddRide: () => void;
  onPressRide: (ride: RecurringRide) => void;
  onManage: () => void;
  styles: any;
  t: TFunction;
}

export function HomeScreenRecurringChips({
  rides,
  onAddRide,
  onPressRide,
  onManage,
  styles,
  t,
}: HomeScreenRecurringChipsProps) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.recurringChipsRow}
    >
      <Pressable
        style={({ pressed }) => [
          styles.recurringChip,
          styles.recurringChipAdd,
          pressed && styles.recurringChipPressed,
        ]}
        onPress={onAddRide}
        accessibilityRole="button"
        accessibilityLabel={t('client.recurringRides.addNew')}
      >
        <MaterialIcons name="add" size={16} color="#B38737" />
        <Text style={[styles.recurringChipLabel, styles.recurringChipAddLabel]}>
          {t('client.recurringRides.addNew')}
        </Text>
      </Pressable>

      {rides.map((ride) => (
        <Pressable
          key={ride.id}
          style={({ pressed }) => [
            styles.recurringChip,
            pressed && styles.recurringChipPressed,
          ]}
          onPress={() => onPressRide(ride)}
          accessibilityRole="button"
          accessibilityLabel={ride.title}
        >
          <MaterialIcons
            name={VEHICLE_ICONS[ride.vehicleType] ?? 'repeat'}
            size={16}
            color="#B38737"
          />
          <Text style={styles.recurringChipLabel} numberOfLines={1}>
            {ride.title}
          </Text>
        </Pressable>
      ))}

      {rides.length > 0 && (
        <Pressable
          style={({ pressed }) => [
            styles.recurringChip,
            styles.recurringChipManage,
            pressed && styles.recurringChipPressed,
          ]}
          onPress={onManage}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.manage')}
        >
          <MaterialIcons name="edit" size={15} color="#B38737" />
        </Pressable>
      )}
    </ScrollView>
  );
}
```

- [ ] **Step 2: Agregar estilos en `HomeScreen.tsx` `createStyles`** (después de `regionHintText`):

```ts
  recurringChipsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 2,
  },
  recurringChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    height: 40,
    paddingHorizontal: 14,
    borderRadius: 20,
    backgroundColor: isDark ? 'rgba(24,20,17,0.92)' : 'rgba(255,255,255,0.94)',
    borderWidth: 0.5,
    borderColor: isDark ? colors.SecondBorder : colors.primary,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: isDark ? 0.35 : 0.12,
    shadowRadius: 10,
    elevation: 6,
  },
  recurringChipPressed: {
    transform: [{ scale: 0.95 }],
    opacity: 0.9,
  },
  recurringChipLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: isDark ? '#F5F1EA' : '#1C1917',
    maxWidth: 140,
  },
  recurringChipAdd: {
    borderStyle: 'dashed',
    borderColor: isDark ? 'rgba(232,196,127,0.5)' : 'rgba(179,135,55,0.45)',
  },
  recurringChipAddLabel: {
    color: '#B38737',
  },
  recurringChipManage: {
    paddingHorizontal: 12,
  },
```

- [ ] **Step 3: Wiring en `HomeScreen.tsx`**

Imports:

```ts
import { useRecurringRides } from '../../hooks/client/useRecurringRides';
import type { RecurringRide } from '../../types/recurringRide';
```

Dentro del componente, junto a los otros hooks:

```ts
  const { rides: recurringRides } = useRecurringRides(user?.id);
```

Reemplazar `handleRequestRide` por un opener genérico (mismas guardas, con param opcional):

```ts
  const openSearchRide = useCallback(
    (recurringRide?: RecurringRide) => {
      if (isOutsideSupportedArea) {
        alertService.showInfoAlert(
          t('client.home.alerts.regionUnavailableTitle'),
          regionStatus.message || t('client.home.alerts.regionUnavailableMessage'),
        );
        return;
      }

      if (hasPendingPayments) {
        handleViewPendingPayments();
        return;
      }

      navigation.navigate('SearchRide', recurringRide ? { recurringRide } : undefined);
    },
    [handleViewPendingPayments, hasPendingPayments, isOutsideSupportedArea, navigation, regionStatus.message, t],
  );

  const handleRequestRide = useCallback(() => openSearchRide(), [openSearchRide]);
```

Y agregar los handlers de chips:

```ts
  const handleAddRecurringRide = useCallback(() => {
    navigation.navigate('RecurringRideForm');
  }, [navigation]);

  const handleManageRecurringRides = useCallback(() => {
    navigation.navigate('RecurringRides');
  }, [navigation]);
```

Pasar props a `HomeScreenBottomActions`:

```tsx
      <HomeScreenBottomActions
        pendingAction={pendingAction}
        isOutsideSupportedArea={isOutsideSupportedArea}
        regionStatus={regionStatus}
        scheduledRideNotice={scheduledRideNotice}
        recurringRides={recurringRides}
        onAddRecurringRide={handleAddRecurringRide}
        onPressRecurringRide={openSearchRide}
        onManageRecurringRides={handleManageRecurringRides}
        onRequestRide={handleRequestRide}
        styles={styles}
        t={t}
      />
```

- [ ] **Step 4: Renderizar los chips en `HomeScreenBottomActions.tsx`**

Imports:

```ts
import type { RecurringRide } from '../../../types/recurringRide';
import { HomeScreenRecurringChips } from './HomeScreenRecurringChips';
```

Props:

```ts
interface HomeScreenBottomActionsProps {
  pendingAction: PendingAction | null;
  isOutsideSupportedArea: boolean;
  regionStatus: RegionStatus;
  scheduledRideNotice?: string | null;
  recurringRides: RecurringRide[];
  onAddRecurringRide: () => void;
  onPressRecurringRide: (ride: RecurringRide) => void;
  onManageRecurringRides: () => void;
  onRequestRide: () => void;
  styles: any;
  t: TFunction;
}
```

En el return normal (sin `pendingAction`), dentro de `bottomStack`, ANTES del `scheduledRideChip`:

```tsx
      <HomeScreenRecurringChips
        rides={recurringRides}
        onAddRide={onAddRecurringRide}
        onPressRide={onPressRecurringRide}
        onManage={onManageRecurringRides}
        styles={styles}
        t={t}
      />
```

- [ ] **Step 5: Typecheck**

Run: `cd Frontend && npx tsc --noEmit`
Expected: sin errores nuevos (las rutas nuevas deben existir ya — si no, correr después de Task 7)

- [ ] **Step 6: Commit**

```bash
git add Frontend/src/components/client/HomeScreen/HomeScreenRecurringChips.tsx Frontend/src/components/client/HomeScreen/HomeScreenBottomActions.tsx Frontend/src/screens/Client/HomeScreen.tsx
git commit -m "feat: chips de viajes recurrentes en HomeScreen del cliente"
```

---

### Task 6: `RecurringRidesScreen` (lista / gestión)

**Files:**
- Create: `Frontend/src/screens/Client/RecurringRidesScreen.tsx`

- [ ] **Step 1: Crear la pantalla**

```tsx
// Frontend/src/screens/Client/RecurringRidesScreen.tsx
import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TouchableOpacity,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useRecurringRides } from '../../hooks/client/useRecurringRides';
import { deleteRecurringRide } from '../../services/recurringRidesService';
import alertService from '../../services/alertService';
import type { RecurringRide } from '../../types/recurringRide';

const VEHICLE_ICONS: Record<string, keyof typeof MaterialIcons.glyphMap> = {
  moto: 'two-wheeler',
  auto: 'directions-car',
  designated_driver: 'person-pin',
};

export default function RecurringRidesScreen({ navigation }: any) {
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { rides, loading } = useRecurringRides(user?.id);

  const handleRequest = useCallback(
    (ride: RecurringRide) => navigation.navigate('SearchRide', { recurringRide: ride }),
    [navigation],
  );
  const handleEdit = useCallback(
    (ride: RecurringRide) => navigation.navigate('RecurringRideForm', { ride }),
    [navigation],
  );
  const handleCreate = useCallback(
    () => navigation.navigate('RecurringRideForm'),
    [navigation],
  );

  const handleDelete = useCallback(
    (ride: RecurringRide) => {
      if (!user?.id) return;
      alertService.showConfirmAlert(
        t('client.recurringRides.deleteConfirmTitle'),
        t('client.recurringRides.deleteConfirmBody', { title: ride.title }),
        async () => {
          try {
            await deleteRecurringRide(user.id, ride.id);
            alertService.showSuccessAlert(
              t('client.recurringRides.deleted'),
              ride.title,
            );
          } catch (error) {
            console.warn('[RecurringRides] delete failed', error);
            alertService.showErrorAlert(t('client.recurringRides.deleteError'));
          }
        },
        undefined,
        t('common.actions.delete'),
        t('common.actions.cancel'),
        true,
      );
    },
    [user?.id, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: RecurringRide }) => (
      <Pressable
        style={({ pressed }) => [styles.rideCard, pressed && styles.rideCardPressed]}
        onPress={() => handleRequest(item)}
        accessibilityRole="button"
        accessibilityLabel={item.title}
      >
        <View style={styles.rideIconDisc}>
          <MaterialIcons
            name={VEHICLE_ICONS[item.vehicleType] ?? 'repeat'}
            size={20}
            color="#B38737"
          />
        </View>
        <View style={styles.rideBody}>
          <Text style={styles.rideTitle} numberOfLines={1}>{item.title}</Text>
          <Text style={styles.rideRoute} numberOfLines={1}>
            {item.origin.address} → {item.destination.address}
          </Text>
          <Text style={styles.rideMeta} numberOfLines={1}>
            {t('client.recurringRides.stopsCount', { count: item.extraStops.length })}
            {' · '}
            {t('client.recurringRides.passengersLabel')}: {item.passengers}
          </Text>
        </View>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleEdit(item)}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.edit')}
          hitSlop={8}
        >
          <MaterialIcons name="edit" size={18} color={colors.textSecondary} />
        </TouchableOpacity>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => handleDelete(item)}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.delete')}
          hitSlop={8}
        >
          <MaterialIcons name="delete-outline" size={20} color="#C62828" />
        </TouchableOpacity>
      </Pressable>
    ),
    [styles, colors, t, handleRequest, handleEdit, handleDelete],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation?.goBack?.()}
          accessibilityRole="button"
          accessibilityLabel={t('common.actions.back')}
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('client.recurringRides.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleCreate}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.addNew')}
        >
          <MaterialIcons name="add" size={22} color="#241A09" />
        </TouchableOpacity>
      </View>

      {loading ? null : rides.length === 0 ? (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconDisc}>
            <MaterialIcons name="repeat" size={30} color="#B38737" />
          </View>
          <Text style={styles.emptyTitle}>{t('client.recurringRides.emptyTitle')}</Text>
          <Text style={styles.emptyBody}>{t('client.recurringRides.emptyBody')}</Text>
          <Pressable
            style={({ pressed }) => [styles.emptyCta, pressed && { opacity: 0.9 }]}
            onPress={handleCreate}
            accessibilityRole="button"
          >
            <Text style={styles.emptyCtaLabel}>{t('client.recurringRides.createFirst')}</Text>
          </Pressable>
        </View>
      ) : (
        <FlatList
          data={rides}
          keyExtractor={(item) => item.id}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
        />
      )}
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderWidth: isDark ? StyleSheet.hairlineWidth : 0,
      borderColor: colors.border,
    },
    headerTitle: {
      flex: 1,
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
    },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: '#B38737',
    },
    listContent: { padding: 16, gap: 10 },
    rideCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      padding: 14,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rideCardPressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
    rideIconDisc: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(179,135,55,0.22)' : 'rgba(179,135,55,0.14)',
    },
    rideBody: { flex: 1, minWidth: 0, gap: 2 },
    rideTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
    rideRoute: { fontSize: 12.5, fontWeight: '500', color: colors.textSecondary },
    rideMeta: { fontSize: 11.5, color: colors.textSecondary, marginTop: 2 },
    actionButton: { padding: 8 },
    emptyState: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
    emptyIconDisc: {
      width: 72,
      height: 72,
      borderRadius: 36,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(179,135,55,0.2)' : 'rgba(179,135,55,0.12)',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
    emptyBody: {
      fontSize: 13,
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 6,
      lineHeight: 19,
    },
    emptyCta: {
      marginTop: 20,
      paddingVertical: 13,
      paddingHorizontal: 24,
      borderRadius: 999,
      backgroundColor: '#B38737',
    },
    emptyCtaLabel: { fontSize: 15, fontWeight: '800', color: '#241A09' },
  });
```

- [ ] **Step 2: Typecheck**

Run: `cd Frontend && npx tsc --noEmit`
Expected: sin errores en `RecurringRidesScreen.tsx`

- [ ] **Step 3: Commit**

```bash
git add Frontend/src/screens/Client/RecurringRidesScreen.tsx
git commit -m "feat: pantalla de gestion de viajes recurrentes"
```

---

### Task 7: `RecurringRideFormScreen` + hook de formulario

**Files:**
- Create: `Frontend/src/hooks/client/RecurringRideForm/useRecurringRideForm.ts`
- Create: `Frontend/src/screens/Client/RecurringRideFormScreen.tsx`

- [ ] **Step 1: Crear el hook `useRecurringRideForm`**

```ts
// Frontend/src/hooks/client/RecurringRideForm/useRecurringRideForm.ts
import { useCallback, useEffect, useRef, useState } from 'react';
import mapsService from '../../../services/mapsService';
import alertService from '../../../services/alertService';
import { useFirebaseItem } from '../../shared/firebase/useFirebaseData';
import { formatCoords, isValidCoordLocal, metersBetween, type Coords } from '../../../utils/rideCoords';
import { checkLocationAllowed, type LocationValidationResult } from '../../../utils/locationValidation';
import {
  deleteRecurringRide,
  saveRecurringRide,
  MAX_RECURRING_RIDES,
} from '../../../services/recurringRidesService';
import type {
  RecurringRide,
  RecurringRideDesignatedMode,
  RecurringRideInput,
  RecurringRidePaymentMethod,
  RecurringRideVehicleType,
} from '../../../types/recurringRide';

const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };
const REGION_IDLE_DELAY_MS = 900;
export const RECURRING_RIDE_MAX_STOPS = 3;

type MapSelectionState =
  | 'origin'
  | 'destination'
  | 'extra-new'
  | { type: 'extra-edit'; index: number }
  | null;

type SelectionTarget = 'origin' | 'destination' | number | 'new-stop' | null;

interface FormParams {
  initial?: RecurringRide;
  userId?: string;
  gpsCoords: Coords | null;
  tr: (path: string, options?: Record<string, any>) => string; // shared.searchRide
  trr: (path: string, options?: Record<string, any>) => string; // client.recurringRides
}

const toCoords = (point: { lat: number; lng: number }): Coords => ({
  latitude: point.lat,
  longitude: point.lng,
});

export function useRecurringRideForm({ initial, userId, gpsCoords, tr, trr }: FormParams) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [origin, setOrigin] = useState(initial?.origin.address ?? '');
  const [originCoords, setOriginCoords] = useState<Coords | null>(
    initial ? toCoords(initial.origin) : null,
  );
  const [destination, setDestination] = useState(initial?.destination.address ?? '');
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(
    initial ? toCoords(initial.destination) : null,
  );
  const [extraStops, setExtraStops] = useState<Array<{ address: string; coords: Coords | null }>>(
    initial?.extraStops?.map((s) => ({ address: s.address, coords: toCoords(s) })) ?? [],
  );
  const [vehicleType, setVehicleType] = useState<RecurringRideVehicleType>(
    initial?.vehicleType ?? 'auto',
  );
  const [designatedDriverMode, setDesignatedDriverMode] =
    useState<RecurringRideDesignatedMode>(initial?.designatedDriverMode ?? 'auto');
  const [paymentMethod, setPaymentMethod] =
    useState<RecurringRidePaymentMethod>(initial?.paymentMethod ?? 'cash');
  const [passengers, setPassengers] = useState(initial?.passengers ?? 1);
  const [comment, setComment] = useState(initial?.comment ?? '');

  const [mapSelectionMode, setMapSelectionMode] = useState<MapSelectionState>(null);
  const [activeSelection, setActiveSelection] = useState<SelectionTarget>(null);
  const [showSearchOverlay, setShowSearchOverlay] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [recentLocations, setRecentLocations] = useState<Array<{ label: string; coords: Coords }>>([]);

  const [manualOriginDraft, setManualOriginDraft] = useState<Coords | null>(
    initial ? toCoords(initial.origin) : null,
  );
  const [manualOriginAddress, setManualOriginAddress] = useState(initial?.origin.address ?? '');
  const [manualOriginLoading, setManualOriginLoading] = useState(false);
  const [manualOriginDragging, setManualOriginDragging] = useState(false);
  const [manualDestinationDraft, setManualDestinationDraft] = useState<Coords | null>(null);
  const [manualDestinationLoading, setManualDestinationLoading] = useState(false);
  const [manualDestinationDragging, setManualDestinationDragging] = useState(false);
  const [extraStopSelectionLoading, setExtraStopSelectionLoading] = useState(false);
  const [cameraTarget, setCameraTarget] = useState<Coords | null>(null);

  const [routeCoordinates, setRouteCoordinates] = useState<Coords[]>([]);
  const [routeInfo, setRouteInfo] = useState<{ distanceKm: number; durationMin: number } | null>(null);
  const [calculatingRoute, setCalculatingRoute] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const routeRequestRef = useRef(0);
  const locationValidationCacheRef = useRef<Record<string, LocationValidationResult>>({});
  const trRef = useRef(tr);
  trRef.current = tr;
  const trrRef = useRef(trr);
  trrRef.current = trr;

  const { data: savedLocation } = useFirebaseItem<any>(
    'clientsLocations',
    userId || '',
    { once: true },
  );

  // Origen por defecto (solo en creación): ubicación guardada del cliente o GPS.
  useEffect(() => {
    if (initial || originCoords) return;
    if (savedLocation?.coords) {
      const coords = {
        latitude: savedLocation.coords.latitude,
        longitude: savedLocation.coords.longitude,
      };
      const address = savedLocation.address || formatCoords(coords);
      setOriginCoords(coords);
      setOrigin(address);
      setManualOriginAddress(address);
      setManualOriginDraft(coords);
      setCameraTarget(coords);
      return;
    }
    if (gpsCoords) {
      const coords = { latitude: gpsCoords.latitude, longitude: gpsCoords.longitude };
      setOriginCoords(coords);
      const label = trRef.current('defaults.myLocation');
      setOrigin(label);
      setManualOriginAddress(label);
      setManualOriginDraft(coords);
      setCameraTarget(coords);
    }
  }, [initial, originCoords, savedLocation, gpsCoords]);

  // Destino inicial del draft cuando se entra en modo selección.
  useEffect(() => {
    if (mapSelectionMode === 'destination') {
      const base = destinationCoords ?? originCoords ?? gpsCoords ?? DEFAULT_FALLBACK_COORDS;
      if (!manualDestinationDraft || metersBetween(manualDestinationDraft, base) > 5) {
        setManualDestinationDraft(base);
      }
      setManualDestinationDragging(false);
    }
  }, [mapSelectionMode]);

  const validatePoint = useCallback(async (coordsToCheck: Coords) => {
    const validation = await checkLocationAllowed(
      coordsToCheck,
      locationValidationCacheRef.current,
      trRef.current('alerts.serviceValidationFailed'),
    );
    if (!validation.allowed) {
      alertService.showInfoAlert(
        trRef.current('alerts.unavailableZoneTitle'),
        validation.message || trRef.current('alerts.unavailableZoneMessage'),
      );
      return null;
    }
    return validation;
  }, []);

  const recomputeRoute = useCallback(
    async (
      overrideOrigin?: Coords | null,
      overrideDestination?: Coords | null,
      overrideStops?: Array<{ address: string; coords: Coords | null }>,
    ) => {
      const startPoint = overrideOrigin ?? originCoords;
      const endPoint = overrideDestination ?? destinationCoords;
      const stopsSource = overrideStops ?? extraStops;
      const stopCoords = stopsSource.map((s) => s.coords).filter(Boolean) as Coords[];

      if (!startPoint || !endPoint) {
        setRouteCoordinates([]);
        setRouteInfo(null);
        return;
      }

      const requestId = ++routeRequestRef.current;
      setCalculatingRoute(true);
      try {
        const all = [startPoint, ...stopCoords, endPoint];
        let totalDistance = 0;
        let totalDuration = 0;
        let polyline: Coords[] = [];
        for (let i = 0; i < all.length - 1; i += 1) {
          const segment = await mapsService.getDirections(all[i], all[i + 1]);
          if (routeRequestRef.current !== requestId) return;
          if (!segment) throw new Error('Routing failed');
          totalDistance += segment.distance;
          totalDuration += segment.duration;
          polyline = polyline.concat(segment.polyline);
        }
        setRouteCoordinates(polyline);
        setRouteInfo({
          distanceKm: Number((totalDistance / 1000).toFixed(2)),
          durationMin: Math.ceil(totalDuration / 60),
        });
      } catch (error) {
        if (routeRequestRef.current === requestId) {
          console.warn('[RecurringRideForm] route calc failed', error);
          setRouteCoordinates([]);
          setRouteInfo(null);
        }
      } finally {
        if (routeRequestRef.current === requestId) setCalculatingRoute(false);
      }
    },
    [originCoords, destinationCoords, extraStops],
  );

  const rememberRecentLocation = useCallback((label: string, coordsValue: Coords | null) => {
    if (!coordsValue) return;
    setRecentLocations((prev) => {
      const filtered = prev.filter(
        (loc) =>
          Math.abs(loc.coords.latitude - coordsValue.latitude) >= 0.0001 ||
          Math.abs(loc.coords.longitude - coordsValue.longitude) >= 0.0001,
      );
      return [{ label, coords: coordsValue }, ...filtered].slice(0, 8);
    });
  }, []);

  const applySelectionForTarget = useCallback(
    async (target: Exclude<SelectionTarget, null>, label: string, coordsValue: Coords | null) => {
      const sanitizedLabel = label.trim() || trRef.current('defaults.locationFallback');

      if (target === 'origin') {
        if (!coordsValue) return;
        if (!(await validatePoint(coordsValue))) return;
        setOrigin(sanitizedLabel);
        setManualOriginAddress(sanitizedLabel);
        setManualOriginDraft(coordsValue);
        setOriginCoords(coordsValue);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        setCameraTarget(coordsValue);
        await recomputeRoute(coordsValue, undefined, undefined);
        return;
      }

      if (target === 'destination') {
        if (!coordsValue) return;
        if (!(await validatePoint(coordsValue))) return;
        setDestination(sanitizedLabel);
        setDestinationCoords(coordsValue);
        setManualDestinationDraft(null);
        setManualDestinationLoading(false);
        setManualDestinationDragging(false);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        setCameraTarget(coordsValue);
        await recomputeRoute(undefined, coordsValue, undefined);
        return;
      }

      if (target === 'new-stop') {
        if (!isValidCoordLocal(coordsValue)) return;
        if (!(await validatePoint(coordsValue))) return;
        const nextStops = [...extraStops, { address: sanitizedLabel, coords: coordsValue }];
        setExtraStops(nextStops);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        setCameraTarget(coordsValue);
        await recomputeRoute(undefined, undefined, nextStops);
        return;
      }

      if (typeof target === 'number') {
        if (!isValidCoordLocal(coordsValue)) return;
        if (!(await validatePoint(coordsValue))) return;
        const nextStops = extraStops.map((stop, index) =>
          index === target ? { address: sanitizedLabel, coords: coordsValue } : stop,
        );
        setExtraStops(nextStops);
        rememberRecentLocation(sanitizedLabel, coordsValue);
        setCameraTarget(coordsValue);
        await recomputeRoute(undefined, undefined, nextStops);
      }
    },
    [extraStops, recomputeRoute, rememberRecentLocation, validatePoint],
  );

  // Center-pin: movimiento del mapa.
  const originIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const destinationIdleTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastOriginCenterRef = useRef<Coords | null>(null);
  const lastDestinationCenterRef = useRef<Coords | null>(null);

  useEffect(() => () => {
    if (originIdleTimeoutRef.current) clearTimeout(originIdleTimeoutRef.current);
    if (destinationIdleTimeoutRef.current) clearTimeout(destinationIdleTimeoutRef.current);
  }, []);

  const handleRegionChangeCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode === 'origin') {
        if (originIdleTimeoutRef.current) clearTimeout(originIdleTimeoutRef.current);
        setManualOriginDragging(true);
        setManualOriginDraft(center);
      } else if (mapSelectionMode === 'destination') {
        if (destinationIdleTimeoutRef.current) clearTimeout(destinationIdleTimeoutRef.current);
        setManualDestinationDragging(true);
        setManualDestinationDraft(center);
      }
    },
    [mapSelectionMode],
  );

  const applyCenterPoint = useCallback(
    async (target: 'origin' | 'destination', center: Coords) => {
      const setLoading = target === 'origin' ? setManualOriginLoading : setManualDestinationLoading;
      setLoading(true);
      try {
        if (!(await validatePoint(center))) return;
        let address: string | null = null;
        try {
          address = await mapsService.reverseGeocode(center);
        } catch (e) {
          console.warn('[RecurringRideForm] reverseGeocode failed', e);
        }
        await applySelectionForTarget(target, address?.trim()?.length ? address : formatCoords(center), center);
      } finally {
        setLoading(false);
      }
    },
    [applySelectionForTarget, validatePoint],
  );

  const handleRegionChangeCompleteCenter = useCallback(
    (center: Coords) => {
      if (mapSelectionMode === 'origin') {
        setManualOriginDragging(false);
        originIdleTimeoutRef.current = setTimeout(async () => {
          const last = lastOriginCenterRef.current;
          if (last && metersBetween(last, center) < 20) {
            setMapSelectionMode(null);
            return;
          }
          lastOriginCenterRef.current = center;
          await applyCenterPoint('origin', center);
          setMapSelectionMode(null);
        }, REGION_IDLE_DELAY_MS);
        return;
      }
      if (mapSelectionMode !== 'destination') return;
      setManualDestinationDragging(false);
      destinationIdleTimeoutRef.current = setTimeout(async () => {
        const last = lastDestinationCenterRef.current;
        if (last && metersBetween(last, center) < 20) {
          setMapSelectionMode(null);
          return;
        }
        lastDestinationCenterRef.current = center;
        await applyCenterPoint('destination', center);
        setMapSelectionMode(null);
      }, REGION_IDLE_DELAY_MS);
    },
    [mapSelectionMode, applyCenterPoint],
  );

  // Tap en el mapa: paradas, o atajos (destino faltante → destino).
  const handleMapPress = useCallback(
    async (event: Coords) => {
      if (mapSelectionMode === 'origin' || mapSelectionMode === 'destination') return;
      const isStopMode =
        mapSelectionMode === 'extra-new' ||
        (mapSelectionMode !== null && typeof mapSelectionMode === 'object');
      if (isStopMode) setExtraStopSelectionLoading(true);
      try {
        const address = (await mapsService.reverseGeocode(event)) || formatCoords(event);
        if (mapSelectionMode === 'extra-new') {
          await applySelectionForTarget('new-stop', address, event);
          setMapSelectionMode(null);
          return;
        }
        if (mapSelectionMode && typeof mapSelectionMode === 'object') {
          await applySelectionForTarget(mapSelectionMode.index, address, event);
          setMapSelectionMode(null);
          return;
        }
        if (!destinationCoords) {
          await applySelectionForTarget('destination', address, event);
          return;
        }
        if (extraStops.length < RECURRING_RIDE_MAX_STOPS) {
          await applySelectionForTarget('new-stop', address, event);
        }
      } finally {
        if (isStopMode) setExtraStopSelectionLoading(false);
      }
    },
    [mapSelectionMode, destinationCoords, extraStops.length, applySelectionForTarget],
  );

  // Overlay de búsqueda
  const openLocationSearch = useCallback(
    (target: 'origin' | 'destination' | number | 'new-stop') => {
      setActiveSelection(target);
      setShowSearchOverlay(true);
      setMapSelectionMode(null);
      let initialQuery = '';
      if (target === 'origin') initialQuery = manualOriginAddress || origin;
      else if (target === 'destination') initialQuery = destination;
      else if (typeof target === 'number') initialQuery = extraStops[target]?.address || '';
      setSearchQuery(initialQuery);
    },
    [manualOriginAddress, origin, destination, extraStops],
  );

  const closeSearchOverlay = useCallback(() => {
    setShowSearchOverlay(false);
    setSearchQuery('');
    setActiveSelection(null);
  }, []);

  const handlePickFromMap = useCallback(() => {
    if (!activeSelection) return;
    if (activeSelection === 'origin') setMapSelectionMode('origin');
    else if (activeSelection === 'destination') setMapSelectionMode('destination');
    else if (activeSelection === 'new-stop') setMapSelectionMode('extra-new');
    else if (typeof activeSelection === 'number') {
      setMapSelectionMode({ type: 'extra-edit', index: activeSelection });
    }
    setShowSearchOverlay(false);
    setSearchQuery('');
  }, [activeSelection]);

  const handleUseCurrentLocation = useCallback(async () => {
    if (!gpsCoords) {
      alertService.showInfoAlert(
        trRef.current('alerts.locationUnavailableTitle'),
        trRef.current('alerts.locationUnavailableMessage'),
      );
      return;
    }
    const target = activeSelection || 'origin';
    const label =
      target === 'origin' ? trRef.current('defaults.myLocation') : trRef.current('defaults.currentLocation');
    await applySelectionForTarget(target, label, gpsCoords);
    closeSearchOverlay();
  }, [gpsCoords, activeSelection, applySelectionForTarget, closeSearchOverlay]);

  const handleRemoveStop = useCallback(
    (index: number) => {
      const nextStops = extraStops.filter((_, idx) => idx !== index);
      setExtraStops(nextStops);
      void recomputeRoute(undefined, undefined, nextStops);
    },
    [extraStops, recomputeRoute],
  );

  const canSave =
    title.trim().length > 0 && !!originCoords && !!destinationCoords && !saving && !deleting;

  const buildInput = useCallback((): RecurringRideInput & { id?: string } => ({
    id: initial?.id,
    title: title.trim(),
    origin: {
      lat: originCoords!.latitude,
      lng: originCoords!.longitude,
      address: origin || manualOriginAddress || formatCoords(originCoords!),
    },
    destination: {
      lat: destinationCoords!.latitude,
      lng: destinationCoords!.longitude,
      address: destination || formatCoords(destinationCoords!),
    },
    extraStops: extraStops
      .filter((s) => !!s.coords)
      .map((s) => ({ lat: s.coords!.latitude, lng: s.coords!.longitude, address: s.address })),
    vehicleType,
    designatedDriverMode: vehicleType === 'designated_driver' ? designatedDriverMode : undefined,
    paymentMethod,
    passengers,
    comment: comment.trim() || undefined,
  }), [initial?.id, title, originCoords, origin, manualOriginAddress, destinationCoords, destination, extraStops, vehicleType, designatedDriverMode, paymentMethod, passengers, comment]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!userId || !canSave) return false;
    setSaving(true);
    try {
      await saveRecurringRide(userId, buildInput());
      alertService.showSuccessAlert(trrRef.current('saved'), title.trim());
      return true;
    } catch (error: any) {
      if (String(error?.message || '').startsWith('MAX_RECURRING_RIDES')) {
        alertService.showInfoAlert(
          trrRef.current('limitReached', { max: MAX_RECURRING_RIDES }),
          '',
        );
      } else {
        console.warn('[RecurringRideForm] save failed', error);
        alertService.showErrorAlert(trrRef.current('saveError'));
      }
      return false;
    } finally {
      setSaving(false);
    }
  }, [userId, canSave, buildInput, title]);

  const remove = useCallback(async (): Promise<boolean> => {
    if (!userId || !initial?.id) return false;
    setDeleting(true);
    try {
      await deleteRecurringRide(userId, initial.id);
      return true;
    } catch (error) {
      console.warn('[RecurringRideForm] delete failed', error);
      alertService.showErrorAlert(trrRef.current('deleteError'));
      return false;
    } finally {
      setDeleting(false);
    }
  }, [userId, initial?.id]);

  return {
    isEditing: !!initial,
    title, setTitle,
    origin, originCoords,
    destination, destinationCoords,
    extraStops, setExtraStops,
    vehicleType, setVehicleType,
    designatedDriverMode, setDesignatedDriverMode,
    paymentMethod, setPaymentMethod,
    passengers, setPassengers,
    comment, setComment,
    mapSelectionMode, setMapSelectionMode,
    activeSelection,
    showSearchOverlay, searchQuery, setSearchQuery,
    recentLocations,
    manualOriginDraft, manualOriginAddress, manualOriginLoading, manualOriginDragging,
    manualDestinationDraft, manualDestinationLoading, manualDestinationDragging,
    extraStopSelectionLoading,
    cameraTarget,
    routeCoordinates, routeInfo, calculatingRoute,
    saving, deleting, canSave,
    openLocationSearch, closeSearchOverlay, handlePickFromMap,
    applySelectionForTarget, handleUseCurrentLocation,
    handleMapPress, handleRegionChangeCenter, handleRegionChangeCompleteCenter,
    handleRemoveStop, recomputeRoute,
    save, remove,
  };
}
```

Nota: el hook usa `useFirebaseItem` para `clientsLocations` (misma fuente que `useSearchRideLocation`).

- [ ] **Step 2: Crear `RecurringRideFormScreen.tsx`**

```tsx
// Frontend/src/screens/Client/RecurringRideFormScreen.tsx
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  TextInput,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Animated,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import DynamicMap from '../../components/map/DynamicMap';
import { MAP_ICONS } from '../../constants/mapIcons';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAddressSearch } from '../../hooks/client/SearchRideScreen/useAddressSearch';
import { useRecurringRideForm, RECURRING_RIDE_MAX_STOPS } from '../../hooks/client/RecurringRideForm/useRecurringRideForm';
import { SearchRideRouteBubble } from '../../components/client/SearchRide/SearchRideRouteBubble';
import { SearchRideSearchOverlay } from '../../components/client/SearchRide/SearchRideSearchOverlay';
import alertService from '../../services/alertService';
import { normalizeSuggestion, type NormalizedSuggestion } from '../../utils/suggestions';
import type { RecurringRide } from '../../types/recurringRide';

const { MANUAL_ORIGIN, DESTINATION_PIN, MULTI_STOP_PIN } = MAP_ICONS;
const DEFAULT_FALLBACK_COORDS = { latitude: 12.1364, longitude: -86.2514 };

type VehicleType = 'moto' | 'auto' | 'designated_driver';
const VEHICLE_OPTIONS: Array<{ type: VehicleType; icon: keyof typeof MaterialIcons.glyphMap; labelKey: string }> = [
  { type: 'moto', icon: 'two-wheeler', labelKey: 'shared.searchRide.vehicle.motoLabel' },
  { type: 'auto', icon: 'directions-car', labelKey: 'shared.searchRide.vehicle.autoLabel' },
  { type: 'designated_driver', icon: 'person-pin', labelKey: 'shared.searchRide.vehicle.designatedLabel' },
];

export default function RecurringRideFormScreen({ navigation, route }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const { coords } = useLocation();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const tr = useCallback(
    (path: string, options?: Record<string, any>) => t(`shared.searchRide.${path}`, options),
    [t],
  );
  const trr = useCallback(
    (path: string, options?: Record<string, any>) => t(`client.recurringRides.${path}`, options),
    [t],
  );

  const initialRide: RecurringRide | undefined = route?.params?.ride;

  const form = useRecurringRideForm({ initial: initialRide, userId: user?.id, gpsCoords: coords, tr, trr });
  const {
    isEditing, title, setTitle,
    origin, originCoords, destination, destinationCoords, extraStops,
    vehicleType, setVehicleType, designatedDriverMode, setDesignatedDriverMode,
    paymentMethod, setPaymentMethod, passengers, setPassengers,
    comment, setComment,
    mapSelectionMode, activeSelection,
    showSearchOverlay, searchQuery, setSearchQuery, recentLocations,
    manualOriginDraft, manualOriginAddress, manualOriginLoading,
    manualDestinationDraft, manualDestinationLoading,
    cameraTarget, routeCoordinates, routeInfo, calculatingRoute,
    saving, deleting, canSave,
    openLocationSearch, closeSearchOverlay, handlePickFromMap,
    applySelectionForTarget, handleUseCurrentLocation,
    handleMapPress, handleRegionChangeCenter, handleRegionChangeCompleteCenter,
    handleRemoveStop, save, remove,
  } = form;

  const {
    searchResults, searchLoading, setSearchLoading, searchError, setSearchError, reset: resetSearch,
  } = useAddressSearch(
    showSearchOverlay,
    searchQuery,
    coords,
    tr('defaults.locationFallback'),
    tr('labels.noResults'),
    tr('search.error'),
  );

  const orderedRouteRows = useMemo(() => {
    const rows: Array<{ kind: 'origin' | 'destination' | 'extra'; index?: number }> = [{ kind: 'origin' }];
    extraStops.forEach((_, index) => rows.push({ kind: 'extra', index }));
    rows.push({ kind: 'destination' });
    return rows;
  }, [extraStops]);

  const canAddExtraStop = extraStops.length < RECURRING_RIDE_MAX_STOPS;

  const centerPinActive =
    mapSelectionMode === 'origin' || mapSelectionMode === 'destination';
  const isStopMapMode =
    mapSelectionMode === 'extra-new' ||
    (mapSelectionMode !== null && typeof mapSelectionMode === 'object');

  const handleSelectSuggestion = useCallback(
    async (suggestion: NormalizedSuggestion) => {
      const target = activeSelection || 'destination';
      try {
        setSearchLoading(true);
        let coordsValue = suggestion.coords;
        if (!coordsValue && suggestion.placeId) {
          const mapsService = (await import('../../services/mapsService')).default;
          coordsValue = (await mapsService.getPlaceDetails(suggestion.placeId)) || null;
        }
        if (!coordsValue) {
          alertService.showErrorAlert(tr('alerts.locationFetchFailed'));
          return;
        }
        await applySelectionForTarget(target, suggestion.fullText, coordsValue);
        closeSearchOverlay();
      } finally {
        setSearchLoading(false);
      }
    },
    [activeSelection, applySelectionForTarget, closeSearchOverlay, setSearchLoading, tr],
  );

  const handleSelectSavedLocation = useCallback(
    async (location: { label: string; coords: { latitude: number; longitude: number } }) => {
      if (!activeSelection) return;
      await applySelectionForTarget(activeSelection, location.label, location.coords);
      closeSearchOverlay();
    },
    [activeSelection, applySelectionForTarget, closeSearchOverlay],
  );

  const handleSave = useCallback(async () => {
    if (await save()) navigation?.goBack?.();
  }, [save, navigation]);

  const handleDelete = useCallback(() => {
    alertService.showConfirmAlert(
      trr('deleteConfirmTitle'),
      trr('deleteConfirmBody', { title: title.trim() }),
      async () => {
        if (await remove()) navigation?.goBack?.();
      },
      undefined,
      trr('delete'),
      t('common.actions.cancel'),
      true,
    );
  }, [remove, navigation, title, trr, t]);

  const maxPassengers = vehicleType === 'moto' || (vehicleType === 'designated_driver' && designatedDriverMode === 'moto') ? 1 : 4;

  const visibleExtraStopMarkers = extraStops
    .map((stop, index) =>
      stop.coords
        ? { latitude: stop.coords.latitude, longitude: stop.coords.longitude, index, title: t('common.mapPins.extraStop', { index: index + 1 }), label: stop.address || undefined }
        : null,
    )
    .filter(Boolean) as Array<{ latitude: number; longitude: number; index: number; title?: string; label?: string }>;

  const selectionTitle = useMemo(() => {
    if (activeSelection === 'origin') return tr('search.selectionOriginTitle');
    if (activeSelection === 'destination') return tr('search.selectionDestinationTitle');
    if (activeSelection === 'new-stop') return tr('search.selectionNewStopTitle', { current: extraStops.length + 1, max: RECURRING_RIDE_MAX_STOPS });
    if (typeof activeSelection === 'number') return tr('search.selectionEditStopTitle', { index: activeSelection + 1 });
    return tr('search.selectionGenericTitle');
  }, [activeSelection, extraStops.length, tr]);

  const selectionDescription = useMemo(() => {
    if (activeSelection === 'origin') return tr('search.descriptionOrigin');
    if (activeSelection === 'destination') return tr('search.descriptionDestination');
    if (activeSelection === 'new-stop' || typeof activeSelection === 'number') return tr('search.descriptionExtra');
    return tr('search.descriptionGeneric');
  }, [activeSelection, tr]);

  const mapCenter = originCoords ?? coords ?? DEFAULT_FALLBACK_COORDS;

  return (
    <View style={styles.container}>
      <View style={StyleSheet.absoluteFill}>
        <DynamicMap
          latitude={mapCenter.latitude}
          longitude={mapCenter.longitude}
          onMapPress={handleMapPress}
          onRegionChangeCenter={centerPinActive ? handleRegionChangeCenter : undefined}
          onRegionChangeCompleteCenter={centerPinActive ? handleRegionChangeCompleteCenter : undefined}
          originMarker={originCoords ?? undefined}
          destinationMarker={destinationCoords ?? undefined}
          extraStopMarkers={visibleExtraStopMarkers}
          routeCoordinates={routeCoordinates}
          showPinBubbles
          originTitle={t('common.mapPins.origin')}
          originLabel={manualOriginAddress || origin || undefined}
          destinationTitle={t('common.mapPins.destination')}
          destinationLabel={destination || undefined}
          showUserLocation={false}
          autoFitEnabled={!centerPinActive}
          cameraTarget={cameraTarget}
        />
        {centerPinActive && (
          <View pointerEvents="none" style={styles.centerPinContainer}>
            <Animated.Image
              source={mapSelectionMode === 'origin' ? MANUAL_ORIGIN : DESTINATION_PIN}
              style={styles.centerPinImage}
              resizeMode="contain"
            />
          </View>
        )}
      </View>

      <TouchableOpacity
        style={[styles.backButton, { top: insets.top + 12 }]}
        onPress={() => navigation?.goBack?.()}
        accessibilityLabel={tr('accessibility.back')}
        accessibilityRole="button"
      >
        <Ionicons name="chevron-back" size={20} color={colors.text} />
      </TouchableOpacity>

      <SearchRideRouteBubble
        top={insets.top + 12}
        orderedRouteRows={orderedRouteRows}
        canAddExtraStop={canAddExtraStop}
        manualOriginLoading={manualOriginLoading}
        manualOriginAddress={manualOriginAddress}
        manualOriginDraft={manualOriginDraft}
        manualDestinationLoading={manualDestinationLoading}
        manualDestinationDraft={manualDestinationDraft}
        destination={destination}
        destinationCoords={destinationCoords}
        mapSelectionMode={mapSelectionMode}
        extraDestinations={extraStops}
        onRouteRowPress={(row) => {
          if (row.kind === 'origin') openLocationSearch('origin');
          else if (row.kind === 'destination') openLocationSearch('destination');
          else if (typeof row.index === 'number') openLocationSearch(row.index);
        }}
        onAddExtraStop={() => openLocationSearch('new-stop')}
        onRemoveStop={handleRemoveStop}
        styles={styles}
        tr={tr}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.bottomPanelWrapper}
      >
        <View style={[styles.bottomPanel, { paddingBottom: Math.max(insets.bottom, 12) }]}>
          <ScrollView
            style={styles.formScroll}
            contentContainerStyle={styles.formContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <Text style={styles.screenTitle}>
              {isEditing ? trr('formTitleEdit') : trr('formTitleNew')}
            </Text>

            <Text style={styles.fieldLabel}>{trr('nameLabel')}</Text>
            <TextInput
              style={styles.input}
              placeholder={trr('namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={title}
              onChangeText={setTitle}
              maxLength={40}
            />

            <Text style={styles.fieldLabel}>{trr('vehicleSection')}</Text>
            <View style={styles.chipsRow}>
              {VEHICLE_OPTIONS.map((option) => {
                const selected = vehicleType === option.type;
                return (
                  <Pressable
                    key={option.type}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}
                    onPress={() => {
                      setVehicleType(option.type);
                      if (option.type === 'moto' || (option.type === 'designated_driver' && designatedDriverMode === 'moto')) {
                        setPassengers(1);
                      }
                    }}
                    accessibilityRole="button"
                  >
                    <MaterialIcons name={option.icon} size={16} color={selected ? '#fff' : colors.textSecondary} />
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                      {t(option.labelKey)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            {vehicleType === 'designated_driver' && (
              <View style={styles.chipsRow}>
                {(['auto', 'moto'] as const).map((mode) => {
                  const selected = designatedDriverMode === mode;
                  return (
                    <Pressable
                      key={mode}
                      style={[styles.optionChip, selected && styles.optionChipSelected]}
                      onPress={() => setDesignatedDriverMode(mode)}
                      accessibilityRole="button"
                    >
                      <MaterialIcons
                        name={mode === 'moto' ? 'two-wheeler' : 'directions-car'}
                        size={16}
                        color={selected ? '#fff' : colors.textSecondary}
                      />
                      <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                        {tr(`designatedDriver.${mode}`)}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}

            <Text style={styles.fieldLabel}>{trr('paymentSection')}</Text>
            <View style={styles.chipsRow}>
              {(['cash', 'card'] as const).map((method) => {
                const selected = paymentMethod === method;
                return (
                  <Pressable
                    key={method}
                    style={[styles.optionChip, selected && styles.optionChipSelected]}
                    onPress={() => setPaymentMethod(method)}
                    accessibilityRole="button"
                  >
                    <MaterialIcons
                      name={method === 'cash' ? 'payments' : 'credit-card'}
                      size={16}
                      color={selected ? '#fff' : colors.textSecondary}
                    />
                    <Text style={[styles.optionChipText, selected && styles.optionChipTextSelected]}>
                      {trr(method)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <Text style={styles.fieldLabel}>{trr('passengersLabel')}</Text>
            <View style={styles.passengerRow}>
              <TouchableOpacity
                style={[styles.counterBtn, passengers <= 1 && styles.counterBtnDisabled]}
                disabled={passengers <= 1}
                onPress={() => setPassengers(Math.max(1, passengers - 1))}
                accessibilityRole="button"
              >
                <MaterialIcons name="remove" size={18} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.passengerCount}>{passengers}</Text>
              <TouchableOpacity
                style={[styles.counterBtn, passengers >= maxPassengers && styles.counterBtnDisabled]}
                disabled={passengers >= maxPassengers}
                onPress={() => setPassengers(Math.min(maxPassengers, passengers + 1))}
                accessibilityRole="button"
              >
                <MaterialIcons name="add" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <Text style={styles.fieldLabel}>{trr('commentLabel')}</Text>
            <TextInput
              style={[styles.input, styles.commentInput]}
              placeholder={trr('commentPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={comment}
              onChangeText={setComment}
              multiline
              maxLength={140}
            />

            <Text style={styles.routeInfoText}>
              {calculatingRoute
                ? trr('routeCalculating')
                : routeInfo
                  ? trr('routeInfo', { distance: routeInfo.distanceKm, duration: routeInfo.durationMin })
                  : trr('incompleteRoute')}
            </Text>
          </ScrollView>

          <View style={styles.ctaRow}>
            {isEditing && (
              <TouchableOpacity
                style={[styles.deleteCta, deleting && styles.ctaDisabled]}
                disabled={deleting || saving}
                onPress={handleDelete}
                accessibilityRole="button"
              >
                <MaterialIcons name="delete-outline" size={18} color="#C62828" />
              </TouchableOpacity>
            )}
            <TouchableOpacity
              style={[styles.saveCta, !canSave && styles.ctaDisabled]}
              disabled={!canSave}
              onPress={handleSave}
              accessibilityRole="button"
            >
              <Text style={styles.saveCtaText}>
                {saving ? tr('cta.loading') : trr('save')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>

      {showSearchOverlay && (
        <SearchRideSearchOverlay
          selectionTitle={selectionTitle}
          selectionDescription={selectionDescription}
          isDestinationSelection={activeSelection === 'destination'}
          shouldHighlightMapAction={activeSelection === 'destination' && !destinationCoords}
          hasConfirmedDestination={!!destinationCoords}
          searchQuery={searchQuery}
          searchLoading={searchLoading}
          searchError={searchError}
          searchResults={searchResults}
          favoriteLocations={[]}
          recentLocations={recentLocations}
          activeSelection={activeSelection}
          colors={colors}
          onSetSearchQuery={setSearchQuery}
          onSetSearchError={setSearchError}
          onClose={closeSearchOverlay}
          onUseCurrentLocation={handleUseCurrentLocation}
          onPickFromMap={handlePickFromMap}
          onSelectSuggestion={handleSelectSuggestion}
          onSelectSavedLocation={handleSelectSavedLocation}
          styles={styles}
          tr={tr}
        />
      )}
    </View>
  );
}
```

`createStyles(colors, isDark)` para esta pantalla: misma cabecera que `SearchRideScreen` (mismos tokens) y las claves usadas por `SearchRideRouteBubble` (`routeBubble`, `routeTimeline`, `timelineRow`, `timelineLeft`, `timelineIcon`, `timelineConnector`, `timelineCenter`, `timelineContent`, `timelineContentCompact`, `inlineAddStop`, `inlineAddStopIcon`, `timelineLabel`, `timelineSubtitle`, `timelineRemove`, `timelineRemoveText`), por `SearchRideSearchOverlay` (`searchOverlay`, `searchCard`, `searchHeader`, `searchHeaderTextBlock`, `searchTitle`, `searchDescription`, `searchCloseButton`, `searchCloseText`, `destinationGuidanceCard`, `destinationGuidanceTitle`, `destinationGuidanceText`, `destinationGuidanceSteps`, `destinationGuidanceStepPill`, `destinationGuidanceStepText`, `destinationConfirmedPill`, `destinationConfirmedText`, `searchInputWrapper`, `searchInputLabel`, `searchInputHelper`, `searchInputContainer`, `searchInput`, `searchActionsRow`, `searchActionChip`, `searchActionPrimary`, `searchActionText`, `searchActionTextPrimary`, `searchScroll`, `savedSection`, `savedSectionTitle`, `savedItem`, `savedItemLabel`, `savedItemCoords`, `searchResultsSection`, `searchLoadingRow`, `searchLoadingText`, `searchErrorText`, `searchHintText`, `searchResultItem`, `searchResultMain`, `searchResultSecondary`) — copiar verbatim de `SearchRideScreen.createStyles` — más las propias:

```ts
    screenTitle: { fontSize: 17, fontWeight: '800', color: textPrimary, marginBottom: 4 },
    fieldLabel: { fontSize: 12, fontWeight: '700', color: textSecondary, marginTop: 4, textTransform: 'uppercase', letterSpacing: 0.4 },
    input: {
      borderRadius: 12,
      backgroundColor: inputBg,
      paddingHorizontal: 14,
      paddingVertical: Platform.select({ ios: 12, android: 8, default: 8 }),
      borderWidth: 1,
      borderColor: borderColor,
      color: textPrimary,
      fontSize: 15,
    },
    commentInput: { minHeight: 56, textAlignVertical: 'top' },
    chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    optionChip: {
      flexDirection: 'row', alignItems: 'center', gap: 6,
      paddingVertical: 9, paddingHorizontal: 13, borderRadius: 999,
      backgroundColor: cardBg, borderWidth: 1, borderColor: borderColor,
    },
    optionChipSelected: { backgroundColor: accent, borderColor: accent },
    optionChipText: { fontSize: 13, fontWeight: '700', color: textPrimary },
    optionChipTextSelected: { color: '#fff' },
    passengerRow: { flexDirection: 'row', alignItems: 'center', gap: 14 },
    counterBtn: {
      width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: cardBg, borderWidth: 1, borderColor: borderColor,
    },
    counterBtnDisabled: { opacity: 0.4 },
    passengerCount: { fontSize: 16, fontWeight: '800', color: textPrimary, minWidth: 22, textAlign: 'center' },
    routeInfoText: { fontSize: 12.5, color: textSecondary, marginTop: 4 },
    bottomPanelWrapper: { position: 'absolute', left: 0, right: 0, bottom: 0 },
    bottomPanel: {
      paddingHorizontal: 16,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      backgroundColor: cardBg,
      shadowColor: '#000', shadowOpacity: 0.15, shadowRadius: 12, elevation: 12,
      maxHeight: '58%',
    },
    formScroll: { flexGrow: 0 },
    formContent: { paddingVertical: 12, gap: 8 },
    ctaRow: { flexDirection: 'row', gap: 10, paddingTop: 8 },
    saveCta: {
      flex: 1, backgroundColor: accent, paddingVertical: 14, borderRadius: 16,
      alignItems: 'center', justifyContent: 'center',
    },
    saveCtaText: { color: '#fff', fontSize: 16, fontWeight: '800' },
    deleteCta: {
      width: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center',
      borderWidth: 1, borderColor: 'rgba(198,40,40,0.35)', backgroundColor: cardBg,
    },
    ctaDisabled: { opacity: 0.5 },
    centerPinContainer: {
      position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
      alignItems: 'center', justifyContent: 'center', zIndex: 10,
    },
    centerPinImage: { width: 48, height: 48 },
    backButton: { /* copiar de SearchRideScreen */ },
```

- [ ] **Step 3: Typecheck**

Run: `cd Frontend && npx tsc --noEmit`
Expected: sin errores en los archivos nuevos

- [ ] **Step 4: Commit**

```bash
git add Frontend/src/hooks/client/RecurringRideForm/useRecurringRideForm.ts Frontend/src/screens/Client/RecurringRideFormScreen.tsx Frontend/src/navigation/ClientStack.tsx
git commit -m "feat: pantalla de creacion/edicion de viajes recurrentes con mapa"
```

---

### Task 8: Precarga en `SearchRideScreen`

**Files:**
- Modify: `Frontend/src/hooks/client/SearchRideScreen/useSearchRideState.ts`
- Modify: `Frontend/src/screens/Client/SearchRideScreen.tsx`

- [ ] **Step 1: `useSearchRideState` acepta un `initial` opcional**

```ts
import type { RecurringRide } from '../../../types/recurringRide';
```

Firma: `export function useSearchRideState(initial?: RecurringRide): SearchRideState`

Cambios en los `useState` (resto igual):

```ts
  const [origin, setOrigin] = useState(initial?.origin.address ?? '');
  const [destination, setDestination] = useState(initial?.destination.address ?? '');
  const [originCoords, setOriginCoords] = useState<Coords | null>(
    initial ? { latitude: initial.origin.lat, longitude: initial.origin.lng } : null,
  );
  const [destinationCoords, setDestinationCoords] = useState<Coords | null>(
    initial ? { latitude: initial.destination.lat, longitude: initial.destination.lng } : null,
  );
  const [extraDestinations, setExtraDestinations] = useState<Array<{ address: string; coords: Coords | null }>>(
    initial?.extraStops?.map((s) => ({ address: s.address, coords: { latitude: s.lat, longitude: s.lng } })) ?? [],
  );
```

```ts
  const [manualOriginDraft, setManualOriginDraft] = useState<Coords | null>(
    initial ? { latitude: initial.origin.lat, longitude: initial.origin.lng } : null,
  );
  const [manualOriginAddress, setManualOriginAddress] = useState(initial?.origin.address ?? '');
```

```ts
  const [hasManualOriginOverride, setHasManualOriginOverride] = useState(!!initial);
  const [hasPinnedOrigin, setHasPinnedOrigin] = useState(!!initial);
```

```ts
  const [passengersByVehicle, setPassengersByVehicle] = useState<Record<VehicleType, number>>({
    moto: initial && initial.vehicleType === 'moto' ? initial.passengers : 1,
    auto: initial && initial.vehicleType === 'auto' ? initial.passengers : 1,
    designated_driver: initial && initial.vehicleType === 'designated_driver' ? initial.passengers : 1,
  });
  const [vehicleType, setVehicleType] = useState<VehicleType>(initial?.vehicleType ?? 'auto');
  const [designatedDriverMode, setDesignatedDriverMode] = useState<DesignatedDriverMode>(initial?.designatedDriverMode ?? 'auto');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(initial?.paymentMethod ?? 'cash');
  const [priceSuggestion, setPriceSuggestion] = useState(
    initial?.priceSuggestion != null ? String(initial.priceSuggestion) : '',
  );
  const [rideComment, setRideComment] = useState(initial?.comment ?? '');
```

- [ ] **Step 2: `SearchRideScreen` lee el param y dispara el cálculo de ruta**

Cambiar la firma y llamada al hook:

```tsx
export default function SearchRideScreenNewDesign({ navigation, route }: any) {
  const recurringRide: RecurringRide | undefined = route?.params?.recurringRide;
  // ...
  const state = useSearchRideState(recurringRide);
```

Agregar import del tipo:

```ts
import type { RecurringRide } from '../../types/recurringRide';
```

Efecto one-shot (después de `recomputeRouteWith`):

```ts
  const hydratedRouteOnceRef = useRef(false);
  useEffect(() => {
    if (hydratedRouteOnceRef.current) return;
    if (!recurringRide) return;
    if (!originCoords || !destinationCoords) return;
    hydratedRouteOnceRef.current = true;
    void recomputeRouteWith();
  }, [recurringRide, originCoords, destinationCoords, recomputeRouteWith]);
```

Por qué funciona: `hasManualOriginOverride=true` evita que el efecto de init de
`useSearchRideLocation` pise el origen guardado; `originCoords`/`destinationCoords`
ya vienen hidratados y `recomputeRouteWith()` calcula ruta/precios.

- [ ] **Step 3: Typecheck**

Run: `cd Frontend && npx tsc --noEmit`
Expected: sin errores nuevos

- [ ] **Step 4: Commit**

```bash
git add Frontend/src/hooks/client/SearchRideScreen/useSearchRideState.ts Frontend/src/screens/Client/SearchRideScreen.tsx
git commit -m "feat: SearchRide acepta viaje recurrente precargado"
```

---

### Task 9: Verificación final

- [ ] **Step 1: Typecheck global**

Run: `cd Frontend && npx tsc --noEmit`
Expected: sin errores nuevos vs. baseline

- [ ] **Step 2: Tests**

Run: `cd Frontend && npx jest src/services/tests/recurringRidesService.test.ts`
Expected: PASS

- [ ] **Step 3: Checklist manual en simulador**

- Home muestra chip "+ Nuevo viaje".
- Crear viaje con título + origen + destino → polyline visible → Guardar → chip aparece sin recargar (onSnapshot).
- Tap en chip → SearchRide con origen/destino/vehículo/pago precargados y precio calculado → Confirmar solicita normal.
- Chip ✏️ → lista → Editar cambia datos → chip refleja cambio → Eliminar lo quita.
- `pendingAction` activo → chips no se muestran (branch existente).

---

## Self-Review

- **Spec coverage:** chips (T5), pantalla form con mapa+pins+polyline (T7), lista gestión (T6), SearchRide precargado (T8), persistencia `users/{uid}.recurringRides` + reglas (T1), i18n (T3), servicio+hook (T1/T2), límite 10 (T1).
- **Placeholders:** código completo en cada step; único comentario "copiar de SearchRideScreen" en el bloque de estilos — las claves están enumeradas exhaustivamente y el fuente está referenciado con path exacto.
- **Type consistency:** `RecurringRide`, `RecurringRideInput`, `useRecurringRides`, `saveRecurringRide(uid, input)`, `deleteRecurringRide(uid, id)`, `subscribeRecurringRides(uid, cb)`, `useRecurringRideForm({initial,userId,gpsCoords,tr,trr})`, `RECURRING_RIDE_MAX_STOPS` — consistentes entre tareas.
