import React, { createContext, useContext, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import fcmService from '../services/fcmService';

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

  useEffect(() => {
    initializeFCM();
  }, []);

  const initializeFCM = async () => {
    try {
      // Verificar si FCM está disponible
      const fcmSupported = fcmService.isFCMSupported();
      setIsFCMAvailable(fcmSupported);

      if (!fcmSupported) {
        console.log('⚠️ FCM no disponible - usando Expo Notifications como fallback');
        setIsConfigured(false);
        setHasPermission(false);
        return;
      }

      // Verificar permisos existentes
      const permissionGranted = await fcmService.checkPermissionStatus();
      setHasPermission(permissionGranted);

      if (permissionGranted) {
        // Configurar listeners y registrar token
        fcmService.setupNotificationListeners();
        await fcmService.registerToken();
        setIsConfigured(true);
        console.log('✅ FCM configurado correctamente');
      } else {
        console.log('⚠️ FCM no configurado - permisos requeridos');
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

      if (permissionGranted) {
        fcmService.setupNotificationListeners();
        await fcmService.registerToken();
        setIsConfigured(true);
        console.log('✅ FCM configurado exitosamente');
      }
    } catch (error) {
      console.error('❌ Error configurando FCM:', error);
    }
  };

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
    container: {
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      marginVertical: 8,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    status: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    button: {
      backgroundColor: colors.primary,
      padding: 12,
      borderRadius: 8,
      alignItems: 'center',
      marginVertical: 4,
    },
    buttonText: {
      color: '#fff',
      fontSize: 16,
      fontWeight: '600',
    },
    testButton: {
      backgroundColor: '#4CAF50',
    },
    unavailableText: {
      fontSize: 12,
      color: '#FF9800',
      fontStyle: 'italic',
      textAlign: 'center',
      marginBottom: 12,
    },
  });

  return (
    <View style={styles.container}>
      <Text style={styles.title}>🔔 Notificaciones Push</Text>

      {!isFCMAvailable && (
        <Text style={styles.unavailableText}>
          FCM no disponible en Expo Go. Para notificaciones completas, usa un Development Build.
        </Text>
      )}

      <Text style={styles.status}>
        Estado: {isConfigured ? '✅ Configurado' : '⚠️ No configurado'}
        {'\n'}Permisos: {hasPermission ? '✅ Concedidos' : '❌ Requeridos'}
        {'\n'}FCM Disponible: {isFCMAvailable ? '✅ Sí' : '❌ No (Expo Go)'}
      </Text>

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
    </View>
  );
};
