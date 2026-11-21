import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Modal,
  StyleSheet,
  Linking,
  Alert,
  Pressable,
  Animated,
  Easing,
  PanResponder,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import * as Haptics from 'expo-haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LoadingIcon } from '../ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useLocation } from '../../hooks/shared/location/useLocation';
import { createEmergencyCall } from '../../api/emergency';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTranslation } from 'react-i18next';

interface EmergencyButtonProps {
  rideId?: string;
  style?: any;
  onOpen?: () => void;
  onClose?: () => void;
  onReady?: (openHandler: (() => void) | null) => void;
  hideTrigger?: boolean;
}

const SHEET_TRAVEL = 420;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 0.6;

export default function EmergencyButton({ rideId, style, onOpen, onClose, onReady, hideTrigger = false }: EmergencyButtonProps) {
  const { coords } = useLocation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [modalVisible, setModalVisible] = useState(false);
  const [calling, setCalling] = useState(false);

  const sheetY = useRef(new Animated.Value(SHEET_TRAVEL)).current;
  const closingRef = useRef(false);

  const handleEmergencyPress = useCallback(() => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
    onOpen?.();
    closingRef.current = false;
    sheetY.setValue(SHEET_TRAVEL);
    setModalVisible(true);
  }, [onOpen, sheetY]);

  useEffect(() => {
    if (onReady) {
      onReady(handleEmergencyPress);
      return () => {
        onReady(null);
      };
    }
  }, [handleEmergencyPress, onReady]);

  useEffect(() => {
    if (!modalVisible) return;
    Animated.spring(sheetY, {
      toValue: 0,
      damping: 26,
      stiffness: 300,
      mass: 1,
      useNativeDriver: true,
    }).start();
  }, [modalVisible, sheetY]);

  const closeSheet = useCallback(
    (flingVelocity = 0) => {
      if (closingRef.current) return;
      closingRef.current = true;
      const finish = () => {
        setModalVisible(false);
        closingRef.current = false;
        onClose?.();
      };
      if (flingVelocity > DISMISS_VELOCITY) {
        Animated.spring(sheetY, {
          toValue: SHEET_TRAVEL,
          velocity: flingVelocity,
          damping: 30,
          stiffness: 240,
          mass: 0.9,
          useNativeDriver: true,
        }).start(finish);
        return;
      }
      Animated.timing(sheetY, {
        toValue: SHEET_TRAVEL,
        duration: 230,
        easing: Easing.in(Easing.cubic),
        useNativeDriver: true,
      }).start(finish);
    },
    [sheetY, onClose],
  );

  const closeSheetRef = useRef(closeSheet);
  closeSheetRef.current = closeSheet;

  const dismissPanResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_event, gesture) =>
        gesture.dy > 6 && Math.abs(gesture.dy) > Math.abs(gesture.dx),
      onPanResponderMove: (_event, gesture) => {
        sheetY.setValue(Math.max(0, gesture.dy));
      },
      onPanResponderRelease: (_event, gesture) => {
        if (gesture.dy > DISMISS_DISTANCE || gesture.vy > DISMISS_VELOCITY) {
          closeSheetRef.current(gesture.vy);
          return;
        }
        Animated.spring(sheetY, {
          toValue: 0,
          damping: 24,
          stiffness: 320,
          mass: 0.9,
          velocity: gesture.vy,
          useNativeDriver: true,
        }).start();
      },
      onPanResponderTerminate: () => {
        Animated.spring(sheetY, {
          toValue: 0,
          damping: 24,
          stiffness: 320,
          mass: 0.9,
          useNativeDriver: true,
        }).start();
      },
    }),
  ).current;

  const backdropOpacity = sheetY.interpolate({
    inputRange: [0, SHEET_TRAVEL],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const getEmergencyDetails = (type: 'police' | 'ambulance') => ({
    title: t(`common.components.emergencyButton.options.${type}.title`),
    description: t(`common.components.emergencyButton.options.${type}.description`),
    number: t(`common.components.emergencyButton.options.${type}.number`),
  });

  const callEmergency = async (type: 'police' | 'ambulance') => {
    const { title, number } = getEmergencyDetails(type);

    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
    setCalling(true);
    closeSheet();

    try {
      console.log('🚨 Registrando llamada de emergencia...');

      await createEmergencyCall({
        emergencyType: type,
        emergencyNumber: number,
        lat: coords?.latitude || undefined,
        lng: coords?.longitude || undefined,
        rideId: rideId || undefined,
        notes: `role:${user?.role || 'client'}`,
      });

      console.log('✅ Llamada de emergencia registrada');

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
      justifyContent: 'flex-end',
    },
    backdrop: {
      position: 'absolute' as const,
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
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
    sheetHandleZone: {
      alignItems: 'center',
      paddingTop: 4,
      paddingBottom: 12,
    },
    sheetHandle: {
      width: 36,
      height: 4,
      borderRadius: 2,
      backgroundColor: colors.border,
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
      borderWidth: 0.1,
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
      backgroundColor: colors.surface2,
      paddingVertical: 15,
      borderRadius: 16,
      alignItems: 'center',
      marginTop: 6,
      borderWidth: 0.1,
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
      {!hideTrigger && <TouchableOpacity
        style={styles.button}
        onPress={handleEmergencyPress}
        disabled={calling}
        accessibilityRole="button"
        accessibilityLabel={t('common.components.emergencyButton.modalTitle')}
      >
        {calling ? (
          <LoadingIcon size={24} color={colors.primary} />
        ) : (
          <View style={styles.iconDisc}>
            <MaterialIcons name="phone-in-talk" size={18} color="#FFFFFF" />
          </View>
        )}
      </TouchableOpacity>}

      <Modal
        visible={modalVisible}
        transparent
        animationType="none"
        statusBarTranslucent
        onRequestClose={() => closeSheet()}
      >
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.backdrop, { opacity: backdropOpacity }]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => closeSheet()} />
          </Animated.View>
          <Animated.View style={[styles.sheet, { transform: [{ translateY: sheetY }] }]}>
            <View style={styles.sheetHandleZone} {...dismissPanResponder.panHandlers}>
              <View style={styles.sheetHandle} />
            </View>

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
              onPress={() => closeSheet()}
              activeOpacity={0.8}
            >
              <Text style={styles.cancelButtonText}>
                {t('common.components.emergencyButton.cancelLabel')}
              </Text>
            </TouchableOpacity>
          </Animated.View>
        </View>
      </Modal>
    </>
  );
}
