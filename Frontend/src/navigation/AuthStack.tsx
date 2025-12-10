import React, { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/Auth/LoginScreen';
//import RegisterScreen from '../screens/Auth/RegisterScreen';
import RegisterScreenNew from '../screens/Auth/RegisterScreen';
import AuthLandingScreen from '../screens/Auth/AuthLandingScreen';
import PhoneVerificationScreen from '../screens/Auth/PhoneVerificationScreen';
import PhoneVerificationLoginScreen from '../screens/Auth/PhoneVerificationLoginScreen';
import GooglePhoneScreen from '../screens/Auth/GooglePhoneScreen';
import RoleSelectionScreen from '../screens/Auth/RoleSelectionScreen';
import DriverPhoneScreen from '../screens/Auth/DriverPhoneScreen';
import DriverDataScreen from '../screens/Auth/DriverDataScreen';
import RegisterConfirm from '../screens/Auth/RegisterDriverFormConfirm';
import OnboardingScreen from '../screens/Auth/OnboardingScreen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  const { colors } = useTheme();
  const [initialRouteName, setInitialRouteName] = useState<keyof AuthStackParamList | null>(null);

  useEffect(() => {
    const checkOnboarding = async () => {
      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('@rundi_has_seen_onboarding');
        if (hasSeenOnboarding === 'true') {
          setInitialRouteName('AuthLanding');
        } else {
          setInitialRouteName('Onboarding');
        }
      } catch (error) {
        console.warn('Error reading onboarding flag', error);
        setInitialRouteName('AuthLanding');
      }
    };

    checkOnboarding();
  }, []);

  if (!initialRouteName) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: 'center',
          alignItems: 'center',
          backgroundColor: colors.card,
        }}
      >
        <ActivityIndicator size="large" color="#D4AF37" />
      </View>
    );
  }

  return (
    <Stack.Navigator 
      initialRouteName={initialRouteName}
      screenOptions={{ 
        headerShown: false,
        headerStyle: {
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
        headerTitleStyle: {
          fontWeight: '600',
        },
      }}
    >
      <Stack.Screen
        name="Onboarding"
        component={OnboardingScreen}
        options={{ title: 'Bienvenido a Rundi' }}
      />
      <Stack.Screen 
        name="AuthLanding" 
        component={AuthLandingScreen} 
        options={{ title: 'Bienvenido' }} 
      />
      <Stack.Screen 
        name="Login" 
        component={LoginScreen} 
        options={{ title: 'Login' }} 
      />
      {/* <Stack.Screen 
        name="Register" 
        component={RegisterScreen} 
        options={{ title: 'Registro' }} 
      /> */}
      <Stack.Screen 
        name="RegisterNew" 
        component={RegisterScreenNew} 
        options={{ title: 'Nuevo Registro' }} 
      />
      <Stack.Screen
        name="RoleSelection"
        component={RoleSelectionScreen}
        options={{ title: 'Seleccionar Rol' }}
      />
      <Stack.Screen
        name="DriverPhone"
        component={DriverPhoneScreen}
        options={{ title: 'Teléfono para Conductor' }}
      />
      <Stack.Screen
        name="GooglePhone"
        component={GooglePhoneScreen}
        options={{ title: 'Número Telefónico' }}
      />
      <Stack.Screen 
        name="PhoneVerification" 
        component={PhoneVerificationScreen} 
        options={{ title: 'Verificar Teléfono' }} 
      />
      <Stack.Screen 
        name="PhoneVerificationLogin" 
        component={PhoneVerificationLoginScreen} 
        options={{ title: 'Verificar Teléfono' }} 
      />
      <Stack.Screen 
        name="DriverData" 
        component={DriverDataScreen} 
        options={{ title: 'Datos del Conductor' }} 
      />
      <Stack.Screen 
        name="RegisterConfirm" 
        component={RegisterConfirm} 
        options={{ title: 'Confirmar Registro' }} 
      />
    </Stack.Navigator>
  );
}
