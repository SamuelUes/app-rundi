import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import DriverHomeScreen from '../screens/Driver/DriverHomeScreenNewDesign';
import RideRequestsScreen from '../screens/Driver/RideRequestsScreen';
import AvailableRidesScreen from '../screens/Driver/AvailableRidesScreen';
import ActiveRideScreen from '../screens/Driver/ActiveRideScreen';
import EarningsScreen from '../screens/Driver/EarningsScreen';
import VehicleVerificationScreen from '../screens/Driver/VehicleVerificationScreen';
import DriversDocumentsInspectionScreen from '../screens/Driver/DriversDocumentsInspectionScreen';
import DriverProfileScreen from '../screens/Driver/DriverProfileScreen';
import ProfileScreen from '../screens/Shared/ProfileScreen';
import RideHistoryScreen from '../screens/Shared/RideHistoryScreen';
import RatingScreen from '../screens/Shared/RatingScreen';
import PaymentMethodsScreen from '../screens/Shared/PaymentMethodsScreen';
import AddCardScreen from '../screens/Shared/AddCardScreen';
import SavedCardsScreen from '../screens/Shared/SavedCardsScreen';
import SettingsScreen from '../screens/Shared/SettingsScreen';
import DeleteAccountScreen from '../screens/Shared/DeleteAccountScreen';
import HelpScreen from '../screens/Shared/HelpScreen';
import ChatScreen from '../screens/Shared/ChatScreen';
import CompleteVehicleInfoScreen from '../screens/Shared/CompleteVehicleInfoScreen';
import RideDetailsScreen from '../screens/Shared/RideDetailsScreen';
import PaymentConfirmationScreen from '../screens/Driver/PaymentConfirmationScreen';
import WaitingClientConfirmationScreen from '../screens/Driver/WaitingClientConfirmationScreen';

export type DriverStackParamList = {
  DriverHome: undefined;
  RideRequests: undefined;
  AvailableRides: undefined;
  ActiveRide: {
    rideId: string;
  };
  Earnings: undefined;
  VehicleVerification: {
    vehicleId: string;
  };
  DriversDocumentsInspection: undefined;
  DriverProfile: undefined;
  Profile: undefined;
  RideHistory: undefined;
  Rating: {
    rideId: string;
  };
  PaymentMethods: undefined;
  AddCard: undefined;
  SavedCards: undefined;
  Settings: undefined;
  DeleteAccount: undefined;
  Help: undefined;
  Chat: {
    rideId: string;
    otherUserName: string;
  };
  CompleteVehicleInfo: undefined;
  RideDetails: {
    rideId: string;
  };
  PaymentConfirmation: {
    rideId: string;
    amount: number;
    tip?: number;
    clientName: string;
    paymentMethod: 'cash' | 'card';
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
      <Stack.Screen name="VehicleVerification" component={VehicleVerificationScreen} options={{ title: 'Verificación del Vehículo' }} />
      <Stack.Screen name="DriversDocumentsInspection" component={DriversDocumentsInspectionScreen} options={{ title: 'Documentos del Conductor' }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Ganancias' }} />
      <Stack.Screen name="DriverProfile" component={DriverProfileScreen} options={{ headerShown: true, title: 'Mi Perfil' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Perfil' }} />
      <Stack.Screen name="RideHistory" component={RideHistoryScreen} options={{ headerShown: true, title: 'Historial de Viajes' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: true, title: 'Calificar' }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: true, title: 'Métodos de Pago' }} />
      <Stack.Screen name="AddCard" component={AddCardScreen} options={{ headerShown: true, title: 'Agregar Tarjeta' }} />
      <Stack.Screen name="SavedCards" component={SavedCardsScreen} options={{ headerShown: true, title: 'Tarjetas Guardadas' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Configuración' }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: true, title: 'Eliminar Cuenta' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: true, title: 'Ayuda' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
      <Stack.Screen name="CompleteVehicleInfo" component={CompleteVehicleInfoScreen} options={{ headerShown: true, title: 'Completar Información' }} />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} options={{ headerShown: true, title: 'Detalles del Viaje' }} />
      <Stack.Screen name="PaymentConfirmation" component={PaymentConfirmationScreen} options={{ headerShown: true, title: 'Confirmación de Pago' }} />
      <Stack.Screen name="WaitingClientConfirmation" component={WaitingClientConfirmationScreen} options={{ headerShown: true, title: 'Esperando Confirmación' }} />
    </Stack.Navigator>
  );
}
