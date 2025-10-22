/**
 * Servicio centralizado para manejo de alertas y diálogos
 * Proporciona funciones reutilizables para mostrar alertas comunes
 * y reducir la duplicación de código en la aplicación
 */

import { Alert, Platform, Linking } from 'react-native';

/**
 * Muestra una alerta de error
 * @param message Mensaje de error a mostrar
 * @param callback Función a ejecutar al cerrar la alerta
 */
export const showErrorAlert = (message: string, callback?: () => void) => {
  Alert.alert('Error', message, [{ text: 'OK', onPress: callback }]);
};

/**
 * Muestra una alerta de éxito
 * @param title Título de la alerta
 * @param message Mensaje a mostrar
 * @param callback Función a ejecutar al cerrar la alerta
 */
export const showSuccessAlert = (title: string, message: string, callback?: () => void) => {
  Alert.alert(title, message, [{ text: 'OK', onPress: callback }]);
};

/**
 * Muestra una alerta de confirmación con opciones Confirmar/Cancelar
 * @param title Título de la alerta
 * @param message Mensaje a mostrar
 * @param onConfirm Función a ejecutar si el usuario confirma
 * @param onCancel Función a ejecutar si el usuario cancela
 * @param confirmText Texto del botón de confirmación (default: "Confirmar")
 * @param cancelText Texto del botón de cancelación (default: "Cancelar")
 * @param destructive Si el botón de confirmación debe tener estilo destructivo
 */
export const showConfirmAlert = (
  title: string, 
  message: string, 
  onConfirm: () => void,
  onCancel?: () => void,
  confirmText: string = 'Confirmar',
  cancelText: string = 'Cancelar',
  destructive: boolean = false
) => {
  Alert.alert(
    title, 
    message, 
    [
      { text: cancelText, style: 'cancel', onPress: onCancel },
      { 
        text: confirmText, 
        style: destructive ? 'destructive' : 'default', 
        onPress: onConfirm 
      }
    ]
  );
};

/**
 * Muestra una alerta informativa
 * @param title Título de la alerta
 * @param message Mensaje a mostrar
 * @param callback Función a ejecutar al cerrar la alerta
 */
export const showInfoAlert = (title: string, message: string, callback?: () => void) => {
  Alert.alert(title, message, [{ text: 'OK', onPress: callback }]);
};

/**
 * Muestra una alerta con múltiples opciones
 * @param title Título de la alerta
 * @param message Mensaje a mostrar
 * @param options Array de opciones para mostrar al usuario
 * @param cancelable Si la alerta se puede cerrar tocando fuera de ella
 */
export const showOptionsAlert = (
  title: string, 
  message: string, 
  options: {text: string, onPress?: () => void, style?: 'default' | 'cancel' | 'destructive'}[],
  cancelable: boolean = true
) => {
  Alert.alert(
    title, 
    message, 
    options, 
    { cancelable }
  );
};

/**
 * Muestra una alerta de navegación (por ejemplo para abrir Google Maps)
 * @param title Título de la alerta
 * @param message Mensaje a mostrar
 * @param onNavigate Función para navegar
 */
export const showNavigationAlert = (
  title: string,
  message: string,
  onNavigate: () => void,
  onCancel?: () => void
) => {
  Alert.alert(
    title,
    message,
    [
      { text: 'Cancelar', style: 'cancel', onPress: onCancel },
      { text: 'Navegar', onPress: onNavigate }
    ]
  );
};

/**
 * Guarda estado antes de navegar a otra app (como Google Maps)
 * @param message Mensaje para mostrar al usuario
 * @param storageKey Clave para guardar en AsyncStorage
 * @param itemId ID a guardar
 * @param navigationCallback Función para navegar después del mensaje
 */
export const showExternalNavAlert = async (
  message: string,
  storageKey: string,
  itemId: string,
  navigationCallback: () => void
) => {
  try {
    // Guardar ID en AsyncStorage
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(storageKey, itemId);
    console.log('💾 Guardado ID en AsyncStorage:', itemId);
    
    // Mostrar alerta informativa
    Alert.alert(
      '⚠️ Importante',
      message,
      [{ text: 'Entendido', onPress: navigationCallback }],
      { cancelable: false }
    );
  } catch (error) {
    console.error('Error guardando estado:', error);
    // Si falla el guardado, igual permitimos la navegación
    navigationCallback();
  }
};

/**
 * Verifica si hay permisos de ubicación y muestra alertas apropiadas
 * @param callback Función a ejecutar si los permisos están concedidos
 */
export const checkLocationPermissionWithAlert = async (callback: () => void) => {
  try {
    const { requestForegroundPermissionsAsync } = await import('expo-location');
    const { status } = await requestForegroundPermissionsAsync();
    
    if (status !== 'granted') {
      Alert.alert(
        'Permisos requeridos',
        'Se necesita acceso a tu ubicación para usar esta función.',
        [
          { text: 'Cancelar', style: 'cancel' },
          { 
            text: 'Ir a Ajustes', 
            onPress: async () => {
              // Abrir ajustes de la app si está disponible
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            } 
          }
        ]
      );
      return;
    }
    callback();
  } catch (error) {
    showErrorAlert('No se pudo acceder a la ubicación');
  }
};

export default {
  showErrorAlert,
  showSuccessAlert,
  showConfirmAlert,
  showInfoAlert,
  showOptionsAlert,
  showNavigationAlert,
  showExternalNavAlert,
  checkLocationPermissionWithAlert
};