import { resolveBestEffortLocation } from '../preflight/resolveBestEffortLocation';
import * as Location from 'expo-location';
import { loadLastKnownLocation } from '../../hooks/shared/location/useForegroundLocation';

jest.mock('expo-location', () => ({
  getLastKnownPositionAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  Accuracy: { Balanced: 3 },
}));

jest.mock('../../hooks/shared/location/useForegroundLocation', () => ({
  loadLastKnownLocation: jest.fn(),
  withTimeout: jest.fn((promise: Promise<unknown>, timeoutMs: number, label: string) =>
    new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(label)), timeoutMs);
      promise.then(
        (value) => { clearTimeout(timer); resolve(value); },
        (error) => { clearTimeout(timer); reject(error); },
      );
    }),
  ),
}));

const getLastKnown = Location.getLastKnownPositionAsync as jest.Mock;
const getCurrent = Location.getCurrentPositionAsync as jest.Mock;
const getPermissions = Location.getForegroundPermissionsAsync as jest.Mock;
const loadStored = loadLastKnownLocation as jest.Mock;

const position = (latitude: number, longitude: number) => ({
  coords: { latitude, longitude },
});

describe('resolveBestEffortLocation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    getLastKnown.mockResolvedValue(null);
    getCurrent.mockResolvedValue(null);
    getPermissions.mockResolvedValue({ status: 'denied' });
    loadStored.mockResolvedValue(null);
  });

  it('usa la última ubicación fresca sin consultar más fuentes', async () => {
    getLastKnown.mockResolvedValueOnce(position(12.1, -86.2));

    await expect(resolveBestEffortLocation()).resolves.toEqual({ lat: 12.1, lng: -86.2 });
    expect(getLastKnown).toHaveBeenCalledTimes(1);
    expect(loadStored).not.toHaveBeenCalled();
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('cae a cualquier última ubicación conocida cuando no hay fix fresco', async () => {
    getLastKnown
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(position(12.2, -86.3));

    await expect(resolveBestEffortLocation()).resolves.toEqual({ lat: 12.2, lng: -86.3 });
    expect(getLastKnown).toHaveBeenCalledTimes(2);
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('cae a la ubicación persistida cuando el SO no devuelve last-known', async () => {
    loadStored.mockResolvedValue({ latitude: 12.3, longitude: -86.4 });

    await expect(resolveBestEffortLocation()).resolves.toEqual({ lat: 12.3, lng: -86.4 });
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('pide un fix actual con permiso concedido cuando no hay ubicación previa', async () => {
    getPermissions.mockResolvedValue({ status: 'granted' });
    getCurrent.mockResolvedValue(position(12.4, -86.5));

    await expect(resolveBestEffortLocation()).resolves.toEqual({ lat: 12.4, lng: -86.5 });
    expect(getCurrent).toHaveBeenCalledTimes(1);
  });

  it('devuelve null sin permiso de ubicación', async () => {
    getPermissions.mockResolvedValue({ status: 'denied' });

    await expect(resolveBestEffortLocation()).resolves.toBeNull();
    expect(getCurrent).not.toHaveBeenCalled();
  });

  it('devuelve null cuando el fix actual excede el timeout', async () => {
    jest.useFakeTimers();
    try {
      getPermissions.mockResolvedValue({ status: 'granted' });
      getCurrent.mockReturnValue(new Promise(() => {}));

      const result = resolveBestEffortLocation();
      await jest.advanceTimersByTimeAsync(8_000);
      await expect(result).resolves.toBeNull();
    } finally {
      jest.useRealTimers();
    }
  });
});
