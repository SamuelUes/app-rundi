import React, { useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Image, Modal, Alert } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import BiometricService from '../services/biometricService';
import { supabase } from '../config/supabase';
import { ref, update } from 'firebase/database';
import db from '../config/firebase';

interface DriverOffer {
  driver: {
    id: string;
    name: string;
    rating: number;
    phone: string;
    photoURL?: string;
    vehicle?: {
      make?: string;
      model?: string;
      color?: string;
      plate?: string;
      photos?: string[];
    } | null;
  };
  offeredPrice: number;
  acceptedClientPrice: boolean;
  status: 'pending' | 'accepted' | 'rejected';
  timestamp: number;
}

interface DriverOfferCardProps {
  offer: DriverOffer;
  estimatedPrice: number;
  clientSuggestedPrice?: number;
  onViewOffer: () => void;
  onAcceptOffer: () => void;
  hasPendingCounterOffer?: boolean;
  driverDistance?: number; // ✅ Distancia del conductor al punto de origen (en km)
}

export default function DriverOfferCard({
  offer,
  estimatedPrice,
  clientSuggestedPrice,
  onViewOffer,
  onAcceptOffer,
  hasPendingCounterOffer = false,
  driverDistance, // ✅ Distancia del conductor
}: DriverOfferCardProps) {
  const { colors } = useTheme();

  const { driver, offeredPrice, acceptedClientPrice } = offer;
  const vehicle = driver.vehicle;

  // Calcular ahorro/diferencia
  const difference = estimatedPrice - offeredPrice;
  const savingsText = difference > 0 
    ? `Ahorras C$${difference.toFixed(2)}` 
    : difference < 0 
    ? `C$${Math.abs(difference).toFixed(2)} más` 
    : 'Precio estimado';

  // Calcular límites de negociación dinámicos
  // Mínimo: 66.67% del precio estimado (con piso de 50 C$)
  // Máximo: 133.33% del precio estimado (con techo de 500 C$)
  const minNegotiationPrice = Math.max(50, Math.round(estimatedPrice * 0.6667 * 100) / 100);
  const maxNegotiationPrice = Math.min(500, Math.round(estimatedPrice * 1.3333 * 100) / 100);


  const [showBiometricModal, setShowBiometricModal] = useState(false);
  const [isAuthenticating, setIsAuthenticating] = useState(false);

  const handleAcceptDesignatedRide = async () => {
    // Por ahora, aceptar directamente
    onAcceptOffer();
  };

  const handleBiometricConfirmation = async (method: 'fingerprint' | 'face_id') => {
    try {
      setIsAuthenticating(true);

      const reason = method === 'fingerprint' 
        ? 'Confirma con tu huella para aceptar el viaje'
        : 'Confirma con tu rostro para aceptar el viaje';

      const result = await BiometricService.authenticate(reason);

      if (!result.success) {
        Alert.alert('Error', result.error || 'Autenticación fallida');
        return;
      }

      console.log('✅ Viaje designado aceptado con biometría:', method);
      setShowBiometricModal(false);
      onAcceptOffer();

    } catch (error) {
      console.error('❌ Error:', error);
      Alert.alert('Error', 'Error al procesar biometría');
    } finally {
      setIsAuthenticating(false);
    }
  };

  return (
    <View style={[styles.card, { backgroundColor: colors.surface, borderColor: colors.border }]}>
      {/* Header con foto, nombre y rating */}
      <View style={styles.header}>
        {/* Foto de perfil del conductor */}
        {driver.photoURL ? (
          <Image
            source={{ uri: driver.photoURL }}
            style={styles.driverAvatar}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.driverAvatar, { backgroundColor: colors.primary + '30' }]}>
            <Text style={[styles.driverAvatarText, { color: colors.primary }]}>
              {driver.name.charAt(0).toUpperCase()}
            </Text>
          </View>
        )}
        
        <View style={styles.driverInfo}>
          <Text style={[styles.driverName, { color: colors.text }]}>
            {driver.name}
          </Text>
          {driver.rating > 0 && (
            <Text style={[styles.rating, { color: colors.textSecondary }]}>
              ⭐ {driver.rating.toFixed(1)}
            </Text>
          )}
        </View>
      </View>

      {/* ✅ NUEVO: Distancia del conductor al punto de origen */}
      {driverDistance !== undefined && (
        <View style={[styles.distanceSection, { backgroundColor: colors.background }]}>
          <Text style={[styles.distanceLabel, { color: colors.textSecondary }]}>
            📍 Distancia al origen:
          </Text>
          <Text style={[styles.distanceValue, { color: colors.primary }]}>
            {driverDistance.toFixed(2)} km
          </Text>
        </View>
      )}

      {/* Info del vehículo */}
      {vehicle && (vehicle.make || vehicle.model) && (
        <View style={styles.vehicleSection}>
          {/* Foto del vehículo */}
          {vehicle.photos && vehicle.photos.length > 0 && (
            <Image
              source={{ uri: vehicle.photos[0] }}
              style={styles.vehicleImage}
              resizeMode="cover"
            />
          )}
          
          <View style={styles.vehicleInfo}>
            <Text style={[styles.vehicleText, { color: colors.textSecondary }]}>
              🚗 {vehicle.make || (vehicle as any).brand || 'N/A'} {vehicle.model || 'N/A'} • {vehicle.color || 'N/A'}
            </Text>
            {vehicle.plate && (
              <Text style={[styles.plateText, { color: colors.textSecondary }]}>
                📋 Placa: {vehicle.plate}
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Precio ofrecido */}
      <View style={styles.priceSection}>
        {acceptedClientPrice ? (
          <View style={styles.acceptedPriceContainer}>
            <Text style={[styles.acceptedLabel, { color: '#4CAF50' }]}>
              ✅ Aceptó tu precio
            </Text>
            <Text style={[styles.priceValue, { color: '#4CAF50' }]}>
              C${offeredPrice}
            </Text>
          </View>
        ) : (
          <View style={styles.offerPriceContainer}>
            <Text style={[styles.offerLabel, { color: colors.textSecondary }]}>
              💰 Ofrece:
            </Text>
            <Text style={[styles.priceValue, { color: '#FF9800' }]}>
              C${offeredPrice}
            </Text>
          </View>
        )}
        <Text style={[styles.savingsText, { color: difference > 0 ? '#4CAF50' : '#FF9800' }]}>
          {savingsText}
        </Text>
      </View>

      {/* Límites de Negociación */}
      <View style={[styles.negotiationLimitsSection, { backgroundColor: colors.background }]}>
        <Text style={[styles.negotiationLimitsTitle, { color: colors.textSecondary }]}>
          📊 Rango de negociación:
        </Text>
        <View style={styles.negotiationLimitsRow}>
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary }]}>
              Mínimo
            </Text>
            <Text style={[styles.limitValue, { color: '#4CAF50' }]}>
              C${minNegotiationPrice}
            </Text>
          </View>
          <View style={styles.limitDivider} />
          <View style={styles.limitItem}>
            <Text style={[styles.limitLabel, { color: colors.textSecondary }]}>
              Máximo
            </Text>
            <Text style={[styles.limitValue, { color: '#FF9800' }]}>
              C${maxNegotiationPrice}
            </Text>
          </View>
        </View>
      </View>

      {/* Botones de acción */}
      <View style={styles.actions}>
        {acceptedClientPrice ? (
          <TouchableOpacity
            style={[styles.acceptButton, { backgroundColor: '#4CAF50' }]}
            onPress={onAcceptOffer}
          >
            <Text style={styles.acceptButtonText}>
              🚀 Aceptar y Comenzar Viaje
            </Text>
          </TouchableOpacity>
        ) : (
          <>
            <TouchableOpacity
              style={[styles.viewButton, { backgroundColor: colors.primary }]}
              onPress={onViewOffer}
            >
              <Text style={styles.viewButtonText}>
                💬 Ver oferta y negociar
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.quickAcceptButton, { 
                backgroundColor: hasPendingCounterOffer ? '#9E9E9E' : '#4CAF50' 
              }]}
              onPress={hasPendingCounterOffer ? undefined : onAcceptOffer}
              disabled={hasPendingCounterOffer}
            >
              <Text style={styles.quickAcceptButtonText}>
                {hasPendingCounterOffer ? '⏳ Esperando confirmación' : `✅ Aceptar C$${offeredPrice}`}
              </Text>
            </TouchableOpacity>
          </>
        )}
      </View>

      {/* Modal de Biometría */}
      {showBiometricModal && (
        <Modal visible={true} transparent={true}>
          <View style={styles.biometricModal}>
            <View style={styles.biometricContent}>
              <Text style={styles.biometricTitle}>Verifica tu identidad</Text>
              <Text style={styles.biometricSubtitle}>
                Se requiere biometría para aceptar este viaje
              </Text>

              <TouchableOpacity
                style={styles.biometricButton}
                onPress={() => handleBiometricConfirmation('fingerprint')}
                disabled={isAuthenticating}
              >
                <Text style={styles.biometricButtonText}>👆 Usar Huella</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.biometricButton}
                onPress={() => handleBiometricConfirmation('face_id')}
                disabled={isAuthenticating}
              >
                <Text style={styles.biometricButtonText}>👤 Usar Face ID</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowBiometricModal(false)}
                disabled={isAuthenticating}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  driverAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  driverAvatarText: {
    fontSize: 20,
    fontWeight: '700',
  },
  driverInfo: {
    flex: 1,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
  },
  rating: {
    fontSize: 14,
  },
  distanceSection: {
    borderRadius: 8,
    padding: 10,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  distanceLabel: {
    fontSize: 13,
    fontWeight: '500',
  },
  distanceValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  vehicleSection: {
    flexDirection: 'row',
    marginBottom: 12,
    gap: 12,
  },
  vehicleImage: {
    width: 80,
    height: 60,
    borderRadius: 8,
    backgroundColor: '#E0E0E0',
  },
  vehicleInfo: {
    flex: 1,
    justifyContent: 'center',
  },
  vehicleText: {
    fontSize: 14,
    marginBottom: 4,
  },
  plateText: {
    fontSize: 13,
  },
  priceSection: {
    marginBottom: 12,
  },
  acceptedPriceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  offerPriceContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  acceptedLabel: {
    fontSize: 15,
    fontWeight: '600',
  },
  offerLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  savingsText: {
    fontSize: 13,
    fontStyle: 'italic',
    textAlign: 'right',
  },
  negotiationLimitsSection: {
    borderRadius: 8,
    padding: 12,
    marginBottom: 12,
  },
  negotiationLimitsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  negotiationLimitsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  limitItem: {
    flex: 1,
    alignItems: 'center',
  },
  limitLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  limitValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  limitDivider: {
    width: 1,
    height: 30,
    backgroundColor: '#E0E0E0',
  },
  actions: {
    gap: 8,
  },
  viewButton: {
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  viewButtonText: {
    color: '#FFF',
    fontSize: 15,
    fontWeight: '600',
  },
  quickAcceptButton: {
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickAcceptButtonText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  acceptButton: {
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
  biometricModal: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  biometricContent: {
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    width: '80%',
    alignItems: 'center',
  },
  biometricTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  },
  biometricSubtitle: {
    fontSize: 14,
    color: '#666',
    marginBottom: 20,
    textAlign: 'center',
  },
  biometricButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginBottom: 12,
    width: '100%',
    alignItems: 'center',
  },
  biometricButtonText: {
    color: '#fff',
    fontWeight: '700',
    fontSize: 14,
  },
  cancelButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#ddd',
    width: '100%',
    alignItems: 'center',
  },
  cancelButtonText: {
    color: '#666',
    fontWeight: '600',
    fontSize: 14,
  },
});
