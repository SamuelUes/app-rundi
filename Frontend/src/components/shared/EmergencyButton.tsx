import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Linking,
  Alert,
  Pressable,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
  const insets = useSafeAreaInsets();
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
    iconDisc: {
      width: 38,
      height: 38,
      borderRadius: 19,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.error,
    },
    buttonText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      marginTop: 4,
    },
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'flex-end',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingHorizontal: 20,
      paddingTop: 10,
      paddingBottom: insets.bottom + 14,
      borderTopWidth: 1,
      borderLeftWidth: 1,
      borderRightWidth: 1,
      borderColor: colors.border,
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
      marginBottom: 14,
    },
    sheetHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginBottom: 16,
    },
    sheetIconDisc: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.error + '1F',
    },
    sheetHeaderText: {
      flex: 1,
      gap: 1,
    },
    modalTitle: {
      fontSize: 18,
      fontWeight: '800',
      color: colors.text,
      letterSpacing: -0.3,
    },
    modalSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      lineHeight: 18,
    },
    emergencyOption: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      backgroundColor: colors.surface,
      padding: 14,
      borderRadius: 16,
      marginBottom: 10,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 64,
    },
    optionIconDiscPolice: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.primaryDark + '1F',
    },
    optionIconDiscAmbulence: {
      width: 40,
      height: 40,
      borderRadius: 12,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.error + '1F',
    },
    emergencyOptionTextCol: {
      flex: 1,
      gap: 2,
    },
    emergencyOptionTitle: {
      fontSize: 15,
      fontWeight: '700',
      color: colors.text,
    },
    emergencyOptionDescription: {
      fontSize: 12,
      color: colors.textSecondary,
      lineHeight: 16,
    },
    emergencyOptionNumber: {
      fontSize: 20,
      fontWeight: '800',
      color: colors.error,
      fontVariant: ['tabular-nums'],
    },
    cancelButton: {
      backgroundColor: colors.surface,
      paddingVertical: 15,
      borderRadius: 16,
      alignItems: 'center',
      marginTop: 6,
      borderWidth: 1,
      borderColor: colors.border,
      minHeight: 52,
      justifyContent: 'center',
    },
    cancelButtonText: {
      fontSize: 15,
      fontWeight: '700',
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
          <View style={styles.iconDisc}>
            <MaterialIcons name="phone-in-talk" size={18} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setModalVisible(false)} />
          <View style={styles.sheet}>
            <View style={styles.sheetHandle} />

            <View style={styles.sheetHeader}>
              <View style={styles.sheetIconDisc}>
                <MaterialIcons name="emergency" size={22} color={colors.error} />
              </View>
              <View style={styles.sheetHeaderText}>
                <Text style={styles.modalTitle}>
                  {t('common.components.emergencyButton.modalTitle')}
                </Text>
                <Text style={styles.modalSubtitle}>
                  {t('common.components.emergencyButton.modalSubtitle')}
                </Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.emergencyOption}
              onPress={() => callEmergency('police')}
              activeOpacity={0.75}
            >
              <View style={styles.optionIconDiscPolice}>
                <MaterialIcons name="local-police" size={20} color={colors.primaryDark} />
              </View>
              <View style={styles.emergencyOptionTextCol}>
                <Text style={styles.emergencyOptionTitle}>
                  {t('common.components.emergencyButton.options.police.title')}
                </Text>
                <Text style={styles.emergencyOptionDescription} numberOfLines={2}>
                  {t('common.components.emergencyButton.options.police.description')}
                </Text>
              </View>
              <Text style={styles.emergencyOptionNumber}>
                {t('common.components.emergencyButton.options.police.number')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyOption}
              onPress={() => callEmergency('ambulance')}
              activeOpacity={0.75}
            >
              <View style={styles.optionIconDiscAmbulence}>
                <MaterialIcons name="medical-services" size={20} color={colors.error} />
              </View>
              <View style={styles.emergencyOptionTextCol}>
                <Text style={styles.emergencyOptionTitle}>
                  {t('common.components.emergencyButton.options.ambulance.title')}
                </Text>
                <Text style={styles.emergencyOptionDescription} numberOfLines={2}>
                  {t('common.components.emergencyButton.options.ambulance.description')}
                </Text>
              </View>
              <Text style={styles.emergencyOptionNumber}>
                {t('common.components.emergencyButton.options.ambulance.number')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
              activeOpacity={0.8}
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
