import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Linking,
  Alert,
  Image,
} from 'react-native';
import { LoadingIcon } from '../ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { getFirebaseFunctions } from '../../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTranslation } from 'react-i18next';

interface EmergencyButtonProps {
  rideId?: string;
  style?: any;
  onOpen?: () => void;
  onReady?: (openHandler: (() => void) | null) => void;
}
export default function EmergencyButton({ rideId, style, onOpen, onReady }: EmergencyButtonProps) {
  const { coords } = useLocation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const [modalVisible, setModalVisible] = useState(false);
  const [calling, setCalling] = useState(false);

  const handleEmergencyPress = useCallback(() => {
    onOpen?.();
    setModalVisible(true);
  }, [onOpen]);

  useEffect(() => {
    if (onReady) {
      onReady(handleEmergencyPress);
      return () => {
        onReady(null);
      };
    }
  }, [handleEmergencyPress, onReady]);

  const getEmergencyDetails = (type: 'police' | 'ambulance') => ({
    title: t(`common.components.emergencyButton.options.${type}.title`),
    description: t(`common.components.emergencyButton.options.${type}.description`),
    number: t(`common.components.emergencyButton.options.${type}.number`),
  });

  const callEmergency = async (type: 'police' | 'ambulance') => {
    const { title, number } = getEmergencyDetails(type);

    setCalling(true);
    setModalVisible(false);

    try {
      // Guardar en Supabase vía Firebase Function
      console.log('🚨 Registrando llamada de emergencia...');
      
      const functions = await getFirebaseFunctions();
      const logEmergencyCallFn = httpsCallable(functions, 'logEmergencyCall');
      
      await logEmergencyCallFn({
        emergencyType: type,
        emergencyNumber: number,
        latitude: coords?.latitude || null,
        longitude: coords?.longitude || null,
        address: null, // Podríamos hacer reverse geocoding aquí
        rideId: rideId || null,
        notes: null,
        userRole: user?.role || 'client',
      });

      console.log('✅ Llamada de emergencia registrada en Supabase');

      // Abrir dialer
      const phoneUrl = `tel:${number}`;
      const canOpen = await Linking.canOpenURL(phoneUrl);
      
      if (canOpen) {
        await Linking.openURL(phoneUrl);
        Alert.alert(
          t('common.components.emergencyButton.alerts.callingTitle'),
          t('common.components.emergencyButton.alerts.callingMessage', {
            name: title,
            number,
          }),
          [{ text: 'OK' }],
        );
      } else {
        Alert.alert(
          t('common.components.emergencyButton.alerts.errorTitle'),
          t('common.components.emergencyButton.alerts.cannotCall'),
        );
      }
    } catch (error) {
      console.error('Error al llamar:', error);
      Alert.alert(
        t('common.components.emergencyButton.alerts.errorTitle'),
        t('common.components.emergencyButton.alerts.errorMessage'),
      );
    } finally {
      setCalling(false);
    }
  };

  const styles = StyleSheet.create({
    button: {
      backgroundColor: 'transparent',
      padding: 0,
      borderRadius: 0,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    },
    icon: {
      width: 40,
      height: 40,
      resizeMode: 'contain',
    },
    buttonText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.7)',
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    modalContent: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 24,
      width: '100%',
      maxWidth: 400,
    },
    modalTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
      marginBottom: 8,
    },
    modalSubtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 24,
    },
    emergencyOption: {
      backgroundColor: colors.surface,
      padding: 20,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 2,
      borderColor: colors.border,
    },
    emergencyOptionTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    emergencyOptionNumber: {
      fontSize: 24,
      fontWeight: '700',
      color: '#FF3B30',
      marginBottom: 8,
    },
    emergencyOptionDescription: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    cancelButton: {
      backgroundColor: colors.surface,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
      marginTop: 8,
    },
    cancelButtonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
  });

  return (
    <>
      <TouchableOpacity
        style={styles.button}
        onPress={handleEmergencyPress}
        disabled={calling}
      >
        {calling ? (
          <LoadingIcon size={24} color={colors.primary} />
        ) : (
          <Image
            source={require('../../assets/icons/emergency/red-call-icon.png')}
            style={styles.icon}
          />
        )}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <Text style={styles.modalTitle}>
              {t('common.components.emergencyButton.modalTitle')}
            </Text>
            <Text style={styles.modalSubtitle}>
              {t('common.components.emergencyButton.modalSubtitle')}
            </Text>

            <TouchableOpacity
              style={styles.emergencyOption}
              onPress={() => callEmergency('police')}
            >
              <Text style={styles.emergencyOptionTitle}>
                {t('common.components.emergencyButton.options.police.title')}
              </Text>
              <Text style={styles.emergencyOptionNumber}>
                {t('common.components.emergencyButton.options.police.number')}
              </Text>
              <Text style={styles.emergencyOptionDescription}>
                {t('common.components.emergencyButton.options.police.description')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyOption}
              onPress={() => callEmergency('ambulance')}
            >
              <Text style={styles.emergencyOptionTitle}>
                {t('common.components.emergencyButton.options.ambulance.title')}
              </Text>
              <Text style={styles.emergencyOptionNumber}>
                {t('common.components.emergencyButton.options.ambulance.number')}
              </Text>
              <Text style={styles.emergencyOptionDescription}>
                {t('common.components.emergencyButton.options.ambulance.description')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.components.emergencyButton.cancelLabel')}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
