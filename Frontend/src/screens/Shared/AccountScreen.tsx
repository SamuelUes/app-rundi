import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Image,
  Alert,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import backendConfig from '../../config/backendConfig';
import alertService from '../../services/alertService';
import accountLinkingService from '../../services/auth/accountLinkingService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import PhoneNumberModal, { type PhoneNumberModalResult } from '../../components/PhoneNumberModal';
import LoadingOverlay from '../../components/LoadingOverlay';
import {
  type CountryDialOption,
  getCountryDialOptions,
  formatPhoneNumber,
  extractLocalNumber,
} from '../../utils/phoneUtils';
import { useTranslation } from 'react-i18next';

const BACK_BUTTON_ICON = require('../../assets/icons/back_button/back_button.png');

type ProvidersState = {
  values: string[];
  loading: boolean;
};

type EmailFormState = {
  email: string;
  password: string;
  confirmPassword: string;
  submitting: boolean;
};

type PasswordFormState = {
  password: string;
  confirmPassword: string;
  submitting: boolean;
};

type PhoneFormState = {
  phone: string;
  code: string;
  codeSent: boolean;
  sendingCode: boolean;
  confirming: boolean;
};

const buildProviderSummary = (
  providers: string[],
  providerLabels: Record<string, string>,
  emptyLabel: string,
) => {
  if (!providers.length) {
    return emptyLabel;
  }
  return providers
    .map((provider) => providerLabels[provider] || provider)
    .join(' + ');
};

const buildAuthProviderField = (providers: string[]) => {
  if (!providers.length) {
    return 'desconocido';
  }
  return providers
    .map((provider) => {
      if (provider === 'google.com') return 'google';
      if (provider === 'password') return 'email/password';
      if (provider === 'phone') return 'phone';
      return provider;
    })
    .join('+');
};

