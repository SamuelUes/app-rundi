import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Alert,
  TextInput,
  ScrollView,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';

interface PaymentMethod {
  id: string;
  type: 'card' | 'cash';
  last4?: string;
  brand?: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export default function PaymentMethodsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [paymentMethods, setPaymentMethods] = useState<PaymentMethod[]>([
    {
      id: '1',
      type: 'card',
      last4: '4242',
      brand: 'Visa',
      expiryMonth: 12,
      expiryYear: 2025,
      isDefault: true,
    },
    {
      id: '2',
      type: 'cash',
      isDefault: false,
    },
  ]);

  const [showAddCard, setShowAddCard] = useState(false);

  const handleSetDefault = (methodId: string) => {
    setPaymentMethods((prev) =>
      prev.map((method) => ({
        ...method,
        isDefault: method.id === methodId,
      }))
    );
    Alert.alert('Método actualizado', 'Método de pago predeterminado actualizado');
  };

  const handleRemoveCard = (methodId: string) => {
    Alert.alert(
      'Eliminar método',
      '¿Estás seguro que deseas eliminar este método de pago?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: () => {
            setPaymentMethods((prev) => prev.filter((m) => m.id !== methodId));
          },
        },
      ]
    );
  };

  const renderPaymentMethod = (method: PaymentMethod) => {
    if (method.type === 'cash') {
      return (
        <View key={method.id} style={styles.methodCard}>
          <View style={styles.methodIcon}>
            <Text style={styles.methodIconText}>💵</Text>
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>Efectivo</Text>
            <Text style={styles.methodSubtitle}>Paga al conductor</Text>
          </View>
          {method.isDefault && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Predeterminado</Text>
            </View>
          )}
          {!method.isDefault && (
            <TouchableOpacity
              style={styles.setDefaultButton}
              onPress={() => handleSetDefault(method.id)}
            >
              <Text style={styles.setDefaultText}>Usar</Text>
            </TouchableOpacity>
          )}
        </View>
      );
    }

    return (
      <View key={method.id} style={styles.methodCard}>
        <View style={styles.methodIcon}>
          <Text style={styles.methodIconText}>💳</Text>
        </View>
        <View style={styles.methodInfo}>
          <Text style={styles.methodTitle}>
            {method.brand} •••• {method.last4}
          </Text>
          <Text style={styles.methodSubtitle}>
            Expira {method.expiryMonth}/{method.expiryYear}
          </Text>
        </View>
        {method.isDefault ? (
          <View style={styles.defaultBadge}>
            <Text style={styles.defaultText}>Predeterminado</Text>
          </View>
        ) : (
          <View style={styles.cardActions}>
            <TouchableOpacity
              style={styles.setDefaultButton}
              onPress={() => handleSetDefault(method.id)}
            >
              <Text style={styles.setDefaultText}>Usar</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.removeButton}
              onPress={() => handleRemoveCard(method.id)}
            >
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Métodos de Pago</Text>
          <Text style={styles.subtitle}>
            Gestiona tus métodos de pago
          </Text>
        </View>

        {/* Lista de métodos */}
        <View style={styles.methodsList}>
          {paymentMethods.map(renderPaymentMethod)}
        </View>

        {/* Botón agregar tarjeta */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => setShowAddCard(true)}
        >
          <Text style={styles.addButtonIcon}>+</Text>
          <Text style={styles.addButtonText}>Agregar Tarjeta</Text>
        </TouchableOpacity>

        {/* Formulario agregar tarjeta (simplificado) */}
        {showAddCard && (
          <View style={styles.addCardForm}>
            <Text style={styles.formTitle}>Nueva Tarjeta</Text>
            
            <TextInput
              style={styles.input}
              placeholder="Número de tarjeta"
              placeholderTextColor="#999"
              keyboardType="numeric"
              maxLength={19}
            />
            
            <View style={styles.inputRow}>
              <TextInput
                style={[styles.input, styles.inputHalf]}
                placeholder="MM/AA"
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={5}
              />
              <TextInput
                style={[styles.input, styles.inputHalf]}
                placeholder="CVV"
                placeholderTextColor="#999"
                keyboardType="numeric"
                maxLength={4}
                secureTextEntry
              />
            </View>

            <TextInput
              style={styles.input}
              placeholder="Nombre en la tarjeta"
              placeholderTextColor="#999"
            />

            <View style={styles.formActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setShowAddCard(false)}
              >
                <Text style={styles.cancelButtonText}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.saveButton}
                onPress={() => {
                  Alert.alert('Próximamente', 'Integración con Stripe en desarrollo');
                  setShowAddCard(false);
                }}
              >
                <Text style={styles.saveButtonText}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Info de seguridad */}
        <View style={styles.securityInfo}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>
            Tus datos están protegidos con encriptación de nivel bancario
          </Text>
        </View>
      </View>
    </ScrollView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  content: {
    padding: 24,
  },
  header: {
    marginBottom: 24,
  },
  title: {
    fontSize: 28,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textSecondary,
  },
  methodsList: {
    marginBottom: 16,
  },
  methodCard: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  methodIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  methodIconText: {
    fontSize: 24,
  },
  methodInfo: {
    flex: 1,
  },
  methodTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  methodSubtitle: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  defaultBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  defaultText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#4CAF50',
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  setDefaultButton: {
    backgroundColor: colors.surface,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
  },
  setDefaultText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  removeButton: {
    backgroundColor: '#ffebee',
    width: 32,
    height: 32,
    borderRadius: 16,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeText: {
    fontSize: 16,
    color: '#d32f2f',
  },
  addButton: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.border,
    borderStyle: 'dashed',
    marginBottom: 24,
  },
  addButtonIcon: {
    fontSize: 24,
    marginRight: 8,
    color: colors.text,
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  addCardForm: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 16,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
    gap: 12,
  },
  inputHalf: {
    flex: 1,
  },
  formActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.surface,
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.textSecondary,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#000',
    padding: 16,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 16,
    borderRadius: 12,
  },
  securityIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#1976D2',
    lineHeight: 18,
  },
});
