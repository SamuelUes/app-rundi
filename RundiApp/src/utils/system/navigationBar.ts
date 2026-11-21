/**
 * Estilo de la navigation bar de Android sin el componente <NavigationBar>
 * de expo-navigation-bar: ese componente aplica sus defaults al desmontarse
 * mediante llamadas nativas sin await; si la Activity ya no existe
 * (recreación/destroy) la promesa rechaza y aparece como
 * "Uncaught (in promise): ... current activity is no longer available".
 * Aquí la llamada es imperativa y el rechazo se traga — sin Activity no hay
 * barra que actualizar.
 */

import { Platform } from 'react-native';
import { requireNativeModule } from 'expo';

type ExpoNavigationBarModule = {
  setStyle(style: 'light' | 'dark'): Promise<void>;
};

let cachedModule: ExpoNavigationBarModule | null | undefined;

function getModule(): ExpoNavigationBarModule | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  if (cachedModule === undefined) {
    try {
      cachedModule = requireNativeModule<ExpoNavigationBarModule>('ExpoNavigationBar');
    } catch {
      cachedModule = null;
    }
  }
  return cachedModule ?? null;
}

/** Aplica el estilo de botones de la navigation bar ('light' = iconos claros). */
export function applyNavigationBarStyle(style: 'light' | 'dark'): void {
  try {
    void getModule()?.setStyle(style).catch(() => {});
  } catch {
    // Módulo no disponible (Expo Go) o Activity destruida.
  }
}
