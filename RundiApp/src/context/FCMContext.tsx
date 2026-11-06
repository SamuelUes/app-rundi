import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, InteractionManager } from 'react-native';
import { useTheme } from '../hooks/shared/theme/useTheme';
import fcmService from '../services/notification/fcmService';
import { initializeNotificationSetup } from '../services/notification/notificationSetup';
import { syncVoipToken, listenVoipToken, clearVoipToken } from '../native/voip';
import { useAuth } from '../hooks/shared/auth/useAuth';
import proximityService from '../services/ride/proximityService';

interface FCMContextType {
  isConfigured: boolean;
  hasPermission: boolean;
  isFCMAvailable: boolean;
  configureFCM: () => Promise<void>;
  sendTestNotification: () => Promise<void>;
}

const FCMContext = createContext<FCMContextType | undefined>(undefined);

export const useFCM = () => {
  const context = useContext(FCMContext);
  if (context === undefined) {
    throw new Error('useFCM must be used within an FCMProvider');
  }
  return context;
};

interface FCMProviderProps {
  children: React.ReactNode;
}

export const FCMProvider: React.FC<FCMProviderProps> = ({ children }) => {
  const [isConfigured, setIsConfigured] = useState(false);
  const [hasPermission, setHasPermission] = useState(false);
  const [isFCMAvailable, setIsFCMAvailable] = useState(false);
  const listenersConfigured = useRef(false);
  const lastUidRef = useRef<string | null>(null);
  const { user, loading } = useAuth();

  useEffect(() => {
    // Diferir tras el primer render/interacciones: permisos + callable de
    // registro de token no deben competir con la pintura inicial.
    const start = () => {
      initializeNotificationSetup().then(async (granted) => {
        setHasPermission(granted);
        await initializeFCM();
      });
    };
    const ric = (globalThis as any).requestIdleCallback as ((cb: () => void) => number) | undefined;
    if (typeof ric === 'function') {
      const handle = ric(start);
      return () => (globalThis as any).cancelIdleCallback?.(handle);
    }
    const task = InteractionManager.runAfterInteractions(start);
    return () => task.cancel();
  }, []);

  const initializeFCM = async () => {
    try {
      // Verificar si FCM está disponible
      const fcmSupported = fcmService.isFCMSupported();
      setIsFCMAvailable(fcmSupported);

      if (!fcmSupported) {
        console.log('⚠️ FCM no disponible - usando Expo Notifications como fallback');
        console.log('💡 Para FCM completo, usa: npx expo run:android o npx expo run:ios');
        // En Expo Go, no hay permisos ni configuración de FCM
        setIsConfigured(false);
        setHasPermission(false);
        return;
      }

      // Verificar permisos existentes
      const permissionGranted = await fcmService.checkPermissionStatus();
      setHasPermission(permissionGranted);

      if (!permissionGranted) {
        console.log('⚠️ FCM no configurado - permisos de notificación pendientes');
        setIsConfigured(false);
        return;
      }

      if (!listenersConfigured.current) {
        fcmService.setupNotificationListeners();
        listenersConfigured.current = true;
      }
      let tokenRegistered = false;
      if (user?.id) {
        tokenRegistered = await fcmService.registerToken();
        void syncVoipToken(user.id);
      } else {
        console.log('ℹ️ [FCM] Sesión de usuario aún no lista; se difiere registro de token.');
      }
      setIsConfigured(tokenRegistered);
      if (tokenRegistered) {
        console.log('✅ FCM configurado correctamente');
      }
    } catch (error) {
      console.error('❌ Error inicializando FCM:', error);
    }
  };

  const configureFCM = async () => {
    try {
      if (!isFCMAvailable) {
        console.log('⚠️ FCM no disponible, no se puede configurar');
        return;
      }

      const permissionGranted = await fcmService.requestPermission();
      setHasPermission(permissionGranted);

      if (!permissionGranted) {
        console.log('⚠️ Permisos de notificación rechazados por el usuario');
        return;
      }

      if (!listenersConfigured.current) {
        fcmService.setupNotificationListeners();
        listenersConfigured.current = true;
      }
      let tokenRegistered = false;
      if (user?.id) {
        tokenRegistered = await fcmService.registerToken();
        void syncVoipToken(user.id);
      } else {
        console.log('ℹ️ [FCM] Sesión de usuario aún no lista; se difiere registro de token.');
      }
      setIsConfigured(tokenRegistered);
      if (tokenRegistered) {
        console.log('✅ FCM configurado exitosamente');
      }
    } catch (error) {
      console.error('❌ Error configurando FCM:', error);
    }
  };

  useEffect(() => {
    const syncTokenForUser = async () => {
      if (!user || !isFCMAvailable) {
        return;
      }

      try {
        const permissionGranted = await fcmService.checkPermissionStatus();
        setHasPermission(permissionGranted);

        if (!permissionGranted) {
          setIsConfigured(false);
          return;
        }

        if (!listenersConfigured.current) {
          fcmService.setupNotificationListeners();
          listenersConfigured.current = true;
        }

        const tokenRegistered = await fcmService.registerToken();
        void syncVoipToken(user.id);
        setIsConfigured(tokenRegistered);
      } catch (error) {
        console.error('❌ Error sincronizando token FCM:', error);
      }
    };

    lastUidRef.current = user?.id ?? lastUidRef.current;
    const unlistenVoip = user?.id ? listenVoipToken(user.id) : undefined;
    syncTokenForUser();
    return () => unlistenVoip?.();
  }, [user?.id, isFCMAvailable]);

  useEffect(() => {
    if (loading || user) {
      return;
    }

    const clearTokenOnLogout = async () => {
      try {
        await fcmService.clearToken();
        await clearVoipToken(lastUidRef.current);
        await proximityService.hideOverlayBubble('signedOut');
      } catch (error) {
        console.error('❌ Error limpiando token FCM tras logout:', error);
      } finally {
        listenersConfigured.current = false;
        setIsConfigured(false);
        setHasPermission(false);
      }
    };

    clearTokenOnLogout();
  }, [loading, user]);

  const sendTestNotification = async () => {
    if (!isFCMAvailable) {
      console.log('⚠️ FCM no disponible, no se puede enviar notificación de prueba');
      return;
    }
    await fcmService.sendTestNotification();
  };

  const value = {
    isConfigured,
    hasPermission,
    isFCMAvailable,
    configureFCM,
    sendTestNotification,
  };

  return (
    <FCMContext.Provider value={value}>
      {children}
    </FCMContext.Provider>
  );
};