export default function AccountScreen({ navigation }: any) {
  const { colors } = useTheme();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [profile, setProfile] = useState<any | null>(null);
  const [profileLoading, setProfileLoading] = useState<boolean>(true);
  const [providersState, setProvidersState] = useState<ProvidersState>({ values: [], loading: true });
  const [emailForm, setEmailForm] = useState<EmailFormState>({
    email: user?.email || '',
    password: '',
    confirmPassword: '',
    submitting: false,
  });
  const [passwordForm, setPasswordForm] = useState<PasswordFormState>({
    password: '',
    confirmPassword: '',
    submitting: false,
  });
  const [phoneForm, setPhoneForm] = useState<PhoneFormState>({
    phone: '',
    code: '',
    codeSent: false,
    sendingCode: false,
    confirming: false,
  });
  const [accountError, setAccountError] = useState<string | null>(null);
  const [profileName, setProfileName] = useState<string>(user?.name || '');
  const [birthDate, setBirthDate] = useState<string>('');
  const [profileEmail, setProfileEmail] = useState<string>(user?.email || '');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneUpdating, setPhoneUpdating] = useState(false);

  const countryOptions = useMemo(() => getCountryDialOptions(), []);
  const defaultCountry = useMemo(
    () => countryOptions.find((option) => option.code === 'NI') ?? countryOptions[0],
    [countryOptions],
  );

  const currentPhoneCountry = useMemo<CountryDialOption>(() => {
    if (!profilePhone) return defaultCountry;
    const match = countryOptions.find((option) => profilePhone.startsWith(option.dialCode));
    return match ?? defaultCountry;
  }, [profilePhone, countryOptions, defaultCountry]);

  const currentPhoneDigits = useMemo(() => {
    if (!profilePhone) return '';
    return extractLocalNumber(profilePhone, currentPhoneCountry.dialCode);
  }, [profilePhone, currentPhoneCountry]);

  const displayPhone = useMemo(() => {
    if (!profilePhone) return '';
    return formatPhoneNumber(profilePhone, currentPhoneCountry.dialCode);
  }, [profilePhone, currentPhoneCountry]);

  const isFirebaseBackend = backendConfig.isFirebase();

  const hasGoogleProvider = useMemo(
    () => providersState.values.includes('google.com'),
    [providersState.values],
  );
  const hasEmailPasswordProvider = useMemo(
    () => providersState.values.includes('password'),
    [providersState.values],
  );
  const hasPhoneProvider = useMemo(
    () => providersState.values.includes('phone'),
    [providersState.values],
  );

  const providerLabels = useMemo<Record<string, string>>(
    () => ({
      'google.com': t('shared.account.providers.google'),
      password: t('shared.account.providers.password'),
      phone: t('shared.account.providers.phone'),
    }),
    [t],
  );

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingVertical: 32,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingTop: 26,
      marginBottom: 26,
    },
    backButton: {
      paddingRight: 8,
      paddingVertical: 4,
    },
    backIcon: {
      width: 28,
      height: 28,
      tintColor: colors.text,
      resizeMode: 'contain',
    },
    headerTitle: {
      fontSize: 20,
      fontWeight: '700',
      color: colors.text,
      marginLeft: 4,
    },
    profileEditSection: {
      alignItems: 'center',
      marginBottom: 24,
    },
    avatarWrapper: {
      marginBottom: 16,
      position: 'relative',
    },
    avatarCircle: {
      width: 116,
      height: 116,
      borderRadius: 58,
      backgroundColor: colors.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitial: {
      fontSize: 32,
      fontWeight: '700',
      color: '#fff',
    },
    avatarEditButton: {
      position: 'absolute',
      right: -2,
      bottom: -2,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarEditIcon: {
      color: '#fff',
      fontSize: 14,
    },
    profileFormCard: {
      width: '100%',
      marginTop: 8,
    },
    accountCard: {
      marginBottom: 16,
      padding: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    accountTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
    },
    accountDescription: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
      lineHeight: 18,
    },
    helperText: {
      fontSize: 12,
      color: colors.textSecondary,
      marginTop: 8,
    },
    accountSummarySection: {
      marginTop: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      paddingTop: 12,
    },
    infoLabel: {
      fontSize: 12,
      color: colors.textSecondary,
      textTransform: 'uppercase',
      letterSpacing: 0.3,
      marginBottom: 2,
    },
    infoText: {
      fontSize: 14,
      color: colors.text,
      marginBottom: 4,
    },
    badgeRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginTop: 8,
    },
    badge: {
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 999,
      backgroundColor: colors.primary + '22',
      marginRight: 6,
      marginBottom: 6,
    },
    badgeText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      paddingHorizontal: 14,
      paddingVertical: 12,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 12,
      fontSize: 14,
    },
    phoneButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    phoneValue: {
      fontSize: 14,
      color: colors.text,
    },
    phonePlaceholder: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    button: {
      backgroundColor: 'rgba(202, 151, 57, 1)',
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 15,
      fontWeight: '600',
      color: '#fff',
    },
  });

  const updateLocalUserCache = async (data: Record<string, any>) => {
    try {
      const stored = await AsyncStorage.getItem('user');
      if (!stored) return;
      const parsed = JSON.parse(stored);
      await AsyncStorage.setItem('user', JSON.stringify({ ...parsed, ...data }));
    } catch (error) {
      console.warn('⚠️ No se pudo actualizar caché local del usuario:', error);
    }
  };

  const syncFirestoreProfile = async (data: Record<string, any>) => {
    if (!user?.id) return;
    try {
      await firebaseAuthService.updateUserProfile(user.id, data);
    } catch (error) {
      console.error('❌ Error actualizando perfil en Firestore:', error);
      throw error;
    }
  };

  const refreshAccountData = async () => {
    if (!isFirebaseBackend || !user?.id) {
      setProfileLoading(false);
      setProvidersState((prev) => ({ ...prev, loading: false }));
      return;
    }

    setAccountError(null);
    setProfileLoading(true);
    setProvidersState((prev) => ({ ...prev, loading: true }));

    try {
      const [profileData, providers] = await Promise.all([
        firebaseAuthService.getUserProfile(user.id).catch((error) => {
          console.error('❌ Error cargando perfil:', error);
          setAccountError(t('shared.account.alerts.accountLoadError'));
          return null;
        }),
        accountLinkingService.getLinkedProviders().catch((error) => {
          console.error('❌ Error obteniendo proveedores vinculados:', error);
          setAccountError(t('shared.account.alerts.providersLoadError'));
          return [] as string[];
        }),
      ]);

      if (profileData) {
        setProfile(profileData);
        setProfileName(profileData.name || user?.name || '');
        setBirthDate(profileData.birthDate || '');
        setProfileEmail(profileData.email || user?.email || '');
        setProfilePhone(profileData.phone || '');
        setEmailForm((prev) => ({ ...prev, email: profileData.email || user?.email || prev.email }));
        setPhoneForm((prev) => ({ ...prev, phone: profileData.phone || prev.phone }));
      }

      if (providers) {
        setProvidersState({ values: providers, loading: false });
      } else {
        setProvidersState((prev) => ({ ...prev, loading: false }));
      }
    } finally {
      setProfileLoading(false);
    }
  };

  useEffect(() => {
    refreshAccountData();
  }, [user?.id]);

  const handleLinkEmailForPhoneAccount = async () => {
    if (!emailForm.email) {
      alertService.showErrorAlert(t('shared.account.alerts.emailRequired'));
      return;
    }
    if (!emailForm.password) {
      alertService.showErrorAlert(t('shared.account.alerts.passwordRequired'));
      return;
    }
    if (emailForm.password !== emailForm.confirmPassword) {
      alertService.showErrorAlert(t('shared.account.alerts.passwordMismatch'));
      return;
    }

    setEmailForm((prev) => ({ ...prev, submitting: true }));

    try {
      const result = await accountLinkingService.linkEmailAndPassword(emailForm.email, emailForm.password);
      const providers = await accountLinkingService.getLinkedProviders();
      const authProviderLabel = buildAuthProviderField(providers);

      await syncFirestoreProfile({ email: result.email, authProvider: authProviderLabel, method: authProviderLabel });
      await updateLocalUserCache({ email: result.email });

      alertService.showSuccessAlert(
        t('shared.account.alerts.linkEmailSuccessTitle'),
        t('shared.account.alerts.linkEmailSuccessMessage'),
      );
      setProvidersState({ values: providers, loading: false });
      await refreshAccountData();
    } catch (error: any) {
      console.error('❌ Error vinculando correo:', error);
      const message = error?.message || t('shared.account.alerts.linkEmailError');
      alertService.showErrorAlert(message);
    } finally {
      setEmailForm((prev) => ({ ...prev, submitting: false, password: '', confirmPassword: '' }));
    }
  };

  const handleCreatePasswordForGoogle = async () => {
    if (!user?.email) {
      alertService.showErrorAlert(t('shared.account.alerts.googleEmailMissing'));
      return;
    }
    if (!passwordForm.password) {
      alertService.showErrorAlert(t('shared.account.alerts.passwordRequired'));
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      alertService.showErrorAlert(t('shared.account.alerts.passwordMismatch'));
      return;
    }

    setPasswordForm((prev) => ({ ...prev, submitting: true }));

    try {
      await accountLinkingService.linkEmailAndPassword(user.email, passwordForm.password);
      const providers = await accountLinkingService.getLinkedProviders();
      const authProviderLabel = buildAuthProviderField(providers);

      await syncFirestoreProfile({ authProvider: authProviderLabel, method: authProviderLabel });

      alertService.showSuccessAlert(
        t('shared.account.alerts.createPasswordSuccessTitle'),
        t('shared.account.alerts.createPasswordSuccessMessage'),
      );
      setProvidersState({ values: providers, loading: false });
    } catch (error: any) {
      console.error('❌ Error creando contraseña:', error);
      const message = error?.message || t('shared.account.alerts.createPasswordError');
      alertService.showErrorAlert(message);
    } finally {
      setPasswordForm({ password: '', confirmPassword: '', submitting: false });
    }
  };

  const handlePhoneModalConfirm = async ({ normalizedPhone }: PhoneNumberModalResult) => {
    if (!user?.id) {
      setPhoneModalVisible(false);
      return;
    }

    try {
      console.log('[AccountScreen] handlePhoneModalConfirm', {
        normalizedPhone,
        isFirebaseBackend,
        userId: user.id,
      });
      setPhoneUpdating(true);
      setPhoneModalVisible(false);

      if (!normalizedPhone) {
        setProfilePhone('');

        if (isFirebaseBackend) {
          await syncFirestoreProfile({ phone: '' });
        }

        await updateLocalUserCache({ phone: '' });
        alertService.showSuccessAlert(
          t('shared.account.phone.removedTitle'),
          t('shared.account.phone.removedMessage'),
        );
        await refreshAccountData();
        return;
      }

      if (isFirebaseBackend) {
        try {
          const availability = await firebaseAuthService.checkUserExists({ phone: normalizedPhone });
          console.log('[AccountScreen] Phone availability check (add_phone)', availability);
          if (availability.phoneExists) {
            alertService.showErrorAlert(t('shared.account.phone.duplicateError'));
            return;
          }
        } catch (availabilityError: any) {
          console.error('⚠️ Error validando disponibilidad de teléfono antes de enviar SMS:', availabilityError);
          alertService.showErrorAlert(
            availabilityError?.message || t('shared.account.phone.availabilityError'),
          );
          return;
        }
      }

      setProfilePhone(normalizedPhone);

      if (!isFirebaseBackend) {
        console.log('[AccountScreen] Phone modal confirm - non Firebase backend, no SMS flow');
        await updateLocalUserCache({ phone: normalizedPhone });
        alertService.showSuccessAlert(
          t('shared.account.phone.updatedTitle'),
          t('shared.account.phone.updatedMessage'),
        );
        await refreshAccountData();
        return;
      }

      console.log('[AccountScreen] Phone modal confirm - Firebase backend, sending SMS & navigating');
      await accountLinkingService.sendPhoneLinkCode(normalizedPhone);

      alertService.showSuccessAlert(
        t('shared.account.phone.codeSentTitle'),
        t('shared.account.phone.codeSentMessage'),
      );

      const effectiveName = profileName.trim() || user.name;
      const effectiveEmail = profileEmail.trim() || user.email;
      const role: 'client' | 'driver' =
        user.role === 'driver' || user.role === 'designated_driver' ? 'driver' : 'client';

      navigation.navigate('PhoneVerification', {
        name: effectiveName,
        email: effectiveEmail,
        phone: normalizedPhone,
        password: undefined,
        role,
        method: 'phone',
        authProvider: 'phone',
        googleIdToken: undefined,
        phoneVerified: false,
        context: 'add_phone',
      });
    } catch (error) {
      console.error('❌ Error actualizando teléfono desde modal:', error);
      alertService.showErrorAlert(t('shared.account.phone.startVerificationError'));
    } finally {
      setPhoneUpdating(false);
    }
  };

  const handleSaveProfile = async () => {
    if (!user?.id) {
      return;
    }

    const data: Record<string, any> = {
      name: profileName.trim() || user.name,
      email: profileEmail.trim() || user.email,
      phone: profilePhone.trim(),
      birthDate: birthDate.trim(),
    };

    try {
      setSavingProfile(true);
      if (isFirebaseBackend) {
        await syncFirestoreProfile(data);
      }
      await updateLocalUserCache({
        name: data.name,
        email: data.email,
        phone: data.phone,
      });
      alertService.showSuccessAlert(
        t('shared.account.alerts.profileUpdatedTitle'),
        t('shared.account.alerts.profileUpdatedMessage'),
      );
      await refreshAccountData();
    } catch (error) {
      console.error('❌ Error actualizando perfil básico:', error);
      alertService.showErrorAlert(t('shared.account.alerts.profileUpdateError'));
    } finally {
      setSavingProfile(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              Alert.alert(
                t('shared.account.header.discardTitle'),
                t('shared.account.header.discardMessage'),
                [
                  { text: t('shared.account.header.discardCancel'), style: 'cancel' },
                  {
                    text: t('shared.account.header.discardExit'),
                    style: 'destructive',
                    onPress: () => navigation.goBack(),
                  },
                ],
              );
            }}
          >
            <Image source={BACK_BUTTON_ICON} style={styles.backIcon} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('shared.account.header.title')}</Text>
        </View>

        <View style={styles.profileEditSection}>
          <View style={styles.avatarWrapper}>
            <View style={styles.avatarCircle}>
              <Text style={styles.avatarInitial}>
                {user?.name ? user.name.charAt(0).toUpperCase() : '?'}
              </Text>
            </View>
            <TouchableOpacity
              style={styles.avatarEditButton}
              onPress={() => {
                Alert.alert(
                  t('shared.account.profile.avatarTitle'),
                  t('shared.account.profile.avatarMessage'),
                );
              }}
            >
              <Text style={styles.avatarEditIcon}>✏️</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.profileFormCard}>
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.profile.namePlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={profileName}
              onChangeText={setProfileName}
            />
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.profile.birthPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={birthDate}
              onChangeText={setBirthDate}
              keyboardType="numeric"
            />
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.profile.emailPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={profileEmail}
              onChangeText={setProfileEmail}
            />
            <TouchableOpacity
              style={[styles.input, styles.phoneButton]}
              onPress={() => setPhoneModalVisible(true)}
              disabled={phoneUpdating}
            >
              <Text
                style={profilePhone ? styles.phoneValue : styles.phonePlaceholder}
                numberOfLines={1}
              >
                {profilePhone ? displayPhone : t('shared.account.profile.phonePlaceholder')}
              </Text>
            </TouchableOpacity>

            {isFirebaseBackend && (
              <View style={styles.accountSummarySection}>
                <Text style={styles.infoLabel}>{t('shared.account.providers.title')}</Text>
                {profileLoading || providersState.loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.infoText}>
                    {buildProviderSummary(
                      providersState.values,
                      providerLabels,
                      t('shared.account.providers.none'),
                    )}
                  </Text>
                )}

                {!!accountError && (
                  <Text style={[styles.helperText, { color: colors.error }]}>{accountError}</Text>
                )}

                {!providersState.loading && providersState.values.length > 0 && (
                  <View style={styles.badgeRow}>
                    {providersState.values.map((provider) => (
                      <View key={provider} style={styles.badge}>
                        <Text style={styles.badgeText}>{providerLabels[provider] || provider}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}

            <TouchableOpacity
              style={[styles.button, savingProfile && styles.buttonDisabled]}
              disabled={savingProfile}
              onPress={handleSaveProfile}
            >
              {savingProfile ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('shared.account.profile.saveButton')}</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>

        {hasGoogleProvider && !hasEmailPasswordProvider && (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>{t('shared.account.cards.addPassword.title')}</Text>
            <Text style={styles.accountDescription}>
              {t('shared.account.cards.addPassword.description')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.cards.addPassword.newPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={passwordForm.password}
              onChangeText={(text) => setPasswordForm((prev) => ({ ...prev, password: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.cards.addPassword.confirmPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={passwordForm.confirmPassword}
              onChangeText={(text) => setPasswordForm((prev) => ({ ...prev, confirmPassword: text }))}
            />
            <TouchableOpacity
              style={[styles.button, passwordForm.submitting && styles.buttonDisabled]}
              disabled={passwordForm.submitting}
              onPress={handleCreatePasswordForGoogle}
            >
              {passwordForm.submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('shared.account.cards.addPassword.button')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {hasPhoneProvider && !hasEmailPasswordProvider && (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>{t('shared.account.cards.linkEmail.title')}</Text>
            <Text style={styles.accountDescription}>
              {t('shared.account.cards.linkEmail.description')}
            </Text>
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.cards.linkEmail.emailPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={emailForm.email}
              onChangeText={(text) => setEmailForm((prev) => ({ ...prev, email: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.cards.linkEmail.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={emailForm.password}
              onChangeText={(text) => setEmailForm((prev) => ({ ...prev, password: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder={t('shared.account.cards.linkEmail.confirmPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={emailForm.confirmPassword}
              onChangeText={(text) => setEmailForm((prev) => ({ ...prev, confirmPassword: text }))}
            />
            <TouchableOpacity
              style={[styles.button, emailForm.submitting && styles.buttonDisabled]}
              disabled={emailForm.submitting}
              onPress={handleLinkEmailForPhoneAccount}
            >
              {emailForm.submitting ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.buttonText}>{t('shared.account.cards.linkEmail.button')}</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        <PhoneNumberModal
          visible={phoneModalVisible}
          onClose={() => !phoneUpdating && setPhoneModalVisible(false)}
          onConfirm={handlePhoneModalConfirm}
          countryOptions={countryOptions}
          initialCountry={currentPhoneCountry}
          initialDigits={currentPhoneDigits}
          loading={phoneUpdating}
        />

        <LoadingOverlay
          visible={phoneUpdating}
          message={t('shared.account.phone.loading')}
        />
      </ScrollView>
    </View>
  );
}
