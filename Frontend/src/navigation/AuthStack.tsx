import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import LoginScreen from '../screens/Auth/LoginScreen';
//import RegisterScreen from '../screens/Auth/RegisterScreen';
import RegisterScreenNew from '../screens/Auth/RegisterScreen';
import PhoneVerificationScreen from '../screens/Auth/PhoneVerificationScreen';
import DriverDataScreen from '../screens/Auth/DriverDataScreen';
import RegisterConfirm from '../screens/Auth/RegisterConfirm';

export type AuthStackParamList = {
  Login: undefined;
  Register: undefined;
  RegisterNew: undefined;
  PhoneVerification: {
    name: string;
    email: string;
    phone: string;
    password?: string;
    role: 'client' | 'driver';
    authProvider: 'email/password' | 'google';
  };
  DriverData: {
    name: string;
    email: string;
    phone: string;
    password?: string;
    role: 'driver';
    authProvider: 'email/password' | 'google';
    phoneVerified: boolean;
  };
  RegisterConfirm: {
    name: string;
    email: string;
    phone: string;
    password?: string;
    role: 'client' | 'driver';
    authProvider: 'email/password' | 'google';
    phoneVerified: boolean;
    driverData?: any;
    vehicleData?: any;
  };
};

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
        name="PhoneVerification" 
        component={PhoneVerificationScreen} 
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
