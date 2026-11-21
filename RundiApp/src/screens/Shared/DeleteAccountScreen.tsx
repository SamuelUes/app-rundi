import React, { useMemo, useState } from 'react';
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { userManagementService } from '../../services/user/userManagementService';
import phoneAuthService from '../../services/auth/phoneAuthService';

type VerificationMethod = 'phone' | 'email';

export default function DeleteAccountScreen({ navigation }: any) {
  const { colors, isDark } = useTheme();
  const { user, logout } = useAuth();
  const { t } = useTranslation();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [method, setMethod] = useState<VerificationMethod>(user?.phone ? 'phone' : 'email');
  const [email, setEmail] = useState(user?.email || '');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [codeSent, setCodeSent] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);

  const sendCode = async () => {
    if (!user?.phone) return;
    setLoading(true);
    try {
      await phoneAuthService.sendVerificationCode(user.phone);
      setCodeSent(true);
      setCode('');
    } catch (error: any) {
      Alert.alert(t('shared.deleteAccount.alerts.genericErrorTitle'), error.message);
    } finally {
      setLoading(false);
    }
  };

  const performDeletion = async () => {
    setLoading(true);
    try {
      const result =
        method === 'phone'
          ? await userManagementService.deleteUserAccountWithPhone(
              user?.phone || '',
              code.trim(),
              user?.phone || '',
            )
          : await userManagementService.deleteUserAccountWithEmail(email, password);

      if (!result.success) {
        Alert.alert(t('shared.deleteAccount.alerts.genericErrorTitle'), result.message);
        return;
      }

      try {
        await logout();
      } catch {
        // The server has already deactivated the account.
      }

      Alert.alert(
        t('shared.deleteAccount.alerts.successTitle'),
        result.message,
        [
          {
            text: t('shared.deleteAccount.alerts.successOk'),
            onPress: () =>
              navigation.reset({ index: 0, routes: [{ name: 'Login' }] }),
          },
        ],
      );
    } catch (error: any) {
      Alert.alert(
        t('shared.deleteAccount.alerts.genericErrorTitle'),
        error.message || t('shared.deleteAccount.alerts.deleteErrorMessage'),
      );
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = () => {
    if (!confirmed) {
      Alert.alert(
        t('shared.deleteAccount.alerts.confirmRequiredTitle'),
        t('shared.deleteAccount.alerts.confirmRequiredMessage'),
      );
      return;
    }
    if (method === 'phone' && (!codeSent || code.trim().length !== 6)) {
      Alert.alert(
        t('shared.deleteAccount.alerts.missingFieldsTitle'),
        t('shared.deleteAccount.alerts.codeRequired'),
      );
      return;
    }
    if (method === 'email' && (!email.trim() || !password)) {
      Alert.alert(
        t('shared.deleteAccount.alerts.missingFieldsTitle'),
        t('shared.deleteAccount.alerts.missingFieldsMessage'),
      );
      return;
    }

    Alert.alert(
      t('shared.deleteAccount.alerts.confirmDeleteTitle'),
      t('shared.deleteAccount.alerts.confirmDeleteMessage'),
      [
        { text: t('shared.deleteAccount.alerts.confirmDeleteCancel'), style: 'cancel' },
        {
          text: t('shared.deleteAccount.alerts.confirmDeleteConfirm'),
          style: 'destructive',
          onPress: performDeletion,
        },
      ],
    );
  };

  const roleKey =
    user?.role === 'driver' ? 'driver' : user?.role === 'client' ? 'client' : 'default';
  const warningBulletKeys = [
    'accountAccess',
    'dataRetained',
    'reactivation',
  ];

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.topline}>
          <View style={styles.brandMark}>
            <MaterialIcons name="shield" size={19} color={colors.error} />
          </View>
          <Text style={styles.eyebrow}>{t('shared.deleteAccount.header.eyebrow')}</Text>
        </View>

        <Text style={styles.title}>{t('shared.deleteAccount.header.title')}</Text>
        <Text style={styles.subtitle}>
          {user?.name} · {t(`shared.deleteAccount.header.roles.${roleKey}`)}
        </Text>

        <View style={styles.warningCard}>
          <View style={styles.warningHeading}>
            <MaterialIcons name="warning-amber" size={21} color={colors.error} />
            <Text style={styles.warningTitle}>
              {t('shared.deleteAccount.warning.title')}
            </Text>
          </View>
          <Text style={styles.warningText}>{t('shared.deleteAccount.warning.intro')}</Text>
          <View style={styles.bulletList}>
            {warningBulletKeys.map((key) => (
              <View key={key} style={styles.bulletRow}>
                <View style={styles.bullet} />
                <Text style={styles.bulletText}>
                  {t(`shared.deleteAccount.warning.bullets.${key}`)}
                </Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.sectionHeading}>
          <Text style={styles.sectionEyebrow}>
            {t('shared.deleteAccount.form.step')}
          </Text>
          <Text style={styles.sectionTitle}>{t('shared.deleteAccount.form.title')}</Text>
        </View>

        <View style={styles.methods}>
          {user?.phone ? (
            <MethodOption
              active={method === 'phone'}
              icon="sms"
              label={t('shared.deleteAccount.form.phoneMethod')}
              detail={user.phone}
              onPress={() => {
                setMethod('phone');
                setCodeSent(false);
                setCode('');
              }}
              styles={styles}
              disabled={loading}
            />
          ) : null}
          {user?.email ? (
            <MethodOption
              active={method === 'email'}
              icon="mail-outline"
              label={t('shared.deleteAccount.form.emailMethod')}
              detail={user.email}
              onPress={() => setMethod('email')}
              styles={styles}
              disabled={loading}
            />
          ) : null}
        </View>

        {method === 'phone' && user?.phone ? (
          <View style={styles.verificationPanel}>
            <Text style={styles.fieldLabel}>
              {t('shared.deleteAccount.form.phoneLabel')}
            </Text>
            <Text style={styles.helperText}>
              {t('shared.deleteAccount.form.phoneDescription')}
            </Text>
            {codeSent ? (
              <TextInput
                style={[styles.input, styles.codeInput]}
                value={code}
                onChangeText={(value) => setCode(value.replace(/\D/g, '').slice(0, 6))}
                placeholder={t('shared.deleteAccount.form.codePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                maxLength={6}
                editable={!loading}
                accessibilityLabel={t('shared.deleteAccount.form.codePlaceholder')}
              />
            ) : null}
            <Pressable
              accessibilityRole="button"
              onPress={sendCode}
              disabled={loading}
              style={({ pressed }) => [
                styles.secondaryAction,
                pressed && styles.pressed,
                loading && styles.disabled,
              ]}
            >
              <MaterialIcons
                name={codeSent ? 'refresh' : 'send-to-mobile'}
                size={18}
                color={colors.primary}
              />
              <Text style={styles.secondaryActionText}>
                {codeSent
                  ? t('shared.deleteAccount.buttons.resendCode')
                  : t('shared.deleteAccount.buttons.sendCode')}
              </Text>
            </Pressable>
            {codeSent ? (
              <Text style={styles.sentHint}>
                {t('shared.deleteAccount.form.codeSent')}
              </Text>
            ) : null}
          </View>
        ) : (
          <View style={styles.verificationPanel}>
            <Text style={styles.fieldLabel}>
              {t('shared.deleteAccount.form.emailLabel')}
            </Text>
            <TextInput
              style={styles.input}
              value={email}
              onChangeText={setEmail}
              placeholder={t('shared.deleteAccount.form.emailPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={!loading}
            />
            <Text style={styles.fieldLabel}>
              {t('shared.deleteAccount.form.passwordLabel')}
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder={t('shared.deleteAccount.form.passwordPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              secureTextEntry
              autoComplete="current-password"
              editable={!loading}
            />
          </View>
        )}

        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked: confirmed, disabled: loading }}
          onPress={() => setConfirmed((value) => !value)}
          disabled={loading}
          style={styles.confirmRow}
        >
          <View style={[styles.checkbox, confirmed && styles.checkboxSelected]}>
            {confirmed ? <MaterialIcons name="check" size={16} color="#FFFFFF" /> : null}
          </View>
          <Text style={styles.confirmText}>
            {t('shared.deleteAccount.confirmation.checkbox')}
          </Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          onPress={handleDelete}
          disabled={loading}
          style={({ pressed }) => [
            styles.deleteButton,
            pressed && styles.pressed,
            loading && styles.disabled,
          ]}
        >
          <MaterialIcons name="delete-outline" size={20} color="#FFFFFF" />
          <Text style={styles.deleteButtonText}>
            {loading
              ? t('shared.deleteAccount.buttons.deleting')
              : t('shared.deleteAccount.buttons.delete')}
          </Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => navigation.goBack()}
          disabled={loading}
          style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
        >
          <Text style={styles.cancelButtonText}>
            {t('shared.deleteAccount.buttons.cancel')}
          </Text>
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

function MethodOption({
  active,
  icon,
  label,
  detail,
  onPress,
  styles,
  disabled,
}: {
  active: boolean;
  icon: keyof typeof MaterialIcons.glyphMap;
  label: string;
  detail: string;
  onPress: () => void;
  styles: ReturnType<typeof createStyles>;
  disabled: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: active, disabled }}
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.methodOption,
        active && styles.methodOptionActive,
        pressed && styles.pressed,
      ]}
    >
      <MaterialIcons name={icon} size={20} color={active ? styles.methodIconActive.color : styles.methodIcon.color} />
      <View style={styles.methodCopy}>
        <Text style={styles.methodLabel}>{label}</Text>
        <Text style={styles.methodDetail}>{detail}</Text>
      </View>
      <View style={[styles.radio, active && styles.radioActive]}>
        {active ? <View style={styles.radioDot} /> : null}
      </View>
    </Pressable>
  );
}

function createStyles(colors: ReturnType<typeof useTheme>['colors'], isDark: boolean) {
  return StyleSheet.create({
    safeArea: { flex: 1, backgroundColor: colors.background },
    content: { paddingHorizontal: 22, paddingTop: 18, paddingBottom: 34 },
    topline: { flexDirection: 'row', alignItems: 'center', marginBottom: 18 },
    brandMark: {
      width: 34,
      height: 34,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: `${colors.error}18`,
      marginRight: 10,
    },
    eyebrow: {
      color: colors.textSecondary,
      fontSize: 11,
      fontWeight: '700',
      letterSpacing: 1.4,
      textTransform: 'uppercase',
    },
    title: {
      color: colors.text,
      fontSize: 32,
      lineHeight: 37,
      letterSpacing: -0.8,
      fontWeight: '800',
      maxWidth: 330,
    },
    subtitle: { color: colors.textSecondary, fontSize: 14, marginTop: 7, marginBottom: 24 },
    warningCard: {
      borderRadius: 18,
      padding: 18,
      backgroundColor: isDark ? `${colors.error}13` : `${colors.error}0D`,
      borderWidth: 0.1,
      borderColor: `${colors.error}35`,
      marginBottom: 28,
    },
    warningHeading: { flexDirection: 'row', alignItems: 'center', marginBottom: 8 },
    warningTitle: { color: colors.error, fontSize: 15, fontWeight: '800', marginLeft: 8 },
    warningText: { color: colors.text, fontSize: 13, lineHeight: 19 },
    bulletList: { marginTop: 12, gap: 8 },
    bulletRow: { flexDirection: 'row', alignItems: 'flex-start', paddingRight: 4 },
    bullet: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.error,
      marginTop: 7,
      marginRight: 9,
    },
    bulletText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    sectionHeading: { marginBottom: 13 },
    sectionEyebrow: {
      color: colors.primary,
      fontSize: 10,
      fontWeight: '800',
      letterSpacing: 1.2,
      textTransform: 'uppercase',
      marginBottom: 5,
    },
    sectionTitle: { color: colors.text, fontSize: 20, fontWeight: '700' },
    methods: { gap: 9, marginBottom: 13 },
    methodOption: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 14,
      borderRadius: 14,
      borderWidth: 0.1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    methodOptionActive: {
      borderColor: colors.primary,
      backgroundColor: `${colors.primary}0C`,
    },
    methodIcon: { color: colors.textSecondary },
    methodIconActive: { color: colors.primary },
    methodCopy: { flex: 1, marginLeft: 11 },
    methodLabel: { color: colors.text, fontSize: 14, fontWeight: '700' },
    methodDetail: { color: colors.textSecondary, fontSize: 12, marginTop: 3 },
    radio: {
      width: 19,
      height: 19,
      borderWidth: 1.5,
      borderColor: colors.border,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioActive: { borderColor: colors.primary },
    radioDot: { width: 9, height: 9, borderRadius: 5, backgroundColor: colors.primary },
    verificationPanel: {
      padding: 16,
      borderRadius: 16,
      backgroundColor: colors.card,
      marginBottom: 18,
    },
    fieldLabel: { color: colors.text, fontSize: 12, fontWeight: '700', marginBottom: 8 },
    helperText: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    input: {
      minHeight: 50,
      borderRadius: 12,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      color: colors.text,
      fontSize: 15,
      marginBottom: 13,
    },
    codeInput: { fontSize: 21, letterSpacing: 8, textAlign: 'center', fontWeight: '700' },
    secondaryAction: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      borderRadius: 11,
      backgroundColor: `${colors.primary}12`,
    },
    secondaryActionText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
    sentHint: { color: colors.textSecondary, fontSize: 11, textAlign: 'center', marginTop: 9 },
    confirmRow: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: 18 },
    checkbox: {
      width: 22,
      height: 22,
      borderRadius: 6,
      borderWidth: 1.5,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 11,
      marginTop: 1,
    },
    checkboxSelected: { backgroundColor: colors.primary, borderColor: colors.primary },
    confirmText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },
    deleteButton: {
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 15,
      backgroundColor: colors.error,
      gap: 9,
    },
    deleteButtonText: { color: '#FFFFFF', fontWeight: '800', fontSize: 15 },
    cancelButton: { alignItems: 'center', justifyContent: 'center', paddingVertical: 15 },
    cancelButtonText: { color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
    pressed: { opacity: 0.78 },
    disabled: { opacity: 0.58 },
  });
}
