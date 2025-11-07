import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Modal, StyleSheet, Linking, Alert, ActivityIndicator, Image } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useLocation } from '../hooks/useLocation';
import { getFirebaseFunctions } from '../config/firebase';
import { httpsCallable } from 'firebase/functions';
import { useAuth } from '../context/AuthContext';

interface EmergencyButtonProps {
  rideId?: string;
  style?: any;
}
export default function EmergencyButton({ rideId, style }: EmergencyButtonProps) {
  const { coords } = useLocation();
  const { colors } = useTheme();
  const { user } = useAuth();
  const [modalVisible, setModalVisible] = useState(false);
  const [calling, setCalling] = useState(false);

  const handleEmergencyPress = () => {
    setModalVisible(true);
  };

  const callEmergency = async (type: 'police' | 'ambulance') => {
    const number = type === 'police' ? '118' : '102';
    const name = type === 'police' ? 'Policía' : 'Ambulancia';

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
          '🚨 Emergencia',
          `Llamando a ${name} (${number})\n\nLa llamada ha sido registrada.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert('Error', 'No se puede realizar la llamada');
      }
    } catch (error) {
      console.error('Error al llamar:', error);
      Alert.alert('Error', 'No se pudo realizar la llamada de emergencia');
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
          <ActivityIndicator color={colors.primary} />
        ) : (
          <Image
            source={require('../assets/icons/emergency/red-call-icon.png')}
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
            <Text style={styles.modalTitle}>🚨 Emergencia</Text>
            <Text style={styles.modalSubtitle}>
              Selecciona el servicio de emergencia
            </Text>

            <TouchableOpacity
              style={styles.emergencyOption}
              onPress={() => callEmergency('police')}
            >
              <Text style={styles.emergencyOptionTitle}>👮 Policía</Text>
              <Text style={styles.emergencyOptionNumber}>118</Text>
              <Text style={styles.emergencyOptionDescription}>
                Emergencias policiales, robos, accidentes
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.emergencyOption}
              onPress={() => callEmergency('ambulance')}
            >
              <Text style={styles.emergencyOptionTitle}>🚑 Ambulancia</Text>
              <Text style={styles.emergencyOptionNumber}>102</Text>
              <Text style={styles.emergencyOptionDescription}>
                Emergencias médicas, accidentes, lesiones
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => setModalVisible(false)}
            >
              <Text style={styles.cancelButtonText}>Cancelar</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </>
  );
}
