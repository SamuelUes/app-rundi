import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import backendConfig from '../../config/backendConfig';
import alertService from '../../services/alertService';
import accountLinkingService from '../../services/auth/accountLinkingService';
import firebaseAuthService from '../../services/auth/firebaseAuthService';

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

const PROVIDER_LABELS: Record<string, string> = {
  'google.com': 'Google',
  password: 'Correo/Contraseña',
  phone: 'Teléfono',
};

const buildProviderSummary = (providers: string[]) => {
  if (!providers.length) {
    return 'No vinculado';
  }
  return providers
    .map((provider) => PROVIDER_LABELS[provider] || provider)
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

export default function AccountScreen() {
  const { colors } = useTheme();
  const { user } = useAuth();

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

  const isFirebaseBackend = backendConfig.isFirebase();

  const hasGoogleProvider = useMemo(() => providersState.values.includes('google.com'), [providersState.values]);
  const hasEmailPasswordProvider = useMemo(() => providersState.values.includes('password'), [providersState.values]);
  const hasPhoneProvider = useMemo(() => providersState.values.includes('phone'), [providersState.values]);

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingHorizontal: 20,
      paddingVertical: 24,
    },
    header: {
      marginBottom: 16,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
    },
    headerSubtitle: {
      marginTop: 4,
      color: colors.textSecondary,
      fontSize: 14,
    },
    helperText: {
      fontSize: 12,
      color: colors.textSecondary,
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
    button: {
      backgroundColor: colors.primary,
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
          setAccountError('No se pudo cargar el perfil');
          return null;
        }),
        accountLinkingService.getLinkedProviders().catch((error) => {
          console.error('❌ Error obteniendo proveedores vinculados:', error);
          setAccountError('No se pudo obtener la configuración de autenticación');
          return [] as string[];
        }),
      ]);

      if (profileData) {
        setProfile(profileData);
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
      alertService.showErrorAlert('Debes ingresar un correo electrónico válido.');
      return;
    }
    if (!emailForm.password) {
      alertService.showErrorAlert('Ingresa una contraseña para vincular tu cuenta.');
      return;
    }
    if (emailForm.password !== emailForm.confirmPassword) {
      alertService.showErrorAlert('Asegúrate de que ambas contraseñas sean iguales.');
      return;
    }

    setEmailForm((prev) => ({ ...prev, submitting: true }));

    try {
      const result = await accountLinkingService.linkEmailAndPassword(emailForm.email, emailForm.password);
      const providers = await accountLinkingService.getLinkedProviders();
      const authProviderLabel = buildAuthProviderField(providers);

      await syncFirestoreProfile({ email: result.email, authProvider: authProviderLabel, method: authProviderLabel });
      await updateLocalUserCache({ email: result.email });

      alertService.showSuccessAlert('Correo vinculado', 'Tu cuenta ahora tiene acceso por correo y contraseña.');
      setProvidersState({ values: providers, loading: false });
      await refreshAccountData();
    } catch (error: any) {
      console.error('❌ Error vinculando correo:', error);
      const message = error?.message || 'No se pudo vincular el correo. Intenta nuevamente.';
      alertService.showErrorAlert(message);
    } finally {
      setEmailForm((prev) => ({ ...prev, submitting: false, password: '', confirmPassword: '' }));
    }
  };

  const handleCreatePasswordForGoogle = async () => {
    if (!user?.email) {
      alertService.showErrorAlert('Tu cuenta de Google no tiene un correo asociado.');
      return;
    }
    if (!passwordForm.password) {
      alertService.showErrorAlert('Ingresa una contraseña para agregar acceso por correo.');
      return;
    }
    if (passwordForm.password !== passwordForm.confirmPassword) {
      alertService.showErrorAlert('Asegúrate de que ambas contraseñas sean iguales.');
      return;
    }

    setPasswordForm((prev) => ({ ...prev, submitting: true }));

    try {
      await accountLinkingService.linkEmailAndPassword(user.email, passwordForm.password);
      const providers = await accountLinkingService.getLinkedProviders();
      const authProviderLabel = buildAuthProviderField(providers);

      await syncFirestoreProfile({ authProvider: authProviderLabel, method: authProviderLabel });

      alertService.showSuccessAlert('Contraseña creada', 'Ahora puedes iniciar sesión con tu correo y contraseña.');
      setProvidersState({ values: providers, loading: false });
    } catch (error: any) {
      console.error('❌ Error creando contraseña:', error);
      const message = error?.message || 'No se pudo crear la contraseña. Intenta nuevamente.';
      alertService.showErrorAlert(message);
    } finally {
      setPasswordForm({ password: '', confirmPassword: '', submitting: false });
    }
  };

  const handleSendPhoneCode = async () => {
    if (!phoneForm.phone) {
      alertService.showErrorAlert('Ingresa el número de teléfono con formato +505 XXXX XXXX.');
      return;
    }

    setPhoneForm((prev) => ({ ...prev, sendingCode: true }));

    try {
      const result = await accountLinkingService.sendPhoneLinkCode(phoneForm.phone);
      alertService.showSuccessAlert('Código enviado', `Se envió un código al número ${result.phone}.`);
      setPhoneForm((prev) => ({ ...prev, codeSent: true }));
    } catch (error: any) {
      console.error('❌ Error enviando código de teléfono:', error);
      const message = error?.message || 'No se pudo enviar el código SMS. Intenta nuevamente.';
      alertService.showErrorAlert(message);
    } finally {
      setPhoneForm((prev) => ({ ...prev, sendingCode: false }));
    }
  };

  const handleConfirmPhoneCode = async () => {
    if (!phoneForm.code) {
      alertService.showErrorAlert('Ingresa el código de 6 dígitos enviado a tu teléfono.');
      return;
    }

    setPhoneForm((prev) => ({ ...prev, confirming: true }));

    try {
      const result = await accountLinkingService.confirmPhoneLinkCode(phoneForm.code);
      const providers = await accountLinkingService.getLinkedProviders();
      const authProviderLabel = buildAuthProviderField(providers);

      await syncFirestoreProfile({
        phone: result.phone,
        phoneVerified: true,
        authProvider: authProviderLabel,
        method: authProviderLabel,
      });

      await updateLocalUserCache({ phone: result.phone });

      alertService.showSuccessAlert('Teléfono vinculado', 'Tu número se agregó y quedó verificado.');
      setProvidersState({ values: providers, loading: false });
      setPhoneForm((prev) => ({ ...prev, code: '', codeSent: false }));
      accountLinkingService.clearPhoneLinkSession();
      await refreshAccountData();
    } catch (error: any) {
      console.error('❌ Error confirmando código de teléfono:', error);
      const message = error?.message || 'No se pudo verificar el código. Intenta nuevamente.';
      alertService.showErrorAlert(message);
    } finally {
      setPhoneForm((prev) => ({ ...prev, confirming: false }));
    }
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Mi cuenta</Text>
          <Text style={styles.headerSubtitle}>
            {user?.name ? user.name : 'Gestiona accesos y datos vinculados'}
          </Text>
        </View>

        {isFirebaseBackend && (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>Resumen de cuenta</Text>
            {profileLoading ? (
              <ActivityIndicator color={colors.primary} />
            ) : (
              <>
                <Text style={styles.infoLabel}>Correo</Text>
                <Text style={styles.infoText}>{profile?.email || user?.email || 'No registrado'}</Text>

                <Text style={styles.infoLabel}>Teléfono</Text>
                <Text style={styles.infoText}>{profile?.phone || 'No registrado'}</Text>

                <Text style={styles.infoLabel}>Proveedores vinculados</Text>
                {providersState.loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : (
                  <Text style={styles.infoText}>{buildProviderSummary(providersState.values)}</Text>
                )}

                {!!accountError && (
                  <Text style={[styles.helperText, { color: colors.error }]}>{accountError}</Text>
                )}

                {!providersState.loading && providersState.values.length > 0 && (
                  <View style={styles.badgeRow}>
                    {providersState.values.map((provider) => (
                      <View key={provider} style={styles.badge}>
                        <Text style={styles.badgeText}>{PROVIDER_LABELS[provider] || provider}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {hasGoogleProvider && !hasEmailPasswordProvider && (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>Agregar contraseña</Text>
            <Text style={styles.accountDescription}>
              Crea una contraseña para que puedas iniciar sesión con tu correo cuando no tengas acceso a Google.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Nueva contraseña"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={passwordForm.password}
              onChangeText={(text) => setPasswordForm((prev) => ({ ...prev, password: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirmar contraseña"
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
                <Text style={styles.buttonText}>Guardar contraseña</Text>
              )}
            </TouchableOpacity>
          </View>
        )}

        {hasGoogleProvider && (!profile?.phone || !hasPhoneProvider) && (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>Agregar teléfono</Text>
            <Text style={styles.accountDescription}>
              Vincula un número para recibir notificaciones y usar autenticación por SMS.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Número de teléfono (+505 XXXX XXXX)"
              placeholderTextColor={colors.textSecondary}
              keyboardType="phone-pad"
              value={phoneForm.phone}
              onChangeText={(text) => setPhoneForm((prev) => ({ ...prev, phone: text }))}
            />
            {!phoneForm.codeSent ? (
              <TouchableOpacity
                style={[styles.button, phoneForm.sendingCode && styles.buttonDisabled]}
                disabled={phoneForm.sendingCode}
                onPress={handleSendPhoneCode}
              >
                {phoneForm.sendingCode ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.buttonText}>Enviar código SMS</Text>
                )}
              </TouchableOpacity>
            ) : (
              <>
                <TextInput
                  style={styles.input}
                  placeholder="Código de 6 dígitos"
                  placeholderTextColor={colors.textSecondary}
                  keyboardType="number-pad"
                  value={phoneForm.code}
                  onChangeText={(text) => setPhoneForm((prev) => ({ ...prev, code: text }))}
                />
                <TouchableOpacity
                  style={[styles.button, phoneForm.confirming && styles.buttonDisabled]}
                  disabled={phoneForm.confirming}
                  onPress={handleConfirmPhoneCode}
                >
                  {phoneForm.confirming ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.buttonText}>Confirmar teléfono</Text>
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {hasPhoneProvider && !hasEmailPasswordProvider && (
          <View style={styles.accountCard}>
            <Text style={styles.accountTitle}>Agregar correo y contraseña</Text>
            <Text style={styles.accountDescription}>
              Vincula un correo electrónico y contraseña para iniciar sesión si no tienes tu teléfono disponible.
            </Text>
            <TextInput
              style={styles.input}
              placeholder="Correo electrónico"
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              value={emailForm.email}
              onChangeText={(text) => setEmailForm((prev) => ({ ...prev, email: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Contraseña"
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              value={emailForm.password}
              onChangeText={(text) => setEmailForm((prev) => ({ ...prev, password: text }))}
            />
            <TextInput
              style={styles.input}
              placeholder="Confirmar contraseña"
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
                <Text style={styles.buttonText}>Guardar credenciales</Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>
    </View>
  );
}
