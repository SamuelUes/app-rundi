import { Platform } from 'react-native';
import { CallKitModule } from '../../modules/rundi-native/src';
import type { EventSubscription } from 'expo';

const isIOS = Platform.OS === 'ios';

export type CallKitEndReason = 'remote' | 'unanswered' | 'failed';

/**
 * Puente JS ↔ CallKit/PushKit (iOS). Con la app viva el reporte llega por el
 * listener de Firestore; con la app muerta el push VoIP reporta directo en
 * nativo y las acciones se bufferan hasta que JS suscribe listeners.
 */
export const callkit = {
  async reportIncomingCall(callId: string, callerName: string) {
    if (!isIOS || !CallKitModule) return;
    try {
      await CallKitModule.reportIncomingCall(callId, callerName);
    } catch (error) {
      console.warn('[callkit] reportIncomingCall error:', error);
    }
  },

  /** Marca la llamada nativa como contestada (aceptada desde UI in-app). */
  async answerCall(callId: string) {
    if (!isIOS || !CallKitModule) return;
    try {
      await CallKitModule.answerCall(callId);
    } catch (error) {
      console.warn('[callkit] answerCall error:', error);
    }
  },

  /** Termina la llamada nativa (dispara onCallKitEnd en el delegate). */
  async endCall(callId: string) {
    if (!isIOS || !CallKitModule) return;
    try {
      await CallKitModule.endCall(callId);
    } catch (error) {
      console.warn('[callkit] endCall error:', error);
    }
  },

  /** La llamada terminó del otro lado (missed/rejected/ended remoto). */
  async reportCallEnded(callId: string, reason: CallKitEndReason = 'remote') {
    if (!isIOS || !CallKitModule) return;
    try {
      await CallKitModule.reportCallEnded(callId, reason);
    } catch (error) {
      console.warn('[callkit] reportCallEnded error:', error);
    }
  },

  async endAllCalls() {
    if (!isIOS || !CallKitModule) return;
    try {
      await CallKitModule.endAllCalls();
    } catch (error) {
      console.warn('[callkit] endAllCalls error:', error);
    }
  },

  addAnswerListener(
    callback: (event: { callId: string }) => void,
  ): EventSubscription | null {
    if (!isIOS || !CallKitModule) return null;
    return CallKitModule.addListener('onCallKitAnswer', callback);
  },

  addEndListener(
    callback: (event: { callId: string }) => void,
  ): EventSubscription | null {
    if (!isIOS || !CallKitModule) return null;
    return CallKitModule.addListener('onCallKitEnd', callback);
  },

  /** Token PushKit (VoIP) cacheado en nativo; null si APNs aún no responde. */
  async getVoipToken(): Promise<string | null> {
    if (!isIOS || !CallKitModule) return null;
    try {
      return await CallKitModule.getVoipToken();
    } catch (error) {
      console.warn('[callkit] getVoipToken error:', error);
      return null;
    }
  },

  /** Token VoIP nuevo/rotado — registrarlo de nuevo en el backend. */
  addVoipTokenListener(
    callback: (event: { token: string }) => void,
  ): EventSubscription | null {
    if (!isIOS || !CallKitModule) return null;
    return CallKitModule.addListener('onVoipToken', callback);
  },
};

export default callkit;
