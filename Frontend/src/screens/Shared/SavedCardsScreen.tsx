import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../config/firebase';

interface SavedCardsScreenProps {
  navigation: any;
}

interface Card {
  id: string;
  provider: 'stripe' | 'visanet';
  brand: string;
  last4: string;
  expMonth: number;
  expYear: number;
  isDefault: boolean;
}

export default function SavedCardsScreen({ navigation }: SavedCardsScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

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
      Alert.alert('Error', 'No se pudieron cargar las tarjetas');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
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
              setDeleting(cardId);
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
            } finally {
              setDeleting(null);
            }
          },
        },
      ]
    );
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

  const getCardIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('visa')) return '💳';
    if (brandLower.includes('mastercard')) return '💳';
    if (brandLower.includes('amex')) return '💳';
    return '💳';
  };

  const getProviderName = (provider: string) => {
    if (provider === 'stripe') return 'Internacional';
    if (provider === 'visanet') return 'Local (Visanet)';
    return provider;
  };

  const renderCard = ({ item }: { item: Card }) => (
    <View style={[styles.cardItem, item.isDefault && styles.cardItemDefault]}>
      <View style={styles.cardHeader}>
        <Text style={styles.cardIcon}>{getCardIcon(item.brand)}</Text>
        <View style={styles.cardInfo}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardBrand}>{item.brand.toUpperCase()}</Text>
            {item.isDefault && (
              <View style={styles.defaultBadge}>
                <Text style={styles.defaultBadgeText}>Predeterminada</Text>
              </View>
            )}
          </View>
          <Text style={styles.cardNumber}>•••• {item.last4}</Text>
          <Text style={styles.cardExpiry}>
            Vence: {String(item.expMonth).padStart(2, '0')}/{item.expYear}
          </Text>
          <Text style={styles.cardProvider}>{getProviderName(item.provider)}</Text>
        </View>
      </View>

      <View style={styles.cardActions}>
        {!item.isDefault && (
          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => handleSetDefault(item.id)}
          >
            <Text style={styles.actionButtonText}>⭐ Predeterminada</Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteCard(item.id)}
          disabled={deleting === item.id}
        >
          {deleting === item.id ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <Text style={styles.deleteButtonText}>🗑️ Eliminar</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Cargando tarjetas...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Text style={styles.backButtonText}>←</Text>
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Mis Tarjetas</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Lista de tarjetas */}
      {cards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyIcon}>💳</Text>
          <Text style={styles.emptyTitle}>No tienes tarjetas guardadas</Text>
          <Text style={styles.emptyText}>
            Agrega una tarjeta para pagar más rápido en tus próximos viajes
          </Text>
        </View>
      ) : (
        <FlatList
          data={cards}
          renderItem={renderCard}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* Botón para agregar tarjeta */}
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('AddCard')}
      >
        <Text style={styles.addButtonText}>+ Agregar Tarjeta</Text>
      </TouchableOpacity>

      {/* Info de seguridad */}
      <View style={styles.securityInfo}>
        <Text style={styles.securityIcon}>🔒</Text>
        <Text style={styles.securityText}>
          Tus tarjetas están protegidas con encriptación de nivel bancario.
          No guardamos tu CVV.
        </Text>
      </View>
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.surface,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: colors.textSecondary,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: colors.card,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backButtonText: {
    fontSize: 24,
    color: colors.text,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  listContent: {
    padding: 16,
  },
  cardItem: {
    backgroundColor: colors.card,
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    borderWidth: 2,
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  cardItemDefault: {
    borderColor: '#4CAF50',
    backgroundColor: '#F1F8F4',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  cardIcon: {
    fontSize: 40,
    marginRight: 16,
  },
  cardInfo: {
    flex: 1,
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  cardBrand: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginRight: 8,
  },
  defaultBadge: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
  },
  defaultBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#fff',
  },
  cardNumber: {
    fontSize: 18,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  cardExpiry: {
    fontSize: 12,
    color: colors.textSecondary,
    marginBottom: 4,
  },
  cardProvider: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  cardActions: {
    flexDirection: 'row',
    gap: 8,
  },
  actionButton: {
    flex: 1,
    backgroundColor: colors.primary,
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  actionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  deleteButton: {
    backgroundColor: '#f44336',
  },
  deleteButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    fontSize: 14,
    color: colors.textSecondary,
    textAlign: 'center',
    lineHeight: 20,
  },
  addButton: {
    backgroundColor: colors.primary,
    margin: 16,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  addButtonText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  securityInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E8F5E9',
    padding: 16,
    margin: 16,
    marginTop: 0,
    borderRadius: 12,
  },
  securityIcon: {
    fontSize: 24,
    marginRight: 12,
  },
  securityText: {
    flex: 1,
    fontSize: 12,
    color: '#2E7D32',
    lineHeight: 18,
  },
});
