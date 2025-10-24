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
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../config/firebase';

interface Card {
  id: string;
  provider: 'local'; // Bancos nacionales
  bank?: 'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz';
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export default function PaymentMethodsScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      setLoading(true);
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      const functions = getFunctions(app);
      const getCardsFn = httpsCallable(functions, 'getCards');
      const result = await getCardsFn();
      const data = result.data as any;

      if (data.success) {
        setCards(data.cards);
      }
    } catch (error: any) {
      console.error('Error cargando tarjetas:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (cardId: string) => {
    try {
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase no inicializado');

      const functions = getFunctions(app);
      const setDefaultCardFn = httpsCallable(functions, 'setDefaultCard');
      await setDefaultCardFn({ cardId });

      Alert.alert('✅ Éxito', 'Tarjeta predeterminada actualizada');
      loadCards();
    } catch (error: any) {
      console.error('Error estableciendo tarjeta predeterminada:', error);
      Alert.alert('Error', 'No se pudo actualizar la tarjeta predeterminada');
    }
  };

  const handleRemoveCard = async (cardId: string) => {
    Alert.alert(
      'Eliminar Tarjeta',
      '¿Estás seguro de que deseas eliminar esta tarjeta?',
      [
        { text: 'Cancelar', style: 'cancel' },
        {
          text: 'Eliminar',
          style: 'destructive',
          onPress: async () => {
            try {
              const { app } = await initializeFirebase();
              if (!app) throw new Error('Firebase no inicializado');

              const functions = getFunctions(app);
              const deleteCardFn = httpsCallable(functions, 'deleteCard');
              await deleteCardFn({ cardId });

              Alert.alert('✅ Éxito', 'Tarjeta eliminada');
              loadCards();
            } catch (error: any) {
              console.error('Error eliminando tarjeta:', error);
              Alert.alert('Error', 'No se pudo eliminar la tarjeta');
            }
          },
        },
      ]
    );
  };

  const hasDefaultCard = cards.some(card => card.isDefault);

  const renderCard = (card: Card) => (
    <View key={card.id} style={styles.methodCard}>
      <View style={styles.methodIcon}>
        <Text style={styles.methodIconText}>💳</Text>
      </View>
      <View style={styles.methodInfo}>
        <Text style={styles.methodTitle}>
          {card.brand} •••• {card.last4}
        </Text>
        <Text style={styles.methodSubtitle}>
          Expira {String(card.expMonth).padStart(2, '0')}/{card.expYear}
        </Text>
      </View>
      {card.isDefault ? (
        <View style={styles.defaultBadge}>
          <Text style={styles.defaultText}>Predeterminado</Text>
        </View>
      ) : (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.setDefaultButton}
            onPress={() => handleSetDefault(card.id)}
          >
            <Text style={styles.setDefaultText}>Usar</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveCard(card.id)}
          >
            <Text style={styles.removeText}>✕</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando métodos de pago...</Text>
      </View>
    );
  }

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

        {/* Efectivo - Siempre predeterminado si no hay tarjeta predeterminada */}
        <View style={styles.methodCard}>
          <View style={styles.methodIcon}>
            <Text style={styles.methodIconText}>💵</Text>
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>Efectivo</Text>
            <Text style={styles.methodSubtitle}>Paga al conductor</Text>
          </View>
          {!hasDefaultCard && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>Predeterminado</Text>
            </View>
          )}
          {hasDefaultCard && (
            <TouchableOpacity style={styles.setDefaultButton}>
              <Text style={styles.setDefaultText}>Usar</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lista de tarjetas */}
        {cards.map(renderCard)}

        {/* Botón agregar tarjeta */}
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddCard')}
        >
          <Text style={styles.addButtonIcon}>+</Text>
          <Text style={styles.addButtonText}>Agregar Tarjeta</Text>
        </TouchableOpacity>

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
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
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
