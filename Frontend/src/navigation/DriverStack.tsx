import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import DriverHomeScreen from '../screens/Driver/DriverHomeScreen';
import RideRequestsScreen from '../screens/Driver/RideRequestsScreen';
import AvailableRidesScreen from '../screens/Driver/AvailableRidesScreen';
import ActiveRideScreen from '../screens/Driver/ActiveRideScreen';
import EarningsScreen from '../screens/Driver/EarningsScreen';
import VehicleInspectionScreen from '../screens/Driver/VehicleInspectionScreen';
import ProfileScreen from '../screens/Shared/ProfileScreen';
import RideHistoryScreen from '../screens/Shared/RideHistoryScreen';
import RatingScreen from '../screens/Shared/RatingScreen';
import PaymentMethodsScreen from '../screens/Shared/PaymentMethodsScreen';
import SettingsScreen from '../screens/Shared/SettingsScreen';
import HelpScreen from '../screens/Shared/HelpScreen';
import ChatScreen from '../screens/Shared/ChatScreen';
import CompleteVehicleInfoScreen from '../screens/Shared/CompleteVehicleInfoScreen';
import RideDetailsScreen from '../screens/Shared/RideDetailsScreen';
import WaitingPaymentScreen from '../screens/Driver/WaitingPaymentScreen';
import ConfirmCashPaymentScreen from '../screens/Driver/ConfirmCashPaymentScreen';
import WaitingClientConfirmationScreen from '../screens/Driver/WaitingClientConfirmationScreen';

export type DriverStackParamList = {
  DriverHome: undefined;
  RideRequests: undefined;
  AvailableRides: undefined;
  ActiveRide: {
    rideId: string;
  };
  Earnings: undefined;
  VehicleInspection: {
    rideId: string;
  };
  Profile: undefined;
  RideHistory: undefined;
  Rating: {
    rideId: string;
  };
  PaymentMethods: undefined;
  Settings: undefined;
  Help: undefined;
  Chat: {
    rideId: string;
    otherUserName: string;
  };
  CompleteVehicleInfo: undefined;
  RideDetails: {
    rideId: string;
  };
  WaitingPayment: {
    rideId: string;
    amount: number;
    clientName: string;
  };
  ConfirmCashPayment: {
    rideId: string;
    amount: number;
    tip: number;
    clientName: string;
  };
  WaitingClientConfirmation: {
    rideId: string;
    clientId: string;
    origin: { lat: number; lng: number; address: string };
    destination: { lat: number; lng: number; address: string };
    estimatedFare: number;
  };
};

const Stack = createNativeStackNavigator<DriverStackParamList>();

export default function DriverStack() {
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
      <Stack.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'Conductor' }} />
      <Stack.Screen name="AvailableRides" component={AvailableRidesScreen} options={{ title: 'Viajes Disponibles' }} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} options={{ title: 'Viaje Activo' }} />
      <Stack.Screen name="RideRequests" component={RideRequestsScreen} options={{ title: 'Solicitudes' }} />
      <Stack.Screen name="VehicleInspection" component={VehicleInspectionScreen} options={{ title: 'Inspección de Vehículo' }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Ganancias' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Perfil' }} />
      <Stack.Screen name="RideHistory" component={RideHistoryScreen} options={{ headerShown: true, title: 'Historial de Viajes' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: true, title: 'Calificar' }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: true, title: 'Métodos de Pago' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Configuración' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: true, title: 'Ayuda' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
      <Stack.Screen name="CompleteVehicleInfo" component={CompleteVehicleInfoScreen} options={{ headerShown: true, title: 'Completar Información' }} />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} options={{ headerShown: true, title: 'Detalles del Viaje' }} />
      <Stack.Screen name="WaitingPayment" component={WaitingPaymentScreen} options={{ headerShown: true, title: 'Esperando Pago' }} />
      <Stack.Screen name="ConfirmCashPayment" component={ConfirmCashPaymentScreen} options={{ headerShown: true, title: 'Confirmar Pago en Efectivo' }} />
      <Stack.Screen name="WaitingClientConfirmation" component={WaitingClientConfirmationScreen} options={{ headerShown: true, title: 'Esperando Confirmación' }} />
    </Stack.Navigator>
  );
}
