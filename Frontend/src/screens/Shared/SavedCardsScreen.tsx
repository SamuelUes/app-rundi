import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/LoadingIcon';
import { useTheme } from '../../context/ThemeContext';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { initializeFirebase } from '../../config/firebase';
import alertService from '../../services/alertService';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
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
      if (!app) throw new Error('Firebase not initialized');

      const functions = getFunctions(app);
      const getCardsFn = httpsCallable(functions, 'getCards');
      const result = await getCardsFn();
      const data = result.data as any;

      if (data.success) {
        setCards(data.cards);
      }
    } catch (error: any) {
      console.error('Error loading cards:', error);
      alertService.showErrorAlert(t('shared.savedCards.alerts.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteCard = async (cardId: string) => {
    alertService.showConfirmAlert(
      t('shared.savedCards.alerts.deleteTitle'),
      t('shared.savedCards.alerts.deleteMessage'),
      async () => {
        try {
          setDeleting(cardId);
          const { app } = await initializeFirebase();
          if (!app) throw new Error('Firebase not initialized');

          const functions = getFunctions(app);
          const deleteCardFn = httpsCallable(functions, 'deleteCard');
          await deleteCardFn({ cardId });

          alertService.showSuccessAlert(
            t('shared.savedCards.alerts.deleteSuccessTitle'),
            t('shared.savedCards.alerts.deleteSuccessMessage'),
          );
          loadCards();
        } catch (error: any) {
          console.error('Error deleting card:', error);
          alertService.showErrorAlert(t('shared.savedCards.alerts.deleteError'));
        } finally {
          setDeleting(null);
        }
      },
      undefined,
      t('shared.savedCards.alerts.deleteConfirm'),
      t('shared.savedCards.alerts.deleteCancel'),
      true
    );
  };

  const handleSetDefault = async (cardId: string) => {
    try {
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase not initialized');

      const functions = getFunctions(app);
      const setDefaultCardFn = httpsCallable(functions, 'setDefaultCard');
      await setDefaultCardFn({ cardId });

      alertService.showSuccessAlert(
        t('shared.savedCards.alerts.defaultSuccessTitle'),
        t('shared.savedCards.alerts.defaultSuccessMessage'),
      );
      loadCards();
    } catch (error: any) {
      console.error('Error setting default card:', error);
      alertService.showErrorAlert(t('shared.savedCards.alerts.defaultError'));
    }
  };

  const getCardIcon = (brand: string) => {
    const brandLower = brand.toLowerCase();
    if (brandLower.includes('visa')) return 'credit-card';
    if (brandLower.includes('mastercard')) return 'credit-card';
    if (brandLower.includes('amex')) return 'credit-card';
    return 'credit-card';
  };

  const getProviderName = (provider: string) => {
    if (provider === 'stripe') return t('shared.savedCards.cards.provider.stripe');
    if (provider === 'visanet') return t('shared.savedCards.cards.provider.visanet');
    return t('shared.savedCards.cards.provider.fallback', { provider });
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
                <Text style={styles.defaultBadgeText}>
                  {t('shared.savedCards.cards.defaultBadge')}
                </Text>
              </View>
            )}
          </View>
          <Text style={styles.cardNumber}>•••• {item.last4}</Text>
          <Text style={styles.cardExpiry}>
            {t('shared.savedCards.cards.expires', {
              month: String(item.expMonth).padStart(2, '0'),
              year: item.expYear,
            })}
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
            <Text style={styles.actionButtonText}>
              {t('shared.savedCards.cards.actions.setDefault')}
            </Text>
          </TouchableOpacity>
        )}
        
        <TouchableOpacity
          style={[styles.actionButton, styles.deleteButton]}
          onPress={() => handleDeleteCard(item.id)}
          disabled={deleting === item.id}
        >
          {deleting === item.id ? (
            <LoadingIcon size={20} color="#fff" />
          ) : (
            <Text style={styles.deleteButtonText}>
              {t('shared.savedCards.cards.actions.delete')}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  );

  if (loading) {
    return (
      <View style={styles.loadingContainer}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{t('shared.savedCards.loading')}</Text>
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
        <Text style={styles.headerTitle}>{t('shared.savedCards.header.title')}</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* Lista de tarjetas */}
      {cards.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="credit-card" size={48} color={colors.textSecondary} />
          <Text style={styles.emptyTitle}>{t('shared.savedCards.empty.title')}</Text>
          <Text style={styles.emptyText}>{t('shared.savedCards.empty.description')}</Text>
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

      {/* Botón para agregar tarjeta - desactivado temporalmente
      <TouchableOpacity
        style={styles.addButton}
        onPress={() => navigation.navigate('AddCard')}
      >
        <Text style={styles.addButtonText}>{t('shared.savedCards.buttons.addCard')}</Text>
      </TouchableOpacity>
      */}

      {/* Info de seguridad */}
      <View style={styles.securityInfo}>
        <MaterialIcons name="lock-outline" size={20} color={colors.textSecondary} />
        <Text style={styles.securityText}>{t('shared.savedCards.security.message')}</Text>
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