// Componente de configuración FCM para Settings
export const FCMConfigComponent: React.FC = () => {
  const { colors } = useTheme();
  const { isConfigured, hasPermission, isFCMAvailable, configureFCM, sendTestNotification } = useFCM();

  const styles = StyleSheet.create({
    section: {
      marginTop: 20,
      paddingVertical: 8,
    },
    sectionTitle: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      paddingHorizontal: 20,
      paddingVertical: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    container: {
      paddingHorizontal: 20,
      paddingVertical: 16,
      backgroundColor: colors.card,
      marginHorizontal: 20,
      marginBottom: 8,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 3,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statusContainer: {
      marginBottom: 16,
    },
    statusRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginVertical: 8,
      paddingVertical: 8,
      paddingHorizontal: 12,
      backgroundColor: colors.surface,
      borderRadius: 8,
      borderLeftWidth: 4,
    },
    statusRowActive: {
      borderLeftColor: '#4CAF50',
    },
    statusRowInactive: {
      borderLeftColor: '#FF9800',
    },
    statusRowDisabled: {
      borderLeftColor: '#999',
    },
    statusLabel: {
      flex: 1,
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    statusBadge: {
      paddingHorizontal: 12,
      paddingVertical: 4,
      borderRadius: 12,
      backgroundColor: '#4CAF50',
    },
    statusBadgeInactive: {
      backgroundColor: '#FF9800',
    },
    statusBadgeDisabled: {
      backgroundColor: '#999',
    },
    statusBadgeText: {
      color: '#fff',
      fontSize: 12,
      fontWeight: '600',
    },
    warningBox: {
      backgroundColor: '#FFF3CD',
      borderLeftWidth: 4,
      borderLeftColor: '#FF9800',
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    warningTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#856404',
      marginBottom: 4,
    },
    warningText: {
      fontSize: 12,
      color: '#856404',
      lineHeight: 18,
    },
    successBox: {
      backgroundColor: '#D4EDDA',
      borderLeftWidth: 4,
      borderLeftColor: '#4CAF50',
      padding: 12,
      borderRadius: 8,
      marginBottom: 16,
    },
    successTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: '#155724',
      marginBottom: 4,
    },
    successText: {
      fontSize: 12,
      color: '#155724',
      lineHeight: 18,
    },
    button: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginVertical: 6,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    testButton: {
      backgroundColor: '#4CAF50',
    },
    disabledButton: {
      backgroundColor: '#CCC',
    },
  });

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>Notificaciones</Text>
      
      <View style={styles.container}>
        {/* Estado General */}
        <View style={styles.statusContainer}>
          {/* FCM Disponible */}
          <View style={[
            styles.statusRow,
            isFCMAvailable ? styles.statusRowActive : styles.statusRowDisabled
          ]}>
            <Text style={styles.statusLabel}>
              {isFCMAvailable ? '📱 Dispositivo Real' : '🖥️ Emulador/Simulador'}
            </Text>
            <View style={[
              styles.statusBadge,
              !isFCMAvailable && styles.statusBadgeDisabled
            ]}>
              <Text style={styles.statusBadgeText}>
                {isFCMAvailable ? 'Activo' : 'Desabilitado'}
              </Text>
            </View>
          </View>

          {/* Permisos */}
          <View style={[
            styles.statusRow,
            hasPermission ? styles.statusRowActive : styles.statusRowInactive
          ]}>
            <Text style={styles.statusLabel}>Permisos</Text>
            <View style={[
              styles.statusBadge,
              !hasPermission && styles.statusBadgeInactive
            ]}>
              <Text style={styles.statusBadgeText}>
                {hasPermission ? 'Concedidos' : 'Requeridos'}
              </Text>
            </View>
          </View>

          {/* Configuración */}
          <View style={[
            styles.statusRow,
            isConfigured ? styles.statusRowActive : styles.statusRowInactive
          ]}>
            <Text style={styles.statusLabel}>Configuración</Text>
            <View style={[
              styles.statusBadge,
              !isConfigured && styles.statusBadgeInactive
            ]}>
              <Text style={styles.statusBadgeText}>
                {isConfigured ? 'Configurado' : 'Pendiente'}
              </Text>
            </View>
          </View>
        </View>

        {/* Mensajes informativos */}
        {!isFCMAvailable && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ Expo Go Detectado</Text>
            <Text style={styles.warningText}>
              FCM no está disponible en Expo Go. Para probar notificaciones push completas, compila un Development Build:{'\n\n'}
              <Text style={{ fontWeight: '600' }}>Android:</Text> npx expo run:android{'\n'}
              <Text style={{ fontWeight: '600' }}>iOS:</Text> npx expo run:ios
            </Text>
          </View>
        )}

        {isFCMAvailable && isConfigured && (
          <View style={styles.successBox}>
            <Text style={styles.successTitle}>✅ Notificaciones Activas</Text>
            <Text style={styles.successText}>
              Recibirás notificaciones cuando se encuentre un conductor, acepte tu viaje, inicie el viaje, envíe mensajes o complete el viaje.
            </Text>
          </View>
        )}

        {isFCMAvailable && !isConfigured && (
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ Configuración Requerida</Text>
            <Text style={styles.warningText}>
              Debes conceder permisos para recibir notificaciones push. Toca el botón de abajo para configurar.
            </Text>
          </View>
        )}

        {/* Botones de acción */}
        {isFCMAvailable && !hasPermission && (
          <TouchableOpacity style={styles.button} onPress={configureFCM}>
            <Text style={styles.buttonText}>🔧 Configurar Notificaciones</Text>
          </TouchableOpacity>
        )}

        {isConfigured && (
          <TouchableOpacity
            style={[styles.button, styles.testButton]}
            onPress={sendTestNotification}
          >
            <Text style={styles.buttonText}>🧪 Probar Notificación</Text>
          </TouchableOpacity>
        )}

        {!isFCMAvailable && (
          <TouchableOpacity style={[styles.button, styles.disabledButton]} disabled>
            <Text style={styles.buttonText}>📱 Disponible en Dispositivo Real</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
};
