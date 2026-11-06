import { Platform } from 'react-native';
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
    variant?: 'app' | 'nearby_ride';
  }): Promise<boolean>;
  hideRideOverlay(): Promise<boolean>;
  openOverlaySettings(): Promise<boolean>;
  bringAppToFront(rideId: string): Promise<boolean>;
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

export type OcrTextBlock = {
  text: string;
  frame: { left: number; top: number; right: number; bottom: number };
};

export type OcrResult = {
  text: string;
  blocks: OcrTextBlock[];
};

declare class DocumentOcrModuleType extends NativeModule {
  recognizeText(imagePath: string): Promise<OcrResult>;
}

export type CallKitActionEvent = {
  callId: string;
};

export type VoipTokenEvent = {
  token: string;
};

export type CallKitModuleEvents = {
  onCallKitAnswer: (params: CallKitActionEvent) => void;
  onCallKitEnd: (params: CallKitActionEvent) => void;
  onVoipToken: (params: VoipTokenEvent) => void;
};

declare class CallKitModuleType extends NativeModule<CallKitModuleEvents> {
  reportIncomingCall(callId: string, callerName: string): Promise<boolean>;
  answerCall(callId: string): Promise<boolean>;
  endCall(callId: string): Promise<boolean>;
  reportCallEnded(callId: string, reason: string): Promise<boolean>;
  endAllCalls(): Promise<boolean>;
  getVoipToken(): Promise<string | null>;
}

declare class RideProgressModuleType extends NativeModule {
  showRideProgress(
    rideId: string,
    title: string,
    body: string,
    progress: number
  ): Promise<boolean>;
  hideRideProgress(): Promise<boolean>;
}

declare class RundiLiveActivityModuleType extends NativeModule {
  liveActivitiesEnabled(): Promise<boolean>;
  hasRideActivity(): Promise<boolean>;
  showRideActivity(args: {
    rideId: string;
    price: number;
    distanceKm: number;
    clientName?: string | null;
    featureCodes?: string[];
    variant?: 'app' | 'nearby_ride';
  }): Promise<boolean>;
  hideRideActivity(): Promise<boolean>;
  openLiveActivitySettings(): Promise<boolean>;
}

const isAndroid = Platform.OS === 'android';
const isIOS = Platform.OS === 'ios';

export const OverlayPermissionModule = isAndroid
  ? requireNativeModule<OverlayPermissionModuleType>('OverlayPermissionModule')
  : null;
export const ForegroundServiceModule = isAndroid
  ? requireNativeModule<ForegroundServiceModuleType>('ForegroundServiceModule')
  : null;
export const WorkManagerModule = isAndroid
  ? requireNativeModule<WorkManagerModuleType>('WorkManagerModule')
  : null;
export const BatteryOptimizationModule = isAndroid
  ? requireNativeModule<BatteryOptimizationModuleType>('BatteryOptimizationModule')
  : null;
export const RideProgressModule = isAndroid
  ? requireNativeModule<RideProgressModuleType>('RideProgressModule')
  : null;
export const RundiLiveActivityModule = isIOS
  ? requireNativeModule<RundiLiveActivityModuleType>('RundiNative')
  : null;
export const CallKitModule = isIOS
  ? requireNativeModule<CallKitModuleType>('CallKitModule')
  : null;

// iOS usa Apple Vision; Android usa ML Kit (ver DocumentOcrModule nativo)
export const DocumentOcrModule = isAndroid || isIOS
  ? requireNativeModule<DocumentOcrModuleType>('DocumentOcr')
  : null;

export default {
  OverlayPermissionModule,
  ForegroundServiceModule,
  WorkManagerModule,
  BatteryOptimizationModule,
  RideProgressModule,
  RundiLiveActivityModule,
  CallKitModule,
  DocumentOcrModule,
};
