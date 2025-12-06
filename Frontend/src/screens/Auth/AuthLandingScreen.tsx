import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Image,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useTheme } from '../../context/ThemeContext';
import { AuthStackParamList } from '../../navigation/types';

type AuthLandingNavigationProp = NativeStackNavigationProp<AuthStackParamList, 'AuthLanding'>;

type Props = {
  navigation: AuthLandingNavigationProp;
};

const AuthLandingScreen: React.FC<Props> = ({ navigation }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const logoAnim = useRef(new Animated.Value(0)).current;
  const buttonsAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.timing(logoAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(buttonsAnim, {
        toValue: 1,
        duration: 400,
        useNativeDriver: true,
      }),
    ]).start();
  }, [logoAnim, buttonsAnim]);

  const logoStyle = {
    opacity: logoAnim,
    transform: [
      {
        translateY: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [20, 0] }),
      },
      {
        scale: logoAnim.interpolate({ inputRange: [0, 1], outputRange: [0.9, 1] }),
      },
    ],
  };

  const buttonsStyle = {
    opacity: buttonsAnim,
    transform: [
      {
        translateY: buttonsAnim.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }),
      },
    ],
  };

  const handleLoginPress = () => {
    navigation.navigate('Login');
  };

  const handleRegisterPress = () => {
    navigation.navigate('RegisterNew');
  };

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Animated.View style={[styles.logoContainer, logoStyle]}>
          <Image
            source={require('../../assets/images/logo.png')}
            style={styles.logo}
            resizeMode="contain"
          />
          <Text style={styles.title}>Bienvenido</Text>
          <Text style={styles.subtitle}>Tu viaje comienza aquí</Text>
        </Animated.View>

        <Animated.View style={[styles.actionsContainer, buttonsStyle]}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleLoginPress}>
            <Text style={styles.primaryButtonText}>Iniciar sesión</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.secondaryButton} onPress={handleRegisterPress}>
            <Text style={styles.secondaryButtonText}>Crear cuenta</Text>
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
};

export default AuthLandingScreen;

const createStyles = (colors: any) => {
  const gold = '#D4AF37';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      borderRadius: 24,
      paddingVertical: 32,
      paddingHorizontal: 24,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 24,
    },
    logoContainer: {
      alignItems: 'center',
      gap: 8,
      height: 166,
    },
    logo: {
      width: 180,
      height: 96,
      //marginBottom: 2,
    },
    title: {
      fontSize: 24,
      fontWeight: '800',
      color: gold,
      letterSpacing: 0.3,
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
    },
    actionsContainer: {
      width: '100%',
      gap: 12,
      marginTop: 8,
    },
    primaryButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 22,
      backgroundColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      width: '100%',
      paddingVertical: 14,
      borderRadius: 22,
      borderWidth: 1.5,
      borderColor: gold,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'transparent',
    },
    secondaryButtonText: {
      color: gold,
      fontSize: 16,
      fontWeight: '700',
    },
  });
};
