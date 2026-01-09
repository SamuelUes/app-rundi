import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  Alert,
  ActivityIndicator,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import cardsService from '../../services/cardsService';
import { useTranslation } from 'react-i18next';

interface AddCardScreenProps {
  navigation: any;
}

export default function AddCardScreen({ navigation }: AddCardScreenProps) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { t } = useTranslation();
  
  // Estados del formulario
  const [cardNumber, setCardNumber] = useState('');
  const [cardHolder, setCardHolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [selectedBank, setSelectedBank] = useState<'bac' | 'banpro' | 'lafise' | 'ficohsa' | 'avanz'>('bac');
  const [setAsDefault, setSetAsDefault] = useState(false);
  const [processing, setProcessing] = useState(false);

  // Formatear número de tarjeta (#### #### #### ####)
  const formatCardNumber = (text: string) => {
    const cleaned = text.replace(/\s/g, '');
    const formatted = cleaned.match(/.{1,4}/g)?.join(' ') || cleaned;
    return formatted;
  };

  // Formatear fecha de expiración (MM/YY)
  const formatExpiry = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length >= 2) {
      return cleaned.slice(0, 2) + '/' + cleaned.slice(2, 4);
    }
    return cleaned;
  };

  // Detectar tipo de tarjeta
  const detectCardBrand = (number: string): string => {
    const cleaned = number.replace(/\s/g, '');
    
    if (/^4/.test(cleaned)) return 'Visa';
    if (/^5[1-5]/.test(cleaned)) return 'Mastercard';
    if (/^3[47]/.test(cleaned)) return 'American Express';
    if (/^6(?:011|5)/.test(cleaned)) return 'Discover';
    
    return 'Unknown';
  };

  // Validar número de tarjeta (Algoritmo de Luhn)
  const validateCardNumber = (number: string): boolean => {
    const cleaned = number.replace(/\s/g, '');
    
    if (!/^\d{13,19}$/.test(cleaned)) return false;

    let sum = 0;
    let isEven = false;

    for (let i = cleaned.length - 1; i >= 0; i--) {
      let digit = parseInt(cleaned[i]);

      if (isEven) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }

      sum += digit;
      isEven = !isEven;
    }

    return sum % 10 === 0;
  };

  // Validar fecha de expiración
  const validateExpiry = (expiryText: string): boolean => {
    const [month, year] = expiryText.split('/');
    
    if (!month || !year) return false;
    
    const monthNum = parseInt(month);
    const yearNum = parseInt('20' + year);
    
    if (monthNum < 1 || monthNum > 12) return false;
    
    const now = new Date();
    const currentYear = now.getFullYear();
    const currentMonth = now.getMonth() + 1;
    
    if (yearNum < currentYear) return false;
    if (yearNum === currentYear && monthNum < currentMonth) return false;
    
    return true;
  };

  // Validar CVV
  const validateCVV = (cvvText: string): boolean => {
    const brand = detectCardBrand(cardNumber);
    const expectedLength = brand === 'American Express' ? 4 : 3;
    return cvvText.length === expectedLength && /^\d+$/.test(cvvText);
  };

  // Manejar cambio de número de tarjeta
  const handleCardNumberChange = (text: string) => {
    const cleaned = text.replace(/\s/g, '');
    if (cleaned.length <= 19) {
      setCardNumber(formatCardNumber(cleaned));
    }
  };

  // Manejar cambio de fecha de expiración
  const handleExpiryChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    if (cleaned.length <= 4) {
      setExpiry(formatExpiry(cleaned));
    }
  };

  // Manejar cambio de CVV
  const handleCVVChange = (text: string) => {
    const cleaned = text.replace(/\D/g, '');
    const brand = detectCardBrand(cardNumber);
    const maxLength = brand === 'American Express' ? 4 : 3;
    if (cleaned.length <= maxLength) {
      setCvv(cleaned);
    }
  };

  // Agregar tarjeta
  const handleAddCard = async () => {
    // Validaciones
    if (!cardNumber || !cardHolder || !expiry || !cvv) {
      Alert.alert(
        t('shared.addCards.alerts.errorTitle'),
        t('shared.addCards.alerts.incomplete'),
      );
      return;
    }

    if (!validateCardNumber(cardNumber)) {
      Alert.alert(
        t('shared.addCards.alerts.errorTitle'),
        t('shared.addCards.alerts.invalidNumber'),
      );
      return;
    }

    if (!validateExpiry(expiry)) {
      Alert.alert(
        t('shared.addCards.alerts.errorTitle'),
        t('shared.addCards.alerts.invalidExpiry'),
      );
      return;
    }

    if (!validateCVV(cvv)) {
      Alert.alert(
        t('shared.addCards.alerts.errorTitle'),
        t('shared.addCards.alerts.invalidCvv'),
      );
      return;
    }

    try {
      setProcessing(true);

      const [month, year] = expiry.split('/');
      const cleanedNumber = cardNumber.replace(/\s/g, '');
      const fullYear = year.length === 2 ? `20${year}` : year;
      const brand = detectCardBrand(cardNumber);

      console.log('💳 Validación local completada, guardando tarjeta...');

      await cardsService.addCard({
        bank: selectedBank,
        cardBrand: brand,
        last4: cleanedNumber.slice(-4),
        expMonth: Number(month),
        expYear: Number(fullYear),
        setAsDefault,
      });

      Alert.alert(
        t('shared.addCards.alerts.successTitle'),
        t('shared.addCards.alerts.successMessage'),
        [
          {
            text: t('shared.addCards.alerts.successButton'),
            onPress: () => navigation.goBack(),
          },
        ]
      );
    } catch (error: any) {
      console.error('Error adding card:', error);
      Alert.alert(
        t('shared.addCards.alerts.errorTitle'),
        error.message || t('shared.addCards.alerts.genericError'),
      );
    } finally {
      setProcessing(false);
    }
  };

  const cardBrand = detectCardBrand(cardNumber);

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Text style={styles.backButtonText}>←</Text>
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('shared.addCards.header.title')}</Text>
          <View style={{ width: 40 }} />
        </View>

        {/* Formulario */}
        <View style={styles.form}>
          <Text style={styles.formTitle}>{t('shared.addCards.form.title')}</Text>

          {/* Número de tarjeta */}
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder={t('shared.addCards.form.cardNumber')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="numeric"
              value={cardNumber}
              onChangeText={handleCardNumberChange}
              maxLength={19}
            />
          </View>

          {/* Expiración y CVV en la misma fila */}
          <View style={styles.inputRow}>
            <View style={[styles.inputGroup, { flex: 1, marginRight: 8 }]}>
              <TextInput
                style={styles.input}
                placeholder={t('shared.addCards.form.expiry')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={expiry}
                onChangeText={handleExpiryChange}
                maxLength={5}
              />
            </View>

            <View style={[styles.inputGroup, { flex: 1, marginLeft: 8 }]}>
              <TextInput
                style={styles.input}
                placeholder={t('shared.addCards.form.cvv')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="numeric"
                value={cvv}
                onChangeText={handleCVVChange}
                maxLength={cardBrand === 'American Express' ? 4 : 3}
                secureTextEntry
              />
            </View>
          </View>

          {/* Nombre del titular */}
          <View style={styles.inputGroup}>
            <TextInput
              style={styles.input}
              placeholder={t('shared.addCards.form.cardHolder')}
              placeholderTextColor={colors.textSecondary}
              value={cardHolder}
              onChangeText={setCardHolder}
              autoCapitalize="characters"
            />
          </View>

          {/* Selector de Banco */}
          <View style={styles.bankSelectorContainer}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>
              {t('shared.addCards.form.bankSelector')}
            </Text>
            <View style={styles.bankButtonsRow}>
              {(['bac', 'banpro', 'lafise', 'ficohsa', 'avanz'] as const).map((bank) => (
                <TouchableOpacity
                  key={bank}
                  style={[
                    styles.bankButton,
                    selectedBank === bank && styles.bankButtonActive,
                    { backgroundColor: selectedBank === bank ? colors.primary : colors.surface }
                  ]}
                  onPress={() => setSelectedBank(bank)}
                >
                  <Text style={[
                    styles.bankButtonText,
                    { color: selectedBank === bank ? '#FFF' : colors.text }
                  ]}>
                    {bank.toUpperCase()}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {/* Checkbox para tarjeta predeterminada */}
          <TouchableOpacity
            style={styles.checkboxContainer}
            onPress={() => setSetAsDefault(!setAsDefault)}
          >
            <View style={[styles.checkbox, setAsDefault && styles.checkboxActive]}>
              {setAsDefault && <Text style={styles.checkboxCheck}>✓</Text>}
            </View>
            <Text style={styles.checkboxLabel}>
              {t('shared.addCards.form.checkbox')}
            </Text>
          </TouchableOpacity>

          {/* Botones Cancelar y Guardar */}
          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              disabled={processing}
            >
              <Text style={styles.cancelButtonText}>{t('shared.addCards.form.cancel')}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, processing && styles.saveButtonDisabled]}
              onPress={handleAddCard}
              disabled={processing}
            >
              {processing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.saveButtonText}>{t('shared.addCards.form.save')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Info de seguridad */}
        <View style={styles.securityInfo}>
          <Text style={styles.securityIcon}>🔒</Text>
          <Text style={styles.securityText}>
            {t('shared.addCards.security.message')}
          </Text>
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  scrollView: {
    flex: 1,
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
  cardPreview: {
    padding: 24,
    alignItems: 'center',
  },
  card: {
    width: '100%',
    height: 200,
    backgroundColor: '#667eea',
    borderRadius: 16,
    padding: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 16,
    elevation: 8,
  },
  cardChip: {
    width: 50,
    height: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  cardChipText: {
    fontSize: 24,
  },
  cardNumberPreview: {
    fontSize: 22,
    fontWeight: '600',
    color: '#fff',
    letterSpacing: 2,
    marginBottom: 24,
  },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  cardLabel: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.7)',
    marginBottom: 4,
  },
  cardHolderPreview: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cardExpiryPreview: {
    fontSize: 14,
    fontWeight: '600',
    color: '#fff',
  },
  cardBrandContainer: {
    alignItems: 'flex-end',
  },
  cardBrandText: {
    fontSize: 16,
    fontWeight: '700',
    color: '#fff',
  },
  providerSelector: {
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 12,
  },
  providerButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  providerButton: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  providerButtonActive: {
    borderColor: '#2196F3',
    backgroundColor: '#E3F2FD',
  },
  providerIcon: {
    fontSize: 32,
    marginBottom: 8,
  },
  providerText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  providerTextActive: {
    color: '#2196F3',
  },
  providerSubtext: {
    fontSize: 12,
    color: colors.textSecondary,
  },
  form: {
    padding: 24,
    backgroundColor: colors.card,
    margin: 16,
    borderRadius: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
    marginBottom: 20,
  },
  inputGroup: {
    marginBottom: 16,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: 16,
    fontSize: 16,
    color: colors.text,
    borderWidth: 1,
    borderColor: colors.border,
  },
  inputRow: {
    flexDirection: 'row',
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  checkbox: {
    width: 24,
    height: 24,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: colors.border,
    marginRight: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxActive: {
    backgroundColor: '#4CAF50',
    borderColor: '#4CAF50',
  },
  checkboxCheck: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '700',
  },
  checkboxLabel: {
    fontSize: 14,
    color: colors.text,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
  },
  cancelButton: {
    flex: 1,
    backgroundColor: colors.card,
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
  },
  cancelButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: colors.text,
  },
  saveButton: {
    flex: 1,
    backgroundColor: '#000',
    padding: 18,
    borderRadius: 12,
    alignItems: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.5,
  },
  saveButtonText: {
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
  bankSelectorContainer: {
    marginVertical: 16,
  },
  bankButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bankButton: {
    flex: 1,
    minWidth: '30%',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: colors.border,
    alignItems: 'center',
  },
  bankButtonActive: {
    borderColor: colors.primary,
  },
  bankButtonText: {
    fontSize: 12,
    fontWeight: '600',
  },
});
