import React, { useEffect, useMemo, useRef } from 'react';
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
import { MaterialIcons } from '@expo/vector-icons';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { AuthStackParamList } from '../../navigation/types';
import { useTranslation } from 'react-i18next';

type AuthLandingNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'AuthLanding'>;

type Props = {
  navigation: AuthLandingNavigationProp;
};

const AuthLandingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { width: windowWidth, height: windowHeight } = useWindowDimensions();

  const logoAnim = useRef(new Animated.Value(0)).current;
  const textAnim = useRef(new Animated.Value(0)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

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
              source={require('../../assets/images/logo.png')}
              style={[styles.logo, { width: Math.min(300, windowWidth * 0.72) }]}
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
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.primaryPressed]}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
            >
              <MaterialIcons name="login" size={20} color="#fff6ec" />
              <Text style={styles.primaryButtonText}>
                {t('authScreens.landing.login')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
              onPress={() => navigation.navigate('RegistrationCheckpoint')}
              accessibilityRole="button"
            >
              <MaterialIcons name="person-add" size={20} style={styles.secondaryIcon} />
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
      backgroundColor: isDark ? '#1C3438' : 'transparent',
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
      aspectRatio: 864 / 290,
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
    primaryButton: {
      minHeight: 58,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 20,
      borderRadius: 22,
      backgroundColor: gold,
    },
    primaryButtonText: {
      color: '#fff6ec',
      fontSize: 17,
      fontWeight: '700',
    },
    primaryPressed: {
      opacity: 0.85,
    },
    secondaryButton: {
      minHeight: 58,
      width: '100%',
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 10,
      paddingHorizontal: 20,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: readableGold,
      backgroundColor: 'transparent',
    },
    secondaryButtonText: {
      color: readableGold,
      fontSize: 17,
      fontWeight: '700',
    },
    secondaryIcon: {
      color: readableGold,
    },
    pressedButton: {
      opacity: 0.78,
    },
  });
};
