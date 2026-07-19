import React, { useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (filters: Filters) => void;
  currentFilters: Filters;
}

export interface Filters {
  minDistance: number;
  maxDistance: number;
  minPrice: number;
  maxPrice: number;
  rideType: 'all' | 'normal' | 'premium' | 'shared';
}

export default function FilterModal({ visible, onClose, onApply, currentFilters }: FilterModalProps) {
  const { colors } = useTheme();
  const [filters, setFilters] = useState<Filters>(currentFilters);

  const handleApply = () => {
    onApply(filters);
    onClose();
  };

  const handleReset = () => {
    const defaultFilters: Filters = {
      minDistance: 0,
      maxDistance: 100,
      minPrice: 0,
      maxPrice: 1000,
      rideType: 'all',
    };
    setFilters(defaultFilters);
  };

  const styles = StyleSheet.create({
    modalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'flex-end',
    },
    modalContent: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 24,
      maxHeight: '80%',
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
    },
    closeButton: {
      padding: 8,
    },
    closeButtonText: {
      fontSize: 24,
      color: colors.textSecondary,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    rangeContainer: {
      flexDirection: 'row',
      gap: 12,
    },
    inputContainer: {
      flex: 1,
    },
    inputLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      marginBottom: 4,
    },
    input: {
      backgroundColor: colors.surface,
      borderRadius: 8,
      padding: 12,
      fontSize: 16,
      color: colors.text,
      borderWidth: 1,
      borderColor: colors.border,
    },
    rideTypeContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    rideTypeButton: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    rideTypeButtonActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    rideTypeText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    rideTypeTextActive: {
      color: '#FFFFFF',
    },
    footer: {
      flexDirection: 'row',
      gap: 12,
      marginTop: 16,
    },
    button: {
      flex: 1,
      padding: 16,
      borderRadius: 12,
      alignItems: 'center',
    },
    resetButton: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    applyButton: {
      backgroundColor: colors.primary,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '700',
    },
    resetButtonText: {
      color: colors.text,
    },
    applyButtonText: {
      color: '#FFFFFF',
    },
  });

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          <View style={styles.header}>
            <Text style={styles.title}>🎛️ Filtros</Text>
            <TouchableOpacity style={styles.closeButton} onPress={onClose}>
              <Text style={styles.closeButtonText}>×</Text>
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false}>
            {/* Distancia */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>📏 Distancia (km)</Text>
              <View style={styles.rangeContainer}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Mínimo</Text>
                  <TextInput
                    style={styles.input}
                    value={filters.minDistance.toString()}
                    onChangeText={(text) => setFilters({ ...filters, minDistance: parseFloat(text) || 0 })}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Máximo</Text>
                  <TextInput
                    style={styles.input}
                    value={filters.maxDistance.toString()}
                    onChangeText={(text) => setFilters({ ...filters, maxDistance: parseFloat(text) || 100 })}
                    keyboardType="numeric"
                    placeholder="100"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>
            </View>

            {/* Precio */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>💰 Precio (C$)</Text>
              <View style={styles.rangeContainer}>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Mínimo</Text>
                  <TextInput
                    style={styles.input}
                    value={filters.minPrice.toString()}
                    onChangeText={(text) => setFilters({ ...filters, minPrice: parseFloat(text) || 0 })}
                    keyboardType="numeric"
                    placeholder="0"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
                <View style={styles.inputContainer}>
                  <Text style={styles.inputLabel}>Máximo</Text>
                  <TextInput
                    style={styles.input}
                    value={filters.maxPrice.toString()}
                    onChangeText={(text) => setFilters({ ...filters, maxPrice: parseFloat(text) || 1000 })}
                    keyboardType="numeric"
                    placeholder="1000"
                    placeholderTextColor={colors.textTertiary}
                  />
                </View>
              </View>
            </View>

            {/* Tipo de Viaje */}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>🚗 Tipo de Viaje</Text>
              <View style={styles.rideTypeContainer}>
                {(['all', 'normal', 'premium', 'shared'] as const).map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.rideTypeButton,
                      filters.rideType === type && styles.rideTypeButtonActive,
                    ]}
                    onPress={() => setFilters({ ...filters, rideType: type })}
                  >
                    <Text
                      style={[
                        styles.rideTypeText,
                        filters.rideType === type && styles.rideTypeTextActive,
                      ]}
                    >
                      {type === 'all' ? 'Todos' : type === 'normal' ? 'Normal' : type === 'premium' ? 'Premium' : 'Compartido'}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </ScrollView>

          {/* Footer */}
          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.resetButton]}
              onPress={handleReset}
            >
              <Text style={[styles.buttonText, styles.resetButtonText]}>
                Restablecer
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.button, styles.applyButton]}
              onPress={handleApply}
            >
              <Text style={[styles.buttonText, styles.applyButtonText]}>
                Aplicar
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
