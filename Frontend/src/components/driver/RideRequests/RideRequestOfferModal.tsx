import React from 'react';
import { View, Text, TextInput, TouchableOpacity, Modal } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { RideRequest } from './RideRequestCard';

interface RideRequestOfferModalProps {
  visible: boolean;
  selectedRide: RideRequest | null;
  customOffer: string;
  accepting: boolean;
  colors: any;
  onSetCustomOffer: (v: string) => void;
  onClose: () => void;
  onSubmit: () => void;
  styles: any;
}

export function RideRequestOfferModal({
  visible,
  selectedRide,
  customOffer,
  accepting,
  colors,
  onSetCustomOffer,
  onClose,
  onSubmit,
  styles,
}: RideRequestOfferModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <Text style={styles.modalTitle}>Ofrecer Tarifa Personalizada</Text>

          {selectedRide && (
            <View style={styles.modalInfo}>
              <Text style={styles.modalInfoText}>
                Tarifa sugerida: <Text style={styles.modalInfoBold}>C${selectedRide.estimatedPrice}</Text>
              </Text>
              {selectedRide.clientSuggestedPrice && (
                <Text style={styles.modalInfoText}>
                  Cliente ofrece: <Text style={styles.modalInfoBold}>C${selectedRide.clientSuggestedPrice}</Text>
                </Text>
              )}

              {(() => {
                const minPrice = Math.max(50, Math.round(selectedRide.estimatedPrice * 0.6667 * 100) / 100);
                const maxPrice = Math.min(500, Math.round(selectedRide.estimatedPrice * 1.3333 * 100) / 100);
                return (
                  <View style={[styles.priceRangeContainer, { backgroundColor: colors.background, borderColor: colors.primary }]}>
                    <Text style={[styles.priceRangeTitle, { color: colors.text }]}>
                      <MaterialIcons name="bar-chart" size={18} color={colors.primary} /> Rango de negociación:
                    </Text>
                    <View style={styles.priceRangeValues}>
                      <View style={styles.priceRangeItem}>
                        <Text style={[styles.priceRangeLabel, { color: colors.textSecondary }]}>
                          Mínimo
                        </Text>
                        <Text style={[styles.priceRangeValue, { color: '#4CAF50' }]}>
                          C${minPrice}
                        </Text>
                      </View>
                      <Text style={[styles.priceRangeDash, { color: colors.textSecondary }]}>
                        —
                      </Text>
                      <View style={styles.priceRangeItem}>
                        <Text style={[styles.priceRangeLabel, { color: colors.textSecondary }]}>
                          Máximo
                        </Text>
                        <Text style={[styles.priceRangeValue, { color: '#FF9800' }]}>
                          C${maxPrice}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          )}

          <Text style={styles.inputLabel}>Tu oferta:</Text>
          <TextInput
            style={styles.priceInput}
            value={customOffer}
            onChangeText={onSetCustomOffer}
            keyboardType="numeric"
            placeholder="Ej: 150"
          />

          <View style={styles.modalButtons}>
            <TouchableOpacity
              style={styles.modalCancelButton}
              onPress={onClose}
            >
              <Text style={styles.modalCancelText}>Cancelar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.modalSubmitButton}
              onPress={onSubmit}
              disabled={accepting}
            >
              <Text style={styles.modalSubmitText}>
                {accepting ? 'Enviando...' : 'Enviar Oferta'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
