import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  Image,
  Alert,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ExpoImagePicker from 'expo-image-picker';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import backendConfig from '../../config/backendConfig';
import alertService from '../../services/alertService';
import accountLinkingService from '../../services/auth/accountLinkingService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';
import supabaseStorage from '../../services/supabaseStorage';
import PhoneNumberModal, { type PhoneNumberModalResult } from '../../components/shared/PhoneNumberModal';
import LoadingOverlay from '../../components/ui/LoadingOverlay';
import {
  type CountryDialOption,
  getCountryDialOptions,
  formatPhoneNumber,
  extractLocalNumber,
} from '../../utils/phoneUtils';
import { useTranslation } from 'react-i18next';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccountProfileSection } from '../../components/shared/Account/AccountProfileSection';
import { AccountAddPasswordCard } from '../../components/shared/Account/AccountAddPasswordCard';
import { AccountLinkEmailCard } from '../../components/shared/Account/AccountLinkEmailCard';

const formatBirthDateInput = (value: string): string => {
  const digits = (value || '').replace(/\D/g, '').slice(0, 8);
  const segments: string[] = [];

  if (digits.length > 0) {
    segments.push(digits.slice(0, Math.min(2, digits.length)));
  }
  if (digits.length > 2) {
    segments.push(digits.slice(2, Math.min(4, digits.length)));
  }
  if (digits.length > 4) {
    segments.push(digits.slice(4, 8));
  }

  return segments.join('-');
};

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

