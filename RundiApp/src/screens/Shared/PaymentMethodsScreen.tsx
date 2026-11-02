import React, { useState, useEffect, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ScrollView,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import cardsService from '../../services/payment/cardsService';
import { initializeFirebase } from '../../config/firebase';
import alertService from '../../services/notification/alertService';
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const [cards, setCards] = useState<Card[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadCards();
  }, []);

  const loadCards = async () => {
    try {
      setLoading(true);
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase not initialized');

      const list = await cardsService.getCards();
      setCards(list as any);
    } catch (error: any) {
      console.error('Error loading payment methods:', error);
      alertService.showErrorAlert(t('shared.paymentMethods.alerts.loadError'));
    } finally {
      setLoading(false);
    }
  };

  const handleSetDefault = async (cardId: string) => {
    try {
      const { app } = await initializeFirebase();
      if (!app) throw new Error('Firebase not initialized');

      await cardsService.setDefaultCard(cardId);

      alertService.showSuccessAlert(
        t('shared.paymentMethods.alerts.defaultSuccessTitle'),
        t('shared.paymentMethods.alerts.defaultSuccessMessage'),
      );
      loadCards();
    } catch (error: any) {
      console.error('Error setting default card:', error);
      alertService.showErrorAlert(t('shared.paymentMethods.alerts.defaultError'));
    }
  };

  const handleRemoveCard = async (cardId: string) => {
    alertService.showConfirmAlert(
      t('shared.paymentMethods.alerts.deleteTitle'),
      t('shared.paymentMethods.alerts.deleteMessage'),
      async () => {
        try {
          const { app } = await initializeFirebase();
          if (!app) throw new Error('Firebase not initialized');

          await cardsService.deleteCard(cardId);

          alertService.showSuccessAlert(
            t('shared.paymentMethods.alerts.deleteSuccessTitle'),
            t('shared.paymentMethods.alerts.deleteSuccessMessage'),
          );
          loadCards();
        } catch (error: any) {
          console.error('Error deleting card:', error);
          alertService.showErrorAlert(t('shared.paymentMethods.alerts.deleteError'));
        }
      },
      undefined,
      t('shared.paymentMethods.alerts.deleteConfirm'),
      t('shared.paymentMethods.alerts.deleteCancel'),
      true
    );
  };

  const hasDefaultCard = cards.some(card => card.isDefault);

  const renderCard = (card: Card) => (
    <View key={card.id} style={styles.methodCard}>
      <View style={styles.methodIcon}>
        <MaterialIcons name="credit-card" size={24} color={colors.primary} />
      </View>
      <View style={styles.methodInfo}>
        <Text style={styles.methodTitle}>
          {card.brand} •••• {card.last4}
        </Text>
        <Text style={styles.methodSubtitle}>
          {t('shared.paymentMethods.cards.expires', {
            month: String(card.expMonth).padStart(2, '0'),
            year: card.expYear,
          })}
        </Text>
      </View>
      {card.isDefault ? (
        <View style={styles.defaultBadge}>
          <Text style={styles.defaultText}>
            {t('shared.paymentMethods.cards.defaultBadge')}
          </Text>
        </View>
      ) : (
        <View style={styles.cardActions}>
          <TouchableOpacity
            style={styles.setDefaultButton}
            onPress={() => handleSetDefault(card.id)}
          >
            <Text style={styles.setDefaultText}>
              {t('shared.paymentMethods.cards.actions.use')}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.removeButton}
            onPress={() => handleRemoveCard(card.id)}
          >
            <MaterialIcons name="close" size={20} color={colors.textSecondary} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  );

  if (loading) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <LoadingIcon size={32} color={colors.primary} />
        <Text style={styles.loadingText}>{t('shared.paymentMethods.loading')}</Text>
      </View>
    );
  }

  return (
    <ScrollView style={styles.container}>
      <View style={styles.content}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel={t('shared.paymentMethods.header.goBack')}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.headerText}>
            <Text style={styles.title}>{t('shared.paymentMethods.header.title')}</Text>
            <Text style={styles.subtitle}>
              {t('shared.paymentMethods.header.subtitle')}
            </Text>
          </View>
        </View>

        {/* Efectivo - Siempre predeterminado si no hay tarjeta predeterminada */}
        <View style={styles.methodCard}>
          <View style={styles.methodIcon}>
            <MaterialIcons name="payments" size={24} color={colors.primary} />
          </View>
          <View style={styles.methodInfo}>
            <Text style={styles.methodTitle}>{t('shared.paymentMethods.cash.title')}</Text>
            <Text style={styles.methodSubtitle}>{t('shared.paymentMethods.cash.subtitle')}</Text>
          </View>
          {!hasDefaultCard && (
            <View style={styles.defaultBadge}>
              <Text style={styles.defaultText}>
                {t('shared.paymentMethods.cards.defaultBadge')}
              </Text>
            </View>
          )}
          {hasDefaultCard && (
            <TouchableOpacity style={styles.setDefaultButton}>
              <Text style={styles.setDefaultText}>
                {t('shared.paymentMethods.cards.actions.use')}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Lista de tarjetas */}
        {cards.map(renderCard)}

        {/* Botón agregar tarjeta - desactivado temporalmente
        <TouchableOpacity
          style={styles.addButton}
          onPress={() => navigation.navigate('AddCard')}
        >
          <Text style={styles.addButtonIcon}>+</Text>
          <Text style={styles.addButtonText}>
            {t('shared.paymentMethods.buttons.addCard')}
          </Text>
        </TouchableOpacity>
        */}

        {/* Info de seguridad */}
        <View style={styles.securityInfo}>
          <MaterialIcons name="lock-outline" size={20} color={colors.textSecondary} />
          <Text style={styles.securityText}>
            {t('shared.paymentMethods.security.message')}
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
    marginTop: 30,
    marginBottom: 24,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    width: 50,
    height: 50,
    borderRadius: 20,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },

  headerText: {
    flex: 1,
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
