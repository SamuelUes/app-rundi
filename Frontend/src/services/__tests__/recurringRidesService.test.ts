import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import { deleteDoc, getDoc, getDocs, setDoc } from 'firebase/firestore';
import {
  deleteRecurringRide,
  listRecurringRides,
  MAX_RECURRING_RIDES,
  sanitizeRecurringRide,
  saveRecurringRide,
} from '../recurringRidesService';
import type { RecurringRideInput } from '../../types/recurringRide';

jest.mock('firebase/firestore', () => ({
  collection: jest.fn((_db: any, ...segments: string[]) => ({ segments })),
  doc: jest.fn((parent: any, ...segments: string[]) => ({ parent, segments })),
  getDoc: jest.fn(),
  getDocs: jest.fn(),
  setDoc: jest.fn(async () => undefined),
  deleteDoc: jest.fn(async () => undefined),
  onSnapshot: jest.fn(() => () => undefined),
}));
jest.mock('../../config/firebase', () => ({
  getFirebaseFirestore: jest.fn(async () => ({})),
}));

const mockedGetDoc = getDoc as jest.MockedFunction<typeof getDoc>;
const mockedGetDocs = getDocs as jest.MockedFunction<typeof getDocs>;
const mockedSetDoc = setDoc as jest.MockedFunction<typeof setDoc>;
const mockedDeleteDoc = deleteDoc as jest.MockedFunction<typeof deleteDoc>;

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

const docsSnap = (items: Array<{ id: string; data: any }>) =>
  ({
    size: items.length,
    forEach: (cb: (d: any) => void) =>
      items.forEach((item) => cb({ id: item.id, data: () => item.data })),
  }) as any;

const emptyUserDoc = { data: () => undefined } as any;

describe('sanitizeRecurringRide', () => {
  it('returns null for invalid entries and fills defaults', () => {
    expect(sanitizeRecurringRide({ title: 'x' }, 'id1')).toBeNull();
    const ride = sanitizeRecurringRide(
      { origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } },
      'id1',
    )!;
    expect(ride.id).toBe('id1');
    expect(ride.vehicleType).toBe('auto');
    expect(ride.paymentMethod).toBe('cash');
    expect(ride.passengers).toBe(1);
  });
});

describe('recurringRidesService (subcollection)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default: user doc without legacy array, existing ride doc absent.
    mockedGetDoc.mockResolvedValue(emptyUserDoc);
    mockedGetDocs.mockResolvedValue(docsSnap([]));
  });

  it('lists sanitized rides from the subcollection', async () => {
    mockedGetDocs.mockResolvedValue(docsSnap([{ id: 'rr_existing', data: stored }]));
    const rides = await listRecurringRides('u1');
    expect(rides).toHaveLength(1);
    expect(rides[0].id).toBe('rr_existing');
  });

  it('migrates legacy array field into the subcollection once', async () => {
    mockedGetDocs
      .mockResolvedValueOnce(docsSnap([]))
      .mockResolvedValueOnce(docsSnap([{ id: 'rr_existing', data: stored }]));
    mockedGetDoc.mockResolvedValue({ data: () => ({ recurringRides: [stored] }) } as any);

    const rides = await listRecurringRides('u1');
    expect(mockedSetDoc).toHaveBeenCalled();
    expect(rides).toHaveLength(1);
    expect(rides[0].id).toBe('rr_existing');
  });

  it('creates a new ride doc with generated id', async () => {
    const ride = await saveRecurringRide('u1', sampleInput);
    expect(ride.id).toMatch(/^rr_/);
    expect(ride.createdAt).toBeGreaterThan(0);
    const [ref, data, opts] = mockedSetDoc.mock.calls[0] as any;
    expect((ref as any).segments).toEqual([ride.id]);
    expect(data.title).toBe('Casa → Trabajo');
    expect(opts).toEqual({ merge: true });
  });

  it('updates an existing ride preserving createdAt', async () => {
    mockedGetDoc.mockResolvedValue({ data: () => stored } as any);
    await saveRecurringRide('u1', { ...sampleInput, id: 'rr_existing' });
    const [, data] = mockedSetDoc.mock.calls[0] as any;
    expect(data.id).toBe('rr_existing');
    expect(data.createdAt).toBe(1000);
    expect(data.title).toBe('Casa → Trabajo');
    // Existing doc => no size check needed for max
  });

  it('rejects creating beyond the max', async () => {
    mockedGetDocs.mockResolvedValue(
      docsSnap(Array.from({ length: MAX_RECURRING_RIDES }, (_, i) => ({ id: `rr_${i}`, data: stored }))),
    );
    await expect(saveRecurringRide('u1', sampleInput)).rejects.toThrow('MAX_RECURRING_RIDES');
  });

  it('strips undefined fields before writing', async () => {
    await saveRecurringRide('u1', {
      ...sampleInput,
      designatedDriverMode: undefined,
      comment: undefined,
      priceSuggestion: undefined,
    } as any);
    const [, data] = mockedSetDoc.mock.calls[0] as any;
    expect('designatedDriverMode' in data).toBe(false);
    expect('comment' in data).toBe(false);
    expect('priceSuggestion' in data).toBe(false);
  });

  it('deletes the doc by id', async () => {
    await deleteRecurringRide('u1', 'rr_existing');
    expect(mockedDeleteDoc).toHaveBeenCalledTimes(1);
    const [ref] = mockedDeleteDoc.mock.calls[0] as any;
    expect((ref as any).segments).toEqual(['rr_existing']);
  });
});