type ProfileFormSnapshot = {
  name: string;
  birthDate: string;
  email: string;
  phone: string;
  photo: string;
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
  const insets = useSafeAreaInsets();
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
  const [birthDate, setBirthDate] = useState<string>(formatBirthDateInput(''));
  const [profileEmail, setProfileEmail] = useState<string>(user?.email || '');
  const [profilePhone, setProfilePhone] = useState<string>('');
  const [savingProfile, setSavingProfile] = useState<boolean>(false);
  const [phoneModalVisible, setPhoneModalVisible] = useState(false);
  const [phoneUpdating, setPhoneUpdating] = useState(false);
  const [profilePhoto, setProfilePhoto] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const initialSnapshotRef = useRef<ProfileFormSnapshot | null>(null);

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

  const styles = useMemo(
    () =>
      StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingBottom: 36,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 20,
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerSpacer: {
      width: 44,
      height: 44,
    },
    headerTitle: {
      flex: 1,
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    profileEditSection: {
      marginBottom: 16,
      backgroundColor: colors.card,
      borderRadius: 20,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      shadowColor: '#000',
      shadowOpacity: 0.08,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    avatarWrapper: {
      marginBottom: 20,
      position: 'relative',
      alignSelf: 'center',
    },
    avatarCircle: {
      width: 120,
      height: 120,
      borderRadius: 60,
      backgroundColor: colors.primary + '22',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.primary + '33',
    },
    avatarImage: {
      width: '100%',
      height: '100%',
      borderRadius: 58,
    },
    avatarInitial: {
      fontSize: 34,
      fontWeight: '800',
      color: colors.primary,
    },
    avatarEditButton: {
      position: 'absolute',
      right: 2,
      bottom: 2,
      width: 34,
      height: 34,
      borderRadius: 17,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 2,
      borderColor: colors.card,
      shadowColor: '#000',
      shadowOpacity: 0.18,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 3 },
      elevation: 4,
    },
    avatarEditIcon: {
      color: '#fff',
      fontSize: 15,
    },
    profileFormCard: {
      width: '100%',
      marginTop: 6,
    },
    profileCardTitle: {
      fontSize: 13,
      fontWeight: '700',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
      textAlign: 'center',
      color: colors.textSecondary,
      marginBottom: 10,
    },
    profileFieldLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
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
      minHeight: 50,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      paddingHorizontal: 15,
      paddingVertical: 12,
      color: colors.text,
      backgroundColor: colors.surface,
      marginBottom: 14,
      fontSize: 15,
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
      fontSize: 15,
      color: colors.textSecondary,
    },
    button: {
      minHeight: 52,
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingHorizontal: 16,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 4,
      shadowColor: colors.shadow,
      shadowOpacity: 0.12,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 3 },
      elevation: 3,
    },
    buttonDisabled: {
      opacity: 0.6,
    },
    buttonText: {
      fontSize: 16,
      fontWeight: '700',
      color: '#fff',
    },
      }),
    [colors],
  );

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

  const resolveProfilePhoto = (data: Record<string, any> | null | undefined): string | null => {
    if (!data) return null;
    return data.profilePhoto || data.profile_photo || data.photoURL || data.photoUrl || null;
  };

  const buildSnapshot = (data: {
    name?: string | null;
    birthDate?: string | null;
    email?: string | null;
    phone?: string | null;
    photo?: string | null;
  }): ProfileFormSnapshot => ({
    name: (data.name || '').trim(),
    birthDate: formatBirthDateInput(data.birthDate || ''),
    email: (data.email || '').trim().toLowerCase(),
    phone: (data.phone || '').trim(),
    photo: (data.photo || '').trim(),
  });

  const getCurrentSnapshot = (): ProfileFormSnapshot =>
    buildSnapshot({
      name: profileName,
      birthDate,
      email: profileEmail,
      phone: profilePhone,
      photo: profilePhoto,
    });

  const hasUnsavedChanges = (): boolean => {
    const initial = initialSnapshotRef.current;
    if (!initial) return false;
    const current = getCurrentSnapshot();
    return (
      current.name !== initial.name ||
      current.birthDate !== initial.birthDate ||
      current.email !== initial.email ||
      current.phone !== initial.phone ||
      current.photo !== initial.photo
    );
  };

  const handleBackPress = () => {
    if (!hasUnsavedChanges()) {
      navigation.goBack();
      return;
    }

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
        const nextName = profileData.name || user?.name || '';
        const nextBirthDate = formatBirthDateInput(profileData.birthDate || '');
        const nextEmail = profileData.email || user?.email || '';
        const nextPhone = profileData.phone || '';
        const nextPhoto = await supabaseStorage.resolveDocumentPhotoUrl(
          resolveProfilePhoto(profileData) || resolveProfilePhoto(user as any),
        );

        setProfile(profileData);
        setProfileName(nextName);
        setBirthDate(nextBirthDate);
        setProfileEmail(nextEmail);
        setProfilePhone(nextPhone);
        setProfilePhoto(nextPhoto);
        initialSnapshotRef.current = buildSnapshot({
          name: nextName,
          birthDate: nextBirthDate,
          email: nextEmail,
          phone: nextPhone,
          photo: nextPhoto,
        });
        setEmailForm((prev) => ({ ...prev, email: profileData.email || user?.email || prev.email }));
        setPhoneForm((prev) => ({ ...prev, phone: profileData.phone || prev.phone }));
      } else {
        const nextName = user?.name || '';
        const nextBirthDate = formatBirthDateInput('');
        const nextEmail = user?.email || '';
        const nextPhoto = await supabaseStorage.resolveDocumentPhotoUrl(resolveProfilePhoto(user as any));

        setProfileName(nextName);
        setBirthDate(nextBirthDate);
        setProfileEmail(nextEmail);
        setProfilePhone('');
        setProfilePhoto(nextPhoto);
        initialSnapshotRef.current = buildSnapshot({
          name: nextName,
          birthDate: nextBirthDate,
          email: nextEmail,
          phone: '',
          photo: nextPhoto,
        });
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
      initialSnapshotRef.current = buildSnapshot({
        name: data.name,
        birthDate: data.birthDate,
        email: data.email,
        phone: data.phone,
        photo: profilePhoto,
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

  const handlePickProfilePhoto = async () => {
    if (!user?.id) {
      return;
    }

    try {
      const { status } = await ExpoImagePicker.requestMediaLibraryPermissionsAsync();
      if (status !== 'granted') {
        alertService.showErrorAlert(t('shared.account.alerts.profileUpdateError'));
        return;
      }

      const result = await ExpoImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.8,
      });

      if (result.canceled || !result.assets?.[0]?.uri) {
        return;
      }

      setUploadingPhoto(true);

      const uploadedPhotoUrl = await supabaseStorage.uploadProfilePhoto(user.id, result.assets[0].uri);
      const displayPhotoUrl = await supabaseStorage.resolveDocumentPhotoUrl(uploadedPhotoUrl);
      setProfilePhoto(displayPhotoUrl);

      const photoPayload = {
        profilePhoto: uploadedPhotoUrl,
        profile_photo: uploadedPhotoUrl,
        photoURL: uploadedPhotoUrl,
      };

      if (isFirebaseBackend) {
        await syncFirestoreProfile({ profilePhoto: uploadedPhotoUrl });
      }

      await updateLocalUserCache(photoPayload);
      setProfile((prev: any) => ({ ...(prev || {}), ...photoPayload }));
      initialSnapshotRef.current = buildSnapshot({
        name: profileName,
        birthDate,
        email: profileEmail,
        phone: profilePhone,
        photo: displayPhotoUrl,
      });

      alertService.showSuccessAlert(
        t('shared.account.alerts.profileUpdatedTitle'),
        t('shared.account.alerts.profileUpdatedMessage'),
      );
    } catch (error) {
      console.error(' Error actualizando foto de perfil:', error);
      alertService.showErrorAlert(t('shared.account.alerts.profileUpdateError'));
    } finally {
      setUploadingPhoto(false);
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 24 },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Ionicons name="chevron-back" size={22} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>{t('shared.account.header.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>

        <AccountProfileSection
          profilePhoto={profilePhoto}
          profileName={profileName}
          birthDate={birthDate}
          profileEmail={profileEmail}
          profilePhone={profilePhone}
          displayPhone={displayPhone}
          uploadingPhoto={uploadingPhoto}
          savingProfile={savingProfile}
          isFirebaseBackend={isFirebaseBackend}
          profileLoading={profileLoading}
          providersLoading={providersState.loading}
          providersValues={providersState.values}
          providerLabels={providerLabels}
          accountError={accountError}
          userName={user?.name || ''}
          colors={colors}
          onPickProfilePhoto={handlePickProfilePhoto}
          onSetProfileName={setProfileName}
          onSetBirthDate={setBirthDate}
          onSetProfileEmail={setProfileEmail}
          onOpenPhoneModal={() => setPhoneModalVisible(true)}
          onSaveProfile={handleSaveProfile}
          formatBirthDateInput={formatBirthDateInput}
          buildProviderSummary={buildProviderSummary}
          styles={styles}
          t={t}
        />

        {hasGoogleProvider && !hasEmailPasswordProvider && (
          <AccountAddPasswordCard
            password={passwordForm.password}
            confirmPassword={passwordForm.confirmPassword}
            submitting={passwordForm.submitting}
            colors={colors}
            onSetPassword={(text) => setPasswordForm((prev) => ({ ...prev, password: text }))}
            onSetConfirmPassword={(text) => setPasswordForm((prev) => ({ ...prev, confirmPassword: text }))}
            onSubmit={handleCreatePasswordForGoogle}
            styles={styles}
            t={t}
          />
        )}

        {hasPhoneProvider && !hasEmailPasswordProvider && (
          <AccountLinkEmailCard
            email={emailForm.email}
            password={emailForm.password}
            confirmPassword={emailForm.confirmPassword}
            submitting={emailForm.submitting}
            colors={colors}
            onSetEmail={(text) => setEmailForm((prev) => ({ ...prev, email: text }))}
            onSetPassword={(text) => setEmailForm((prev) => ({ ...prev, password: text }))}
            onSetConfirmPassword={(text) => setEmailForm((prev) => ({ ...prev, confirmPassword: text }))}
            onSubmit={handleLinkEmailForPhoneAccount}
            styles={styles}
            t={t}
          />
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

