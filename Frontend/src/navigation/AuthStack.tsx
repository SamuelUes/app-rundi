import React, { useEffect, useState } from 'react';
import { View } from 'react-native';
import { LoadingIcon } from '../components/LoadingIcon';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/Auth/LoginScreen';
//import RegisterScreen from '../screens/Auth/RegisterScreen';
import RegisterScreenNew from '../screens/Auth/RegisterScreen';
import AuthLandingScreen from '../screens/Auth/AuthLandingScreen';
import RegistrationCheckpointScreen from '../screens/Auth/RegistrationCheckpointScreen';
import registrationService from '../services/auth/registrationService';
import PhoneVerificationScreen from '../screens/Auth/PhoneVerificationScreen';
import PhoneVerificationLoginScreen from '../screens/Auth/PhoneVerificationLoginScreen';
import EmailVerificationScreen from '../screens/Auth/EmailVerificationScreen';
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
    const initAuthStack = async () => {
      // Timeout de seguridad: si AsyncStorage tarda demasiado, ir al landing
      const timeout = setTimeout(() => {
        setInitialRouteName((prev) => prev ?? 'AuthLanding');
      }, 3000);

      try {
        const hasSeenOnboarding = await AsyncStorage.getItem('@rundi_has_seen_onboarding');

        // Si el usuario aún no ha visto el onboarding, siempre lo mostramos primero
        if (hasSeenOnboarding !== 'true') {
          clearTimeout(timeout);
          setInitialRouteName('Onboarding');
          return;
        }

        // Onboarding ya visto → revisar si hay un registro pendiente para mostrar el checkpoint
        try {
          const tempData = await registrationService.getTemporaryData();
          const hasPendingRegistration = tempData && Object.keys(tempData).length > 0 && (tempData as any).name;

          if (hasPendingRegistration) {
            clearTimeout(timeout);
            setInitialRouteName('RegistrationCheckpoint');
            return;
          }
        } catch (checkpointError) {
          console.warn('Error checking pending registration', checkpointError);
        }

        // Sin registro pendiente → ir al landing normal de auth
        clearTimeout(timeout);
        setInitialRouteName('AuthLanding');
      } catch (error) {
        clearTimeout(timeout);
        console.warn('Error reading onboarding flag', error);
        setInitialRouteName('AuthLanding');
      }
    };

    initAuthStack();
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
        <LoadingIcon size={32} color="#D4AF37" />
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
        name="RegistrationCheckpoint"
        component={RegistrationCheckpointScreen}
        options={{ title: 'Continuar registro' }}
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
        options={{ headerShown: false , title: 'Nuevo Registro' }} 
      />
      <Stack.Screen
        name="RoleSelection"
        component={RoleSelectionScreen}
        options={{headerShown: false , title: 'Seleccionar Rol' }}
      />
      <Stack.Screen
        name="DriverPhone"
        component={DriverPhoneScreen}
        options={{headerShown: false  }}
      />
      <Stack.Screen
        name="GooglePhone"
        component={GooglePhoneScreen}
        options={{headerShown: false , title: 'Número Telefónico' }}
      />
      <Stack.Screen 
        name="PhoneVerification" 
        component={PhoneVerificationScreen} 
        options={{headerShown: false , title: 'Verificar Teléfono' }} 
      />
      <Stack.Screen 
        name="PhoneVerificationLogin" 
        component={PhoneVerificationLoginScreen} 
        options={{headerShown: false , title: 'Verificar Teléfono' }} 
      />
      <Stack.Screen
        name="EmailVerification"
        component={EmailVerificationScreen}
        options={{ headerShown: false, title: 'Verificar Correo' }}
      />
      <Stack.Screen 
        name="DriverData" 
        component={DriverDataScreen} 
        options={{headerShown: false , title: 'Datos del Conductor' }} 
      />
      <Stack.Screen 
        name="RegisterConfirm" 
        component={RegisterConfirm} 
        options={{headerShown: false , title: 'Confirmar Registro' }} 
      />
    </Stack.Navigator>
  );
}
