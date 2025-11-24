import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus, Platform } from 'react-native';
import proximityService from '../services/proximityService';

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

  useEffect(() => {
    if (Platform.OS !== 'android' || !enabled) {
      return;
    }

    console.log('✅ [overlay:hook] Listener activado - gestión automática de burbuja');

    const listener = AppState.addEventListener('change', async (nextState) => {
      const previousState = appState.current;
      appState.current = nextState;

      console.log(`📱 [overlay:hook] AppState cambió: ${previousState} → ${nextState}`);

      // Prevenir operaciones concurrentes
      if (isProcessingRef.current) {
        console.log('⏭️ [overlay:hook] Operación en progreso, saltando');
        return;
      }

      // App va a background (de active a background/inactive)
      if (previousState === 'active' && (nextState === 'background' || nextState === 'inactive')) {
        console.log(`🫧 [overlay:hook] isProcessingRef.current antes: ${isProcessingRef.current}`);
        isProcessingRef.current = true;
        try {
          console.log('🫧 [overlay:hook] App fue a background - mostrando burbuja');
          console.log('🫧 [overlay:hook] Llamando a ensureOverlayBubbleForBackground()...');
          await proximityService.ensureOverlayBubbleForBackground();
          console.log('🫧 [overlay:hook] ensureOverlayBubbleForBackground() completado');
        } catch (error) {
          console.warn('[overlay:hook] Error mostrando overlay en background:', error);
        } finally {
          console.log('🫧 [overlay:hook] Limpiando isProcessingRef.current');
          isProcessingRef.current = false;
        }
      }

      // App vuelve a foreground (de background/inactive a active)
      if ((previousState === 'background' || previousState === 'inactive') && nextState === 'active') {
        console.log(`🧹 [overlay:hook] isProcessingRef.current antes de limpiar: ${isProcessingRef.current}`);
        isProcessingRef.current = true;
        try {
          console.log('🧹 [overlay:hook] App volvió a foreground - ocultando burbuja');
          await proximityService.hideOverlayBubble('appReturnedToForeground');
          console.log('🧹 [overlay:hook] hideOverlayBubble completado');
        } catch (error) {
          console.warn('[overlay:hook] Error ocultando overlay:', error);
        } finally {
          console.log('🧹 [overlay:hook] Limpiando isProcessingRef.current');
          isProcessingRef.current = false;
        }
      }
    });

    return () => {
      listener.remove();
      isProcessingRef.current = false;
      console.log('🔇 [overlay:hook] Listener removido');
    };
  }, [enabled]);
}
