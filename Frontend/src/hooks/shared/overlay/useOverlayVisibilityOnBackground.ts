import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import proximityService, {
  isRegistrationUploadsInProgress,
  subscribeRegistrationUploadsInProgress,
} from '../../../services/proximityService';

/**
 * Hook automático: Muestra la burbuja al ir a background y la oculta al volver a foreground.
 * 
 * Comportamiento:
 * - Cuando la app pasa a background → muestra la burbuja flotante con:
 *   • El viaje más cercano si hay alguno disponible
 *   • Una burbuja de fallback (icono de la app) si no hay viajes cercanos
 * - Cuando la app vuelve a foreground → oculta la burbuja flotante
 * 
 * La burbuja flotante permite al conductor:
 * - Ver que hay un viaje disponible sin abrir la app
 * - Tocar la burbuja para abrir la app y ver los detalles del viaje
 * - Arrastrar la burbuja por la pantalla para posicionarla
 */
export function useOverlayVisibilityOnBackground(enabled: boolean) {
  const appState = useRef<AppStateStatus>(AppState.currentState);
  const isProcessingRef = useRef(false);
  const uploadsGateRef = useRef(false);
  const activeStabilizeTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const backgroundConfirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHideReasonRef = useRef<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return;
    }

    console.log('✅ [overlay:hook] Listener activado - gestión automática de burbuja');

    let cancelled = false;

    const initGate = async () => {
      uploadsGateRef.current = await isRegistrationUploadsInProgress();
      if (uploadsGateRef.current) {
        console.log('⏸️ [overlay:hook] Overlay suspendido por uploads de registro');
      }
    };
    initGate();

    const unsubscribeGate = subscribeRegistrationUploadsInProgress((value) => {
      uploadsGateRef.current = value;
      console.log(
        value
          ? '⏸️ [overlay:hook] Overlay suspendido por uploads de registro'
          : '▶️ [overlay:hook] Overlay reanudado (uploads finalizados)',
      );
    });

    const ACTIVE_STABILIZE_MS = 2000;
    const BACKGROUND_CONFIRM_MS = 100;

    const isBackgroundLike = (state: AppStateStatus) => state === 'background' || state === 'inactive';

    const clearActiveStabilizationTimer = () => {
      if (activeStabilizeTimeoutRef.current) {
        clearTimeout(activeStabilizeTimeoutRef.current);
        activeStabilizeTimeoutRef.current = null;
      }
    };

    const clearBackgroundConfirmTimer = () => {
      if (backgroundConfirmTimeoutRef.current) {
        clearTimeout(backgroundConfirmTimeoutRef.current);
        backgroundConfirmTimeoutRef.current = null;
      }
    };

    const startActiveStabilization = () => {
      clearActiveStabilizationTimer();
      activeStabilizeTimeoutRef.current = setTimeout(() => {
        activeStabilizeTimeoutRef.current = null;
        console.log('🟢 [overlay:hook] Ventana de estabilización finalizada');
      }, ACTIVE_STABILIZE_MS);
      console.log(`🟢 [overlay:hook] Estabilizando estado ACTIVE por ${ACTIVE_STABILIZE_MS}ms`);
    };

    const hideOverlay = async (reason: string) => {
      if (uploadsGateRef.current) {
        console.log(`⏭️ [overlay:hook] hideOverlayBubble saltado (${reason}) - uploads en progreso`);
        return;
      }

      if (isProcessingRef.current) {
        pendingHideReasonRef.current = reason;
        console.log(`⏭️ [overlay:hook] hideOverlayBubble en cola (${reason}) - operación en curso`);
        return;
      }

      isProcessingRef.current = true;
      try {
        console.log('🧹 [overlay:hook] App volvió a foreground - ocultando burbuja');
        await proximityService.hideOverlayBubble(reason);
        console.log('🧹 [overlay:hook] hideOverlayBubble completado');
      } catch (error) {
        console.warn('[overlay:hook] Error ocultando overlay:', error);
      } finally {
        isProcessingRef.current = false;
      }
    };

    const flushPendingHideIfNeeded = async () => {
      if (isProcessingRef.current) {
        return;
      }

      if (appState.current !== 'active') {
        return;
      }

      if (!pendingHideReasonRef.current) {
        return;
      }

      const reason = pendingHideReasonRef.current;
      pendingHideReasonRef.current = null;
      await hideOverlay(reason);
    };

    const showOverlayForBackground = async (force = false) => {
      if (uploadsGateRef.current) {
        console.log('⏭️ [overlay:hook] Mostrar overlay omitido - uploads en progreso');
        return;
      }

      if (!isBackgroundLike(appState.current)) {
        console.log(`🫧 [overlay:hook] Estado actual ${appState.current}, se cancela mostrar burbuja`);
        return;
      }

      if (!force && activeStabilizeTimeoutRef.current) {
        console.log('⏭️ [overlay:hook] Ignorando overlay porque seguimos en ventana de estabilización');
        return;
      }

      if (isProcessingRef.current) {
        console.log('⏭️ [overlay:hook] Operación en progreso, se omite mostrar burbuja');
        return;
      }

      isProcessingRef.current = true;
      try {
        console.log('🫧 [overlay:hook] App fue a background - mostrando burbuja');
        console.log('🫧 [overlay:hook] Llamando a ensureOverlayBubbleForBackground()...');
        await proximityService.ensureOverlayBubbleForBackground();
        console.log('🫧 [overlay:hook] ensureOverlayBubbleForBackground() completado');
      } catch (error) {
        console.warn('[overlay:hook] Error mostrando overlay en background:', error);
      } finally {
        isProcessingRef.current = false;
        if (!cancelled) {
          await flushPendingHideIfNeeded();
        }
      }
    };

    const scheduleOverlayForBackground = (force = false) => {
      clearBackgroundConfirmTimer();
      // On Android, JS thread gets suspended quickly when app goes to background.
      // Show overlay immediately instead of waiting for a timer that may never fire.
      if (!isBackgroundLike(appState.current)) {
        console.log('⏭️ [overlay:hook] Background transitorio detectado, no se mostrará burbuja');
        return;
      }
      showOverlayForBackground(force);
    };

    const listener = AppState.addEventListener('change', async (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;

      console.log(`📱 [overlay:hook] AppState cambió: ${previousState} → ${nextState}`);

      // App va a background (de active a background/inactive)
      if (previousState === 'active' && nextState === 'background') {
        scheduleOverlayForBackground(true);
        return;
      }

      if (previousState === 'active' && nextState === 'inactive') {
        scheduleOverlayForBackground();
        return;
      }

      // App vuelve a foreground (de background/inactive a active)
      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {
        clearBackgroundConfirmTimer();
        startActiveStabilization();
        await hideOverlay('appReturnedToForeground');
        await flushPendingHideIfNeeded();
      }
    });

    return () => {
      listener.remove();
      clearActiveStabilizationTimer();
      clearBackgroundConfirmTimer();
      pendingHideReasonRef.current = null;
      isProcessingRef.current = false;
      unsubscribeGate();
      cancelled = true;
      console.log('🔇 [overlay:hook] Listener removido');
    };
  }, [enabled]);
}
