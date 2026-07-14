import { NativeModule, requireNativeModule } from 'expo';

export type OverlayOpenedEvent = {
  rideId: string;
};

export type RundiNativeModuleEvents = {
  onOverlayOpened: (params: OverlayOpenedEvent) => void;
};

declare class OverlayPermissionModuleType extends NativeModule<RundiNativeModuleEvents> {
  hasOverlayPermission(): Promise<boolean>;
  requestOverlayPermission(): Promise<boolean>;
  showRideOverlay(args: {
    rideId: string;
    price: number;
    distanceKm: number;
    clientName?: string | null;
  }): Promise<boolean>;
  hideRideOverlay(): Promise<boolean>;
  openOverlaySettings(): Promise<boolean>;
}

declare class ForegroundServiceModuleType extends NativeModule {
  start(title: string | null, body: string | null): Promise<boolean>;
  stop(): Promise<boolean>;
}

declare class WorkManagerModuleType extends NativeModule {
  scheduleLocationIntegrity(intervalMinutes: number): Promise<boolean>;
  cancelLocationIntegrity(): Promise<boolean>;
}

declare class BatteryOptimizationModuleType extends NativeModule {
  isIgnoringOptimizations(): Promise<boolean>;
  requestIgnoreOptimizations(): Promise<boolean>;
}

export const OverlayPermissionModule =
  requireNativeModule<OverlayPermissionModuleType>('OverlayPermissionModule');
export const ForegroundServiceModule =
  requireNativeModule<ForegroundServiceModuleType>('ForegroundServiceModule');
export const WorkManagerModule =
  requireNativeModule<WorkManagerModuleType>('WorkManagerModule');
export const BatteryOptimizationModule =
  requireNativeModule<BatteryOptimizationModuleType>('BatteryOptimizationModule');

export default {
  OverlayPermissionModule,
  ForegroundServiceModule,
  WorkManagerModule,
  BatteryOptimizationModule,
};
