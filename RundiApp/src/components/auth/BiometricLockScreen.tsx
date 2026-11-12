import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { SymbolView } from 'expo-symbols';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useAuthStore } from '../../stores/authStore';
import BiometricService from '../../services/user/biometricService';
import { markBiometricUnlocked } from '../../hooks/shared/auth/useAuthInit';

export default function BiometricLockScreen() {
  const { colors } = useTheme();
  const { t } = useTranslation();
  const { logout, user } = useAuth();
  const insets = useSafeAreaInsets();
  const setBiometricLocked = useAuthStore((s) => s.setBiometricLocked);

  const [biometricUnavailable, setBiometricUnavailable] = useState(false);
  const [hasDeviceCredential, setHasDeviceCredential] = useState(true);

  const unlock = useCallback(() => {
    markBiometricUnlocked();
    setBiometricLocked(false);
  }, [setBiometricLocked]);

  const logAttempt = useCallback((result: { success: boolean; biometryType?: string; error?: string }) => {
    if (!user?.id) return;
    const userType = user.role === 'driver' || user.role === 'designated_driver' ? user.role : 'client';
    void BiometricService.logAuthenticationAttempt({
      biometricType: result.biometryType || 'biometric',
      context: 'app_lock',
      userType,
      success: result.success,
      attemptNumber: 1,
      errorMessage: result.success ? undefined : result.error,
    });
  }, [user?.id, user?.role]);

  const attemptUnlock = useCallback(async () => {
    const result = await BiometricService.authenticate(
      t('shared.biometricLock.promptReason'),
    );
    logAttempt(result);
    if (result.success) {
      unlock();
      return;
    }
    // Biometría inutilizable: NO desbloquear ni apagar la preferencia en
    // silencio — el usuario entra con el método de seguridad del dispositivo.
    if (result.errorCode === 'NOT_SUPPORTED' || result.errorCode === 'NOT_ENROLLED') {
      setBiometricUnavailable(true);
    }
  }, [t, unlock, logAttempt]);

  const attemptDeviceUnlock = useCallback(async () => {
    const result = await BiometricService.authenticateWithDeviceCredential(
      t('shared.biometricLock.deviceCredentialReason'),
    );
    logAttempt(result);
    if (result.success) unlock();
  }, [t, unlock, logAttempt]);

  // Desactivar el candado exige la misma verificación que entrar: si el
  // dispositivo no puede comprobar identidad, la preferencia se queda puesta.
  const disableLock = useCallback(async () => {
    const result = await BiometricService.authenticateWithDeviceCredential(
      t('shared.biometricLock.disableReason'),
    );
    logAttempt(result);
    if (!result.success) return;
    await BiometricService.setBiometricUnlockEnabled(false);
    unlock();
  }, [t, unlock, logAttempt]);

  useEffect(() => {
    void BiometricService.hasDeviceCredential().then(setHasDeviceCredential);
    void attemptUnlock();
  }, [attemptUnlock]);

  const styles = useMemo(
    () =>
      StyleSheet.create({
        container: {
          flex: 1,
          backgroundColor: colors.background,
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 32,
        },
        iconWrap: {
          width: 96,
          height: 96,
          borderRadius: 48,
          backgroundColor: colors.primary + '1A',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: 24,
        },
        title: {
          fontSize: 22,
          fontWeight: '700',
          color: colors.text,
          textAlign: 'center',
          marginBottom: 8,
        },
        subtitle: {
          fontSize: 15,
          color: colors.textSecondary,
          textAlign: 'center',
          lineHeight: 21,
          marginBottom: 32,
        },
        unlockButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: colors.primary,
          paddingVertical: 15,
          paddingHorizontal: 32,
          borderRadius: 16,
          alignSelf: 'stretch',
        },
        unlockButtonText: {
          fontSize: 16,
          fontWeight: '700',
          color: '#FFFFFF',
        },
        deviceButton: {
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 10,
          backgroundColor: 'transparent',
          borderWidth: 1,
          borderColor: colors.border,
          paddingVertical: 14,
          paddingHorizontal: 32,
          borderRadius: 16,
          alignSelf: 'stretch',
          marginTop: 12,
        },
        deviceButtonText: {
          fontSize: 15,
          fontWeight: '600',
          color: colors.text,
        },
        disableButton: {
          marginTop: 18,
          paddingVertical: 10,
        },
        disableButtonText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.textSecondary,
        },
        logoutButton: {
          marginTop: 8,
          paddingVertical: 10,
        },
        logoutButtonText: {
          fontSize: 14,
          fontWeight: '600',
          color: colors.error,
        },
      }),
    [colors],
  );

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom + 24 }]}>
      <View style={styles.iconWrap}>
        {Platform.OS === 'ios' ? (
          <SymbolView
            name="lock.fill"
            size={42}
            tintColor={colors.primary}
            resizeMode="scaleAspectFit"
          />
        ) : (
          <Ionicons name="lock-closed" size={42} color={colors.primary} />
        )}
      </View>
      <Text style={styles.title}>{t('shared.biometricLock.title')}</Text>
      <Text style={styles.subtitle}>
        {t(
          !hasDeviceCredential
            ? 'shared.biometricLock.noSecurityMethod'
            : biometricUnavailable
              ? 'shared.biometricLock.biometricUnavailable'
              : 'shared.biometricLock.subtitle',
        )}
      </Text>

      {!biometricUnavailable && (
        <TouchableOpacity
          style={styles.unlockButton}
          onPress={() => void attemptUnlock()}
          activeOpacity={0.85}
        >
          {Platform.OS === 'ios' ? (
            <SymbolView
              name="faceid"
              size={20}
              tintColor="#FFFFFF"
              resizeMode="scaleAspectFit"
            />
          ) : (
            <Ionicons name="finger-print" size={20} color="#FFFFFF" />
          )}
          <Text style={styles.unlockButtonText}>
            {t('shared.biometricLock.unlock')}
          </Text>
        </TouchableOpacity>
      )}

      {hasDeviceCredential && (
        <TouchableOpacity
          style={[
            styles.deviceButton,
            biometricUnavailable && {
              backgroundColor: colors.primary,
              borderColor: 'transparent',
            },
          ]}
          onPress={() => void attemptDeviceUnlock()}
          activeOpacity={0.85}
        >
          <Ionicons
            name="keypad-outline"
            size={20}
            color={biometricUnavailable ? '#FFFFFF' : colors.text}
          />
          <Text
            style={[
              styles.deviceButtonText,
              biometricUnavailable && styles.unlockButtonText,
            ]}
          >
            {t('shared.biometricLock.useDeviceCredential')}
          </Text>
        </TouchableOpacity>
      )}

      {hasDeviceCredential && (
        <TouchableOpacity
          style={styles.disableButton}
          onPress={() => void disableLock()}
          activeOpacity={0.7}
        >
          <Text style={styles.disableButtonText}>
            {t('shared.biometricLock.disable')}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={() => void logout()}
        activeOpacity={0.7}
      >
        <Text style={styles.logoutButtonText}>
          {t('shared.biometricLock.logout')}
        </Text>
      </TouchableOpacity>
    </View>
  );
}
