import React, { useState } from 'react';
import {
  TouchableOpacity,
  Text,
  StyleSheet,
  Alert,
  Linking,
  Modal,
  View,
  ActivityIndicator,
} from 'react-native';
import { useLocation } from '../hooks/useLocation';
import { useTheme } from '../context/ThemeContext';

interface EmergencyButtonProps {
  rideId?: string;
  style?: any;
}

export default function EmergencyButton({ rideId, style }: EmergencyButtonProps) {
  const { coords } = useLocation();
  const { colors } = useTheme();
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
      // Aquí se guardaría en Supabase (por ahora solo llamamos)
      console.log('🚨 Llamada de emergencia:', {
        type,
        number,
        location: coords,
        rideId,
      });

      // Abrir dialer
      const phoneUrl = `tel:${number}`;
      const canOpen = await Linking.canOpenURL(phoneUrl);
      
      if (canOpen) {
        await Linking.openURL(phoneUrl);
        Alert.alert(
          '🚨 Emergencia',
          `Llamando a ${name} (${number})`,
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
      backgroundColor: '#FF3B30',
      padding: 12,
      borderRadius: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      ...style,
    },
    buttonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
      marginLeft: 8,
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
          <ActivityIndicator color="#FFFFFF" />
        ) : (
          <>
            <Text style={{ fontSize: 20 }}>🚨</Text>
            <Text style={styles.buttonText}>SOS</Text>
          </>
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
