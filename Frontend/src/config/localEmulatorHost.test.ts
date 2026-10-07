import {
  buildFunctionsEmulatorBaseUrl,
  resolveLocalEmulatorHost,
  resolveLocalSupabaseUrl,
} from './localEmulatorHost';

describe('local emulator host helpers', () => {
  it('maps loopback to the Android host alias only on Android', () => {
    expect(resolveLocalEmulatorHost('127.0.0.1', 'ios')).toBe('127.0.0.1');
    expect(resolveLocalEmulatorHost('localhost', 'ios')).toBe('localhost');
    expect(resolveLocalEmulatorHost('127.0.0.1', 'android')).toBe('10.0.2.2');
    expect(resolveLocalEmulatorHost('localhost', 'android')).toBe('10.0.2.2');
    expect(resolveLocalEmulatorHost('192.168.1.4', 'android')).toBe('192.168.1.4');
  });

  it('rewrites only local Supabase URLs for Android Emulator', () => {
    expect(resolveLocalSupabaseUrl('http://127.0.0.1:54321', 'android')).toBe(
      'http://10.0.2.2:54321',
    );
    expect(resolveLocalSupabaseUrl('http://localhost:54321/storage/v1', 'android')).toBe(
      'http://10.0.2.2:54321/storage/v1',
    );
    expect(resolveLocalSupabaseUrl('https://rundi-dev.supabase.co', 'android')).toBe(
      'https://rundi-dev.supabase.co',
    );
    expect(resolveLocalSupabaseUrl('http://127.0.0.1:54321', 'ios')).toBe(
      'http://127.0.0.1:54321',
    );
  });

  it('builds the Firebase Functions Emulator base URL per platform', () => {
    expect(
      buildFunctionsEmulatorBaseUrl('rundi-dev', 'us-central1', '127.0.0.1', 'ios'),
    ).toBe('http://127.0.0.1:5001/rundi-dev/us-central1');
    expect(
      buildFunctionsEmulatorBaseUrl('rundi-dev', 'us-central1', '127.0.0.1', 'android'),
    ).toBe('http://10.0.2.2:5001/rundi-dev/us-central1');
  });
});
