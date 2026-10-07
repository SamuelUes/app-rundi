import React, { useEffect, useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';

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

  const logoAnim = useRef(new Animated.Value(0)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.sequence([
      Animated.timing(logoAnim, {
        toValue: 1,
        duration: 450,
        useNativeDriver: true,
      }),
      Animated.timing(buttonsAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [logoAnim, buttonsAnim]);

  const logoStyle = {
    opacity: logoAnim,
    transform: [
      {
        translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }),
      },
      {
        scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.97, 1] }),
      },
    ],
  };

  const buttonsStyle = {
    opacity: buttonsAnim,
    transform: [
      {
        translateY: buttonsAnim.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }),
      },
    ],
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        alwaysBounceVertical={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.card}>
          <Animated.View style={[styles.brandContent, logoStyle]}>
            <Image
              source={require('../../assets/images/logo.png')}
              style={styles.logo}
              resizeMode="contain"
              accessibilityLabel="Rundi"
            />
            <Text style={styles.title}>{t('authScreens.landing.title')}</Text>
            <Text style={styles.subtitle}>
              {t('authScreens.landing.subtitle')}
            </Text>
          </Animated.View>

          <Animated.View style={[styles.actionsContainer, buttonsStyle]}>
            <Pressable
              style={({ pressed }) => [styles.primaryButton, pressed && styles.pressedButton]}
              onPress={() => navigation.navigate('Login')}
              accessibilityRole="button"
            >
              <Text style={styles.primaryButtonText}>
                {t('authScreens.landing.login')}
              </Text>
            </Pressable>

            <Pressable
              style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressedButton]}
              onPress={() => navigation.navigate('RegistrationCheckpoint')}
              accessibilityRole="button"
            >
              <Text style={styles.secondaryButtonText}>
                {t('authScreens.landing.register')}
              </Text>
            </Pressable>
          </Animated.View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

export default AuthLandingScreen;

const createStyles = (colors: any, isDark: boolean) => {
  const gold = colors.primary;
  const readableGold = isDark ? '#E8C46A' : '#76520F';
  const deepTeal = '#203A3E';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.surface,
    },
    scrollContent: {
      flexGrow: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
      paddingVertical: 24,
    },
    card: {
      width: '100%',
      maxWidth: 440,
      borderRadius: 28,
      paddingVertical: 36,
      paddingHorizontal: 28,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      boxShadow: isDark
        ? '0 10px 28px rgba(0, 0, 0, 0.24)'
        : '0 14px 36px rgba(32, 58, 62, 0.10)',
      alignItems: 'center',
      gap: 32,
    },
    brandContent: {
      width: '100%',
      alignItems: 'center',
      gap: 12,
    },
    logo: {
      width: '88%',
      maxWidth: 260,
      height: 88,
    },
    title: {
      marginTop: 4,
      fontSize: 30,
      fontWeight: '800',
      color: gold,
      letterSpacing: 0.2,
      textAlign: 'center',
    },
    subtitle: {
      fontSize: 16,
      lineHeight: 23,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actionsContainer: {
      width: '100%',
      gap: 14,
    },
    primaryButton: {
      minHeight: 58,
      width: '100%',
      paddingHorizontal: 20,
      borderRadius: 22,
      backgroundColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 17,
      fontWeight: '700',
    },
    secondaryButton: {
      minHeight: 58,
      width: '100%',
      paddingHorizontal: 20,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    secondaryButtonText: {
      color: readableGold,
      fontSize: 17,
      fontWeight: '700',
    },
    pressedButton: {
      opacity: 0.78,
    },
  });
};
