import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
} from 'react-native';

interface CancelRideDialogProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  requiresReason: boolean;
  progressPercentage?: number;
  colors: any;
}

export default function CancelRideDialog({
  visible,
  onClose,
  onConfirm,
  requiresReason,
  progressPercentage = 0,
  colors,
}: CancelRideDialogProps) {
  const [reason, setReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleConfirm = async () => {
    // Validar razón si es requerida
    if (requiresReason && reason.trim().length < 10) {
      Alert.alert(
        'Razón requerida',
        'Debes proporcionar una razón de al menos 10 caracteres para cancelar este viaje.'
      );
      return;
    }

    setLoading(true);
    try {
      await onConfirm(reason.trim());
      setReason('');
      onClose();
    } catch (error: any) {
      Alert.alert('Error', error.message || 'No se pudo cancelar el viaje');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    setReason('');
    onClose();
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={handleClose}
    >
      <View style={styles.overlay}>
        <View style={[styles.dialog, { backgroundColor: colors.card }]}>
          {/* Header */}
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>
              ⚠️ Cancelar Viaje
            </Text>
            {progressPercentage > 0 && (
              <Text style={[styles.progressText, { color: colors.textSecondary }]}>
                Progreso: {progressPercentage.toFixed(0)}%
              </Text>
            )}
          </View>

          {/* Mensaje */}
          <Text style={[styles.message, { color: colors.textSecondary }]}>
            {requiresReason
              ? `El viaje lleva ${progressPercentage.toFixed(0)}% de progreso. Debes proporcionar una razón para cancelarlo.`
              : '¿Estás seguro de que deseas cancelar este viaje?'}
          </Text>

          {/* Input de razón */}
          {requiresReason && (
            <View style={styles.inputContainer}>
              <Text style={[styles.label, { color: colors.text }]}>
                Razón de cancelación *
              </Text>
              <TextInput
                style={[
                  styles.input,
                  {
                    backgroundColor: colors.background,
                    color: colors.text,
                    borderColor: colors.border,
                  },
                ]}
                placeholder="Escribe la razón (mínimo 10 caracteres)"
                placeholderTextColor={colors.textSecondary}
                value={reason}
                onChangeText={setReason}
                multiline
                numberOfLines={3}
                maxLength={200}
                editable={!loading}
              />
              <Text style={[styles.charCount, { color: colors.textSecondary }]}>
                {reason.length}/200 caracteres
              </Text>
            </View>
          )}

          {/* Razones sugeridas */}
          {requiresReason && (
            <View style={styles.suggestionsContainer}>
              <Text style={[styles.suggestionsTitle, { color: colors.textSecondary }]}>
                Razones sugeridas:
              </Text>
              <View style={styles.suggestions}>
                {[
                  'Emergencia personal',
                  'Problema con el vehículo',
                  'Cambio de planes',
                  'Ruta incorrecta',
                  'Demora excesiva',
                ].map((suggestion) => (
                  <TouchableOpacity
                    key={suggestion}
                    style={[styles.suggestionButton, { borderColor: colors.border }]}
                    onPress={() => setReason(suggestion)}
                    disabled={loading}
                  >
                    <Text style={[styles.suggestionText, { color: colors.text }]}>
                      {suggestion}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {/* Botones */}
          <View style={styles.buttons}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton, { borderColor: colors.border }]}
              onPress={handleClose}
              disabled={loading}
            >
              <Text style={[styles.buttonText, { color: colors.text }]}>
                No cancelar
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.button, styles.confirmButton]}
              onPress={handleConfirm}
              disabled={loading}
            >
              {loading ? (
                <ActivityIndicator color="#FFFFFF" />
              ) : (
                <Text style={styles.confirmButtonText}>
                  Sí, cancelar
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    width: '100%',
    maxWidth: 400,
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 4,
  },
  progressText: {
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  inputContainer: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    fontSize: 15,
    textAlignVertical: 'top',
    minHeight: 80,
  },
  charCount: {
    fontSize: 12,
    marginTop: 4,
    textAlign: 'right',
  },
  suggestionsContainer: {
    marginBottom: 20,
  },
  suggestionsTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  suggestions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  suggestionButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  suggestionText: {
    fontSize: 13,
  },
  buttons: {
    flexDirection: 'row',
    gap: 12,
  },
  button: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButton: {
    borderWidth: 1,
  },
  confirmButton: {
    backgroundColor: '#EF4444',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
  },
});
