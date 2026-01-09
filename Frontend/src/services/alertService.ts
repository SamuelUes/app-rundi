import { Linking, Platform } from 'react-native';

export type ToastType = 'success' | 'error' | 'info' | 'warning' | 'confirm';

export type ToastActionVariant = 'default' | 'primary' | 'destructive';

export interface ToastAction {
  label: string;
  onPress?: () => void;
  variant?: ToastActionVariant;
}

export interface ToastPayload {
  type: ToastType;
  message: string;
  title?: string;
  duration?: number;
  icon?: string;
  backgroundColor?: string;
  accentColor?: string;
  actions?: ToastAction[];
  onClose?: () => void;
}

type ToastHandler = (payload: ToastPayload) => void;

let handler: ToastHandler | undefined;

export const setToastHandler = (toastHandler?: ToastHandler) => {
  handler = toastHandler;
};

const emitToast = (payload: ToastPayload) => {
  if (handler) {
    handler(payload);
    return;
  }

  console.log(
    `🔔 [Toast:${payload.type}] ${payload.title ? `${payload.title} - ` : ''}${payload.message}`
  );
  payload.onClose?.();
};

export const showErrorAlert = (message: string, callback?: () => void) => {
  emitToast({
    type: 'error',
    title: 'Error',
    message,
    onClose: callback,
  });
};

type SuccessAlertOptions = {
  duration?: number;
  onClose?: () => void;
};

export const showSuccessAlert = (
  title: string,
  message: string,
  callbackOrOptions?: (() => void) | SuccessAlertOptions
) => {
  const options: SuccessAlertOptions =
    typeof callbackOrOptions === 'function'
      ? { onClose: callbackOrOptions }
      : callbackOrOptions || {};

  emitToast({
    type: 'success',
    title,
    message,
    duration: options.duration,
    onClose: options.onClose,
  });
};

export const showInfoAlert = (title: string, message: string, callback?: () => void) => {
  emitToast({
    type: 'info',
    title,
    message,
    onClose: callback,
  });
};

export const showConfirmAlert = (
  title: string,
  message: string,
  onConfirm: () => void,
  onCancel?: () => void,
  confirmText: string = 'Confirmar',
  cancelText: string = 'Cancelar',
  destructive: boolean = false
) => {
  emitToast({
    type: 'confirm',
    title,
    message,
    duration: 0,
    onClose: onCancel,
    actions: [
      {
        label: cancelText,
        variant: 'default',
        onPress: onCancel,
      },
      {
        label: confirmText,
        variant: destructive ? 'destructive' : 'primary',
        onPress: onConfirm,
      },
    ],
  });
};

interface OptionsAlertButton {
  text: string;
  onPress?: () => void;
  style?: 'default' | 'cancel' | 'destructive';
}

export const showOptionsAlert = (
  title: string,
  message: string,
  options: OptionsAlertButton[],
  cancelable: boolean = true
) => {
  emitToast({
    type: 'info',
    title,
    message,
    duration: cancelable ? 6000 : 0,
    onClose: cancelable ? undefined : options.find((opt) => opt.style === 'cancel')?.onPress,
    actions: options.map((option) => ({
      label: option.text,
      onPress: option.onPress,
      variant: option.style === 'destructive' ? 'destructive' : option.style === 'cancel' ? 'default' : 'primary',
    })),
  });
};

export const showNavigationAlert = (
  title: string,
  message: string,
  onNavigate: () => void,
  onCancel?: () => void
) => {
  showOptionsAlert(title, message, [
    { text: 'Cancelar', style: 'cancel', onPress: onCancel },
    { text: 'Navegar', style: 'default', onPress: onNavigate },
  ]);
};

export const showExternalNavAlert = async (
  message: string,
  storageKey: string,
  itemId: string,
  navigationCallback: () => void
) => {
  try {
    const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
    await AsyncStorage.setItem(storageKey, itemId);
    console.log('💾 Guardado ID en AsyncStorage:', itemId);

    emitToast({
      type: 'info',
      title: 'Importante',
      message,
      duration: 0,
      onClose: navigationCallback,
      actions: [
        {
          label: 'Entendido',
          variant: 'primary',
          onPress: navigationCallback,
        },
      ],
    });
  } catch (error) {
    console.error('Error guardando estado:', error);
    navigationCallback();
  }
};

export const checkLocationPermissionWithAlert = async (callback: () => void) => {
  try {
    const { requestForegroundPermissionsAsync } = await import('expo-location');
    const { status } = await requestForegroundPermissionsAsync();

    if (status !== 'granted') {
      emitToast({
        type: 'warning',
        title: 'Permisos requeridos',
        message: 'Se necesita acceso a tu ubicación para usar esta función.',
        duration: 0,
        onClose: () => undefined,
        actions: [
          {
            label: 'Cancelar',
            variant: 'default',
          },
          {
            label: 'Ir a Ajustes',
            variant: 'primary',
            onPress: async () => {
              if (Platform.OS === 'ios') {
                Linking.openURL('app-settings:');
              } else {
                Linking.openSettings();
              }
            },
          },
        ],
      });
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
  checkLocationPermissionWithAlert,
  setToastHandler,
};