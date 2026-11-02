/**
 * Google Auth Debug Component
 * Componente para verificar la configuración de Google OAuth en desarrollo
 */

import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import {
  validateGoogleAuthConfig,
  validateFirebaseInit,
  validateExpoAuthSession,
} from '../../utils/firebase/googleAuthValidator';

interface DebugInfo {
  googleClientId: string | undefined;
  firebaseApiKey: string | undefined;
  firebaseAuthDomain: string | undefined;
  firebaseProjectId: string | undefined;
  firebaseValid: boolean;
  expoValid: boolean;
  configValid: boolean;
}

export const GoogleAuthDebug: React.FC = () => {
  const { colors } = useTheme();
  const [debugInfo, setDebugInfo] = useState<DebugInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkConfig();
  }, []);

  const checkConfig = async () => {
    try {
      const configResult = validateGoogleAuthConfig();
      const firebaseValid = await validateFirebaseInit();
      const expoValid = validateExpoAuthSession();

      setDebugInfo({
        googleClientId: process.env.REACT_APP_GOOGLE_CLIENT_ID,
        firebaseApiKey: process.env.REACT_APP_FIREBASE_API_KEY,
        firebaseAuthDomain: process.env.REACT_APP_FIREBASE_AUTH_DOMAIN,
        firebaseProjectId: process.env.REACT_APP_FIREBASE_PROJECT_ID,
        firebaseValid,
        expoValid,
        configValid: configResult.isValid,
      });
    } catch (error) {
      console.error('Error checking config:', error);
    } finally {
      setLoading(false);
    }
  };

  const maskString = (str: string | undefined, showChars: number = 10): string => {
    if (!str) return 'No configurado';
    if (str.length <= showChars) return str;
    return str.substring(0, showChars) + '...' + str.substring(str.length - 5);
  };

  const styles = StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      marginVertical: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 12,
    },
    section: {
      marginBottom: 16,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
      marginBottom: 8,
    },
    item: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 8,
      paddingVertical: 6,
    },
    itemLabel: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text,
      flex: 1,
    },
    itemValue: {
      fontSize: 11,
      color: colors.textSecondary,
      fontFamily: 'monospace',
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      marginLeft: 8,
    },
    statusValid: {
      backgroundColor: '#10B981' + '30',
    },
    statusInvalid: {
      backgroundColor: '#EF4444' + '30',
    },
    statusText: {
      fontSize: 11,
      fontWeight: '600',
    },
    statusTextValid: {
      color: '#10B981',
    },
    statusTextInvalid: {
      color: '#EF4444',
    },
    button: {
      backgroundColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginTop: 12,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '600',
    },
    overallStatus: {
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderRadius: 8,
      alignItems: 'center',
      marginBottom: 12,
    },
    overallStatusValid: {
      backgroundColor: '#10B981' + '20',
    },
    overallStatusInvalid: {
      backgroundColor: '#EF4444' + '20',
    },
    overallStatusText: {
      fontSize: 14,
      fontWeight: '700',
    },
    overallStatusTextValid: {
      color: '#10B981',
    },
    overallStatusTextInvalid: {
      color: '#EF4444',
    },
  });

  if (loading) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>🔍 Verificando configuración...</Text>
      </View>
    );
  }

  if (!debugInfo) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>❌ Error al verificar configuración</Text>
      </View>
    );
  }

  const isAllValid = debugInfo.configValid && debugInfo.firebaseValid && debugInfo.expoValid;

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🔐 Google OAuth Debug Info</Text>

      {/* Overall Status */}
      <View
        style={[
          styles.overallStatus,
          isAllValid ? styles.overallStatusValid : styles.overallStatusInvalid,
        ]}
      >
        <Text
          style={[
            styles.overallStatusText,
            isAllValid
              ? styles.overallStatusTextValid
              : styles.overallStatusTextInvalid,
          ]}
        >
          {isAllValid ? '✅ Configuración válida' : '❌ Configuración inválida'}
        </Text>
      </View>

      {/* Google OAuth Config */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Google OAuth</Text>

        <View style={styles.item}>
          <Text style={styles.itemLabel}>Client ID:</Text>
          <Text style={styles.itemValue}>{maskString(debugInfo.googleClientId)}</Text>
          <View
            style={[
              styles.statusBadge,
              debugInfo.googleClientId
                ? styles.statusValid
                : styles.statusInvalid,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                debugInfo.googleClientId
                  ? styles.statusTextValid
                  : styles.statusTextInvalid,
              ]}
            >
              {debugInfo.googleClientId ? '✓' : '✗'}
            </Text>
          </View>
        </View>
      </View>

      {/* Firebase Config */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Firebase</Text>

        <View style={styles.item}>
          <Text style={styles.itemLabel}>API Key:</Text>
          <Text style={styles.itemValue}>{maskString(debugInfo.firebaseApiKey)}</Text>
          <View
            style={[
              styles.statusBadge,
              debugInfo.firebaseApiKey ? styles.statusValid : styles.statusInvalid,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                debugInfo.firebaseApiKey
                  ? styles.statusTextValid
                  : styles.statusTextInvalid,
              ]}
            >
              {debugInfo.firebaseApiKey ? '✓' : '✗'}
            </Text>
          </View>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemLabel}>Auth Domain:</Text>
          <Text style={styles.itemValue}>{maskString(debugInfo.firebaseAuthDomain)}</Text>
          <View
            style={[
              styles.statusBadge,
              debugInfo.firebaseAuthDomain
                ? styles.statusValid
                : styles.statusInvalid,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                debugInfo.firebaseAuthDomain
                  ? styles.statusTextValid
                  : styles.statusTextInvalid,
              ]}
            >
              {debugInfo.firebaseAuthDomain ? '✓' : '✗'}
            </Text>
          </View>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemLabel}>Project ID:</Text>
          <Text style={styles.itemValue}>{maskString(debugInfo.firebaseProjectId)}</Text>
          <View
            style={[
              styles.statusBadge,
              debugInfo.firebaseProjectId
                ? styles.statusValid
                : styles.statusInvalid,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                debugInfo.firebaseProjectId
                  ? styles.statusTextValid
                  : styles.statusTextInvalid,
              ]}
            >
              {debugInfo.firebaseProjectId ? '✓' : '✗'}
            </Text>
          </View>
        </View>

        <View style={styles.item}>
          <Text style={styles.itemLabel}>Firebase Init:</Text>
          <View
            style={[
              styles.statusBadge,
              debugInfo.firebaseValid ? styles.statusValid : styles.statusInvalid,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                debugInfo.firebaseValid
                  ? styles.statusTextValid
                  : styles.statusTextInvalid,
              ]}
            >
              {debugInfo.firebaseValid ? '✓' : '✗'}
            </Text>
          </View>
        </View>
      </View>

      {/* Dependencies */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Dependencias</Text>

        <View style={styles.item}>
          <Text style={styles.itemLabel}>expo-auth-session:</Text>
          <View
            style={[
              styles.statusBadge,
              debugInfo.expoValid ? styles.statusValid : styles.statusInvalid,
            ]}
          >
            <Text
              style={[
                styles.statusText,
                debugInfo.expoValid
                  ? styles.statusTextValid
                  : styles.statusTextInvalid,
              ]}
            >
              {debugInfo.expoValid ? '✓' : '✗'}
            </Text>
          </View>
        </View>
      </View>

      {/* Refresh Button */}
      <TouchableOpacity style={styles.button} onPress={checkConfig}>
        <Text style={styles.buttonText}>🔄 Actualizar</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

export default GoogleAuthDebug;
