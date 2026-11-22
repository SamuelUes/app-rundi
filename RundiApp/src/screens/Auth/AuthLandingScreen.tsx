import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import Ionicons from '@expo/vector-icons/Ionicons';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';
import StorageImage from '../../components/shared/StorageImage';
import deviceIdentityService from '../../services/auth/deviceIdentityService';
import alertService from '../../services/notification/alertService';
import type { RecognizedDevice } from '../../api/devices';
import { withAlpha } from '../../utils/format/colors';

type AuthLandingNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'AuthLanding'>;

type Props = {
  navigation: AuthLandingNavigationProp;
};

const AuthLandingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();
  const readableGold = isDark ? '#E8C46A' : '#76520F';
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const logoAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

  // Solo se ofrece la cuenta si el dispositivo conserva el secret válido.
  const [recognized, setRecognized] = useState<RecognizedDevice | null>(null);
  const [deviceLoginLoading, setDeviceLoginLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    deviceIdentityService
      .getRecognizedDevice()
      .then((result) => {
        if (!cancelled && result?.recognized) setRecognized(result);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const recognizedFirstName = (recognized?.name || '').trim().split(/\s+/)[0] || '';

  const handleContinueAs = async () => {
    setDeviceLoginLoading(true);
    try {
      // Android reinstall: el secret se borró con la app → el hash del
      // servidor no puede matchear (401 seguro). Directo al login manual.
      if (!(await deviceIdentityService.hasPersistedDeviceSecret())) {
        navigation.navigate('Login');
        return;
      }
      await deviceIdentityService.continueWithRecognizedDevice();
    } catch (error) {
      // 401 = secret que no matchea el hash (post-reinstall) o revocado:
      // el exchange no puede funcionar — login manual sin alerta de error.
      const status = (error as { response?: { status?: number } })?.response?.status;
      if (status === 401 || status === 404) {
        navigation.navigate('Login');
      } else {
        alertService.showErrorAlert(t('authScreens.landing.deviceLoginError'));
      }
    } finally {
      setDeviceLoginLoading(false);
    }
  };

  useEffect(() => {
    const animation = Animated.stagger(140, [
      Animated.spring(logoAnim, {
        toValue: 1,
        speed: 14,
        bounciness: 6,
        useNativeDriver: true,
      }),
      Animated.timing(textAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
      Animated.timing(buttonsAnim, {
        toValue: 1,
        duration: 320,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [logoAnim, textAnim, buttonsAnim]);

  const slideIn = (anim: Animated.Value, distance: number) => ({
    opacity: anim,
    transform: [
      {
        translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [distance, 0] }),
      },
    ],
  });

  const logoStyle = {
    ...slideIn(logoAnim,16),
    transform: [
      {
        translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }),
      },
      {
        scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.94, 1] }),
      },
    ],
  };

  const textStyle = slideIn(textAnim, 10);
  const buttonsStyle = slideIn(buttonsAnim, 10);

  return (
    <View style={styles.container}>
      <StatusBar style={isDark ? 'light' : 'dark'} />
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        contentInsetAdjustmentBehavior="never"
        alwaysBounceVertical={false}
        bounces={false}
        overScrollMode="never"
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View
          style={[
            styles.hero,
            {
              paddingTop: insets.top + 20,
              minHeight: Math.max(300, windowHeight * 0.44),
            },
          ]}
        >
          <View style={[styles.glow, styles.glowTop]} />
          <View style={[styles.glow, styles.glowBottom]} />
          <View style={[styles.ring, styles.ringRight]} />
          <View style={[styles.ring, styles.ringLeft]} />

          <Animated.View style={[styles.heroContent, logoStyle]}>
            <Image
              source={require('../../assets/images/splash-icon.png')}
              style={[styles.logo, { width: Math.min(300, windowWidth * 0.72), height: Math.min(300, windowWidth * 0.72) * (955 / 1120) }]}
              resizeMode="contain"
              accessibilityLabel="Rundi"
            />
            <View style={styles.heroAccent} />
          </Animated.View>
        </View>

        <View style={[styles.sheet, { paddingBottom: insets.bottom + 20 }]}>
          <View style={styles.sheetHandle} />

          <Animated.View style={[styles.textBlock, textStyle]}>
            <Text style={styles.title}>{t('authScreens.landing.title')}</Text>
            <Text style={styles.subtitle}>{t('authScreens.landing.subtitle')}</Text>
          </Animated.View>

          <Animated.View style={[styles.actionsContainer, buttonsStyle]}>
            {recognized && (
              <Pressable
                style={({ pressed }) => [styles.continueCard, pressed && styles.pressedButton]}
                onPress={handleContinueAs}
                disabled={deviceLoginLoading}
                accessibilityRole="button"
              >
                <View style={styles.continueAvatarRing}>
                  <Ionicons name="person" size={22} color={readableGold} />
                  {recognized.profilePhoto ? (
                    <StorageImage
                      uri={recognized.profilePhoto}
                      style={styles.continueAvatar}
                      contentFit="cover"
                    />
                  ) : null}
                </View>
                <View style={styles.continueTextBlock}>
                  <Text style={styles.continueLabel}>
                    {t('authScreens.landing.welcomeBack')}
                  </Text>
                  <Text style={styles.continueName} numberOfLines={1}>
                    {deviceLoginLoading
                      ? t('authScreens.landing.signingIn')
                      : recognizedFirstName
                        ? t('authScreens.landing.continueAs', { name: recognizedFirstName })
                        : t('authScreens.landing.continueAccount')}
                  </Text>
                </View>
                <View style={styles.continueGoChip}>
                  <Ionicons name="arrow-forward" size={18} color="#fff6ec" />
                </View>
              </Pressable>
            )}

            {recognized && (
              <Pressable
                style={({ pressed }) => [styles.anotherAccountLink, pressed && styles.pressedButton]}
                onPress={() => navigation.navigate('Login')}
                accessibilityRole="button"
              >
                <Text style={styles.anotherAccountLinkText}>
                  {t('authScreens.landing.useAnotherAccount')}
                </Text>
              </Pressable>
            )}


            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
            >
              <Ionicons name="log-in-outline" size={22} color="#fff6ec" />
              <Text style={styles.primaryButtonText}>
                {t('authScreens.landing.login')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
              onPress={() => navigation.navigate('RegistrationCheckpoint')}
              accessibilityRole="button"
            >
              <Ionicons name="person-add-outline" size={20} style={styles.secondaryIcon} />
              <Text style={styles.secondaryButtonText}>
                {t('authScreens.landing.register')}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </View>
  );
};

export default AuthLandingScreen;

const createStyles = (colors: any, isDark: boolean) => {
  const gold = colors.primary;
  const readableGold = isDark ? '#E8C46A' : '#76520F';
  const goldDeep = isDark ? '#8F6B28' : '#8A6826';
  const goldTint = isDark ? 'rgba(232, 196, 106, 0.10)' : 'rgba(179, 135, 55, 0.08)';
  const goldTintStrong = isDark ? 'rgba(232, 196, 106, 0.16)' : 'rgba(179, 135, 55, 0.14)';
  const goldHairline = isDark ? 'rgba(232, 196, 106, 0.35)' : 'rgba(179, 135, 55, 0.35)';
  const violetHairline = isDark ? 'rgba(147, 112, 219, 0.35)' : 'rgba(124, 58, 237, 0.8)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
    },
    hero: {
      overflow: 'hidden',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 28,
      paddingBottom: 48,
      backgroundColor: isDark ? '#241c38' : 'transparent',
    },
    glow: {
      position: 'absolute',
      borderRadius: 999,
      backgroundColor: 'rgba(212, 175, 55, 0.10)',
    },
    glowTop: {
      width: 300,
      height: 300,
      top: -90,
      right: -90,
    },
    glowBottom: {
      width: 220,
      height: 220,
      bottom: -60,
      left: -70,
      backgroundColor: 'rgba(212, 175, 55, 0.07)',
    },
    ring: {
      position: 'absolute',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: 'rgba(212, 175, 55, 0.30)',
    },
    ringRight: {
      width: 170,
      height: 170,
      bottom: -50,
      right: -40,
    },
    ringLeft: {
      width: 90,
      height: 90,
      top: 64,
      left: -32,
      borderColor: 'rgba(212, 175, 55, 0.22)',
    },
    heroContent: {
      alignItems: 'center',
      gap: 18,
    },
    logo: {
      width: '72%',
      maxWidth: 300,
      aspectRatio: 1120 / 955,
    },
    heroAccent: {
      width: 56,
      height: 3,
      borderRadius: 2,
      backgroundColor: 'rgba(212, 175, 55, 0.85)',
    },
    sheet: {
      flexGrow: 1,
      marginTop: -28,
      borderTopLeftRadius: 30,
      borderTopRightRadius: 30,
      backgroundColor: colors.card,
      paddingHorizontal: 28,
      paddingTop: 14,
      boxShadow: isDark
        ? '0 -14px 32px rgba(0, 0, 0, 0.45)'
        : '0 -10px 26px rgba(20, 39, 43, 0.18)',
    },
    sheetHandle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border,
      marginBottom: 10,
    },
    textBlock: {
      alignItems: 'center',
      gap: 10,
      marginTop: 14,
    },
    title: {
      fontSize: 32,
      fontWeight: '800',
      color: readableGold,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    subtitle: {
      maxWidth: 320,
      fontSize: 16,
      lineHeight: 23,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actionsContainer: {
      width: '100%',
      marginTop: 28,
      paddingTop: 22,
      borderTopWidth: StyleSheet.hairlineWidth,
      borderTopColor: colors.border,
      gap: 14,
    },
    continueCard: {
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderRadius: 18,
      borderWidth: 0.1,
      borderColor: goldHairline,
      backgroundColor: goldTint,
      // bg translúcido → elevation: 0 (sombra Android sangraría dentro).
      elevation: 0,
    },
    continueAvatar: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      borderRadius: 24,
    },
    continueAvatarRing: {
      width: 48,
      height: 48,
      borderRadius: 24,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: goldTintStrong,
      borderWidth: 0.5,
      borderColor: goldHairline,
      overflow: 'hidden',
    },
    continueTextBlock: {
      flex: 1,
      gap: 2,
    },
    continueLabel: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    continueName: {
      fontSize: 16,
      fontWeight: '800',
      color: readableGold,
    },
    continueGoChip: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: gold,
    },
    anotherAccountLink: {
      alignSelf: 'center',
      paddingVertical: 4,
      paddingHorizontal: 14,
    },
    anotherAccountLinkText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.textSecondary,
      textDecorationLine: 'underline',
      textDecorationColor: goldHairline,
    },
    primaryButton: {
      minHeight: 58,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 20,
      borderRadius: 999,
      backgroundColor: gold,
      // Relieve: filo inferior más oscuro + sombra dorada suave.
      borderBottomWidth: 1.2,
      borderBottomColor: goldDeep,
      boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 4, color: withAlpha(gold, 0.15)  }],
      elevation: 4,
    },
    primaryButtonText: {
      color: '#fff6ec',
      fontSize: 17,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    primaryPressed: {
      opacity: 0.92,
      transform: [{ scale: 0.985 }],
    },
    secondaryButton: {
      minHeight: 54,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 20,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: violetHairline,
      backgroundColor: violetHairline,
    },
    secondaryButtonText: {
      color: '#fff6ec',
      fontSize: 15,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    secondaryIcon: {
      color: '#fff6ec',
    },
    pressedButton: {
      opacity: 0.85,
      transform: [{ scale: 0.985 }],
    },
  });
};
