import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/Auth/LoginScreen';
//import RegisterScreen from '../screens/Auth/RegisterScreen';
import RegisterScreenNew from '../screens/Auth/RegisterScreen';
import PhoneVerificationScreen from '../screens/Auth/PhoneVerificationScreen';
import PhoneVerificationLoginScreen from '../screens/Auth/PhoneVerificationLoginScreen';
import GooglePhoneScreen from '../screens/Auth/GooglePhoneScreen';
import RoleSelectionScreen from '../screens/Auth/RoleSelectionScreen';
import DriverDataScreen from '../screens/Auth/DriverDataScreen';
import RegisterConfirm from '../screens/Auth/RegisterConfirm';
import { AuthStackParamList } from './types';

const Stack = createNativeStackNavigator<AuthStackParamList>();

export default function AuthStack() {
  const { colors } = useTheme();

  return (
    <Stack.Navigator 
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
