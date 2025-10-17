import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TouchableOpacity,
  TextInput,
  Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface Driver {
  id?: string;
  name?: string;
  rating?: number;
  phone?: string;
}

interface PriceNegotiationModalProps {
  visible: boolean;
  onClose: () => void;
  driver?: Driver | null;
  estimatedPrice?: number;
  clientSuggestedPrice?: number;
  driverOfferedPrice?: number;
  onAcceptDriverOffer: () => void;
  onSendCounterOffer: (price: number) => void;
  onAcceptAndStartRide: () => void;
  negotiationStatus?: string;
  acceptedClientPrice?: boolean;
}

export default function PriceNegotiationModal({
  visible,
  onClose,
  driver = null,
  estimatedPrice = 0,
  clientSuggestedPrice = 0,
  driverOfferedPrice = 0,
  onAcceptDriverOffer,
  onSendCounterOffer,
  onAcceptAndStartRide,
  negotiationStatus = '',
  acceptedClientPrice = false,
}: PriceNegotiationModalProps) {
  const { colors } = useTheme();
  const [counterOffer, setCounterOffer] = useState('');

  const handleSendCounterOffer = () => {
    const price = parseFloat(counterOffer);
    if (isNaN(price) || price < 50) {
      Alert.alert('Error', 'El precio debe ser mínimo C$50');
      return;
    }
    onSendCounterOffer(price);
    setCounterOffer('');
    // Cerrar el modal después de enviar la contraoferta
    onClose();
  };

  const driverAcceptedClientPrice = acceptedClientPrice || negotiationStatus === 'driver_accepted';
  const driverMadeCounterOffer = driverOfferedPrice > 0 && !acceptedClientPrice;
  
  // Debug logging
  console.log('🔍 PriceNegotiationModal props:', {
    acceptedClientPrice,
    driverOfferedPrice,
    negotiationStatus,
    driverAcceptedClientPrice,
    driverMadeCounterOffer,
  });
  
  // Valores por defecto para colores
  const textColor = colors?.text || '#000';
  const textSecondaryColor = colors?.textSecondary || '#666';
  const surfaceColor = colors?.surface || '#FFF';
  const primaryColor = colors?.primary || '#2196F3';
  const backgroundColor = colors?.background || '#F5F5F5';

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.container, { backgroundColor: surfaceColor }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: textColor }]}>
              💬 Negociación de Precio
            </Text>
            <TouchableOpacity onPress={onClose}>
              <Text style={styles.closeButton}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Información del Conductor */}
          {driver && driver.name ? (
            <View style={styles.driverInfo}>
              <Text style={[styles.driverName, { color: textColor }]}>
                {'🚗 Conductor: ' + String(driver.name)}
              </Text>
              {driver.rating && driver.rating > 0 ? (
                <Text style={[styles.driverRating, { color: textSecondaryColor }]}>
                  {'⭐ ' + driver.rating.toFixed(1)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {/* Resumen de Precios */}
          <View style={styles.pricesSummary}>
            <View style={styles.priceRow}>
              <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                Precio estimado:
              </Text>
              <Text style={[styles.priceValue, { color: textColor }]}>
                {'C$' + (estimatedPrice || 0)}
              </Text>
            </View>
            {clientSuggestedPrice && clientSuggestedPrice > 0 ? (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                  Tu precio sugerido:
                </Text>
                <Text style={[styles.priceValue, { color: '#2196F3' }]}>
                  {'C$' + clientSuggestedPrice}
                </Text>
              </View>
            ) : null}
            {driverOfferedPrice && driverOfferedPrice > 0 ? (
              <View style={styles.priceRow}>
                <Text style={[styles.priceLabel, { color: textSecondaryColor }]}>
                  Conductor ofrece:
                </Text>
                <Text style={[styles.priceValue, { color: '#FF9800' }]}>
                  {'C$' + driverOfferedPrice}
                </Text>
              </View>
            ) : null}
          </View>

          {/* Estado de Negociación */}
          {driverAcceptedClientPrice ? (
            // Conductor aceptó el precio del cliente
            <View style={styles.acceptedContainer}>
              <Text style={styles.acceptedIcon}>✅</Text>
              <Text style={[styles.acceptedTitle, { color: textColor }]}>
                ¡Conductor aceptó tu precio!
              </Text>
              <Text style={[styles.acceptedSubtitle, { color: textSecondaryColor }]}>
                {'Precio final: C$' + (clientSuggestedPrice || 0)}
              </Text>
              <TouchableOpacity
                style={[styles.startRideButton, { backgroundColor: primaryColor }]}
                onPress={onAcceptAndStartRide}
              >
                <Text style={styles.startRideButtonText}>
                  🚀 Aceptar y Comenzar Viaje
                </Text>
              </TouchableOpacity>
            </View>
          ) : driverMadeCounterOffer ? (
            // Conductor hizo contraoferta
            <View style={styles.negotiationContainer}>
              <Text style={[styles.negotiationTitle, { color: textColor }]}>
                {'El conductor propone: C$' + (driverOfferedPrice || 0)}
              </Text>
              <Text style={[styles.negotiationSubtitle, { color: textSecondaryColor }]}>
                Puedes aceptar su oferta o hacer una contraoferta
              </Text>

              {/* Botones de Acción */}
              <View style={styles.actionsContainer}>
                <TouchableOpacity
                  style={[styles.acceptButton, { backgroundColor: '#4CAF50' }]}
                  onPress={onAcceptDriverOffer}
                >
                  <Text style={styles.acceptButtonText}>
                    {'✅ Aceptar C$' + (driverOfferedPrice || 0)}
                  </Text>
                </TouchableOpacity>

                <View style={styles.counterOfferSection}>
                  <Text style={[styles.counterOfferLabel, { color: textColor }]}>
                    O hacer contraoferta:
                  </Text>
                  <View style={styles.counterOfferInput}>
                    <TextInput
                      style={[styles.input, { 
                        backgroundColor: backgroundColor, 
                        color: textColor 
                      }]}
                      value={counterOffer}
                      onChangeText={setCounterOffer}
                      keyboardType="numeric"
                      placeholder="Ej: 85"
                      placeholderTextColor={textSecondaryColor}
                    />
                    <TouchableOpacity
                      style={[styles.sendButton, { backgroundColor: primaryColor }]}
                      onPress={handleSendCounterOffer}
                    >
                      <Text style={styles.sendButtonText}>Enviar</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </View>
          ) : (
            // Esperando respuesta del conductor
            <View style={styles.waitingContainer}>
              <Text style={styles.waitingIcon}>⏳</Text>
              <Text style={[styles.waitingText, { color: textColor }]}>
                Esperando respuesta del conductor...
              </Text>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    width: '90%',
    maxHeight: '80%',
    borderRadius: 16,
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
  },
  closeButton: {
    fontSize: 24,
    color: '#666',
  },
  driverInfo: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
  },
  driverName: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 4,
  },
  driverRating: {
    fontSize: 14,
  },
  pricesSummary: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    padding: 16,
    marginBottom: 20,
  },
  priceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priceLabel: {
    fontSize: 14,
  },
  priceValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  acceptedContainer: {
    alignItems: 'center',
    paddingVertical: 20,
  },
  acceptedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  acceptedTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  acceptedSubtitle: {
    fontSize: 16,
    marginBottom: 24,
  },
  startRideButton: {
    width: '100%',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  startRideButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  negotiationContainer: {
    paddingVertical: 10,
  },
  negotiationTitle: {
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
    textAlign: 'center',
  },
  negotiationSubtitle: {
    fontSize: 14,
    marginBottom: 20,
    textAlign: 'center',
  },
  actionsContainer: {
    gap: 16,
  },
  acceptButton: {
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
  },
  acceptButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '700',
  },
  counterOfferSection: {
    gap: 12,
  },
  counterOfferLabel: {
    fontSize: 14,
    fontWeight: '600',
  },
  counterOfferInput: {
    flexDirection: 'row',
    gap: 12,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
  },
  sendButton: {
    borderRadius: 8,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  sendButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  waitingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
  },
  waitingIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  waitingText: {
    fontSize: 16,
    textAlign: 'center',
  },
});
