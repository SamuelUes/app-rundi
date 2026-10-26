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

  it('strips undefined fields before writing to Firestore', async () => {
    mockedGetDoc.mockResolvedValue(docWith([]));
    await saveRecurringRide('u1', {
      ...sampleInput,
      designatedDriverMode: undefined,
      comment: undefined,
      priceSuggestion: undefined,
    } as any);
    const [, payload] = mockedUpdateDoc.mock.calls[0] as any;
    const saved = payload.recurringRides[0];
    expect('designatedDriverMode' in saved).toBe(false);
    expect('comment' in saved).toBe(false);
    expect('priceSuggestion' in saved).toBe(false);
    expect(saved.origin.address).toBe('Casa');
  });

  it('rejects saving beyond the max', async () => {
    const full = Array.from({ length: MAX_RECURRING_RIDES }, (_, i) => ({ ...stored, id: `rr_${i}` }));
    mockedGetDoc.mockResolvedValue(docWith(full));
    await expect(saveRecurringRide('u1', sampleInput)).rejects.toThrow('MAX_RECURRING_RIDES');
  });

  it('deletes by id and no-ops when missing', async () => {
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    await deleteRecurringRide('u1', 'rr_existing');
    const [, payload] = mockedUpdateDoc.mock.calls[0] as any;
    expect(payload.recurringRides).toHaveLength(0);

    jest.clearAllMocks();
    mockedGetDoc.mockResolvedValue(docWith([stored]));
    await deleteRecurringRide('u1', 'rr_other');
    expect(mockedUpdateDoc).not.toHaveBeenCalled();
  });
});
