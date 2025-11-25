import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import HomeScreen from '../screens/Client/HomeScreenNewDesign'; //existe el .old
import HomeScreenOffers from '../screens/Client/HomeScreenOffers';
import SearchRideScreenNewDesign from '../screens/Client/SearchRideScreenNewDesign';
// import RideConfirmationScreen from '../screens/Client/RideConfirmationScreen'; //existe el .old
import RideTrackingScreen from '../screens/Client/RideTrackingScreenNewDesign';
import PaymentScreen from '../screens/Client/PaymentScreen'; //existe el .old
import CashPaymentScreen from '../screens/Client/CashPaymentScreen'; //existe el .old
import PendingPaymentsScreen from '../screens/Client/PendingPaymentsScreen';
import ProfileScreen from '../screens/Shared/ProfileScreen';
import ClientRideHistoryScreen from '../screens/Client/ClientRideHistoryScreen';
import RatingScreen from '../screens/Shared/RatingScreen';
import PaymentMethodsScreen from '../screens/Shared/PaymentMethodsScreen';
import SettingsScreen from '../screens/Shared/SettingsScreen';
import AccountScreen from '../screens/Shared/AccountScreen';
import DeleteAccountScreen from '../screens/Shared/DeleteAccountScreen';
import HelpScreen from '../screens/Shared/HelpScreen';
import ChatScreen from '../screens/Shared/ChatScreen';
import RideDetailsScreen from '../screens/Shared/RideDetailsScreen';
import SavedCardsScreen from '../screens/Shared/SavedCardsScreen';
import AddCardScreen from '../screens/Shared/AddCardScreen';
import InvoiceScreen from '../screens/Shared/InvoiceScreen';
import { useClientPresence } from '../hooks/useClientPresence';
import { useInitializeClientProfile } from '../hooks/useClientProfileSync';
import PreflightCheckScreen from '../screens/Shared/PreflightCheckScreen';
import type { PreflightRouteConfig } from '../types/preflight';

export type ClientStackParamList = {
  ClientPreflight: PreflightRouteConfig;
  ClientHome: undefined;
  HomeOffers: { rideId?: string } | undefined;
  SearchRide: undefined;
  RideConfirmation: {
    rideId: string;
  };
  RideTracking: {
    rideId: string;
    driverId: string;
    driverName: string;
    vehiclePlate: string;
    vehicleBrand?: string;
    vehicleModel?: string;
    vehicleColor?: string;
    estimatedFare?: number;
  };
  Payment: {
    rideId: string;
    amount: number;
    driverId?: string;
    driverName?: string;
    vehiclePlate?: string;
    driverPhoto?: string;
  };
  CashPayment: {
    rideId: string;
    amount: number;
    tip?: number;
    driverName: string;
    driverPhoto?: string;
  };
  PendingPayments: undefined;
  Profile: undefined;
  RideHistory: undefined;
  Rating: {
    rideId: string;
  };
  PaymentMethods: undefined;
  Settings: undefined;
  Account: undefined;
  DeleteAccount: undefined;
  Help: undefined;
  Chat: {
    rideId: string;
    otherUserName: string;
    otherUserPhone?: string;
  };
  RideDetails: {
    rideId: string;
  };
  SavedCards: undefined;
  AddCard: undefined;
  Invoice: {
    rideId: string;
  };
};

const Stack = createNativeStackNavigator<ClientStackParamList>();

export default function ClientStack() {
  const { colors } = useTheme();
  // Mantener heartbeat del cliente en Realtime DB
  useClientPresence();
  // Inicializar perfil del cliente (cacheo automático en backend)
  useInitializeClientProfile();
  
  return (
    <Stack.Navigator 
      initialRouteName="ClientPreflight"
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
        name="ClientPreflight"
        component={PreflightCheckScreen as React.ComponentType<any>}
        options={{ headerShown: false }}
        initialParams={{
          role: 'client',
          successRoute: 'ClientHome',
          activeRideRoute: 'RideTracking',
          pendingPaymentsRoute: 'PendingPayments',
          rideTrackingRoute: 'RideTracking',
        }}
      />
      <Stack.Screen name="ClientHome" component={HomeScreen} />
      <Stack.Screen name="HomeOffers" component={HomeScreenOffers} options={{ headerShown: false }} />
      <Stack.Screen name="SearchRide" component={SearchRideScreenNewDesign} options={{ headerShown: true, title: 'Buscar viaje' }} />
      {/* <Stack.Screen name="RideConfirmation" component={RideConfirmationScreen} options={{ headerShown: true, title: 'Confirmación de Viaje' }} /> */}
      <Stack.Screen name="RideTracking" component={RideTrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: true, title: 'Pago' }} />
      <Stack.Screen name="CashPayment" component={CashPaymentScreen} options={{ headerShown: true, title: 'Pago en Efectivo' }} />
      <Stack.Screen name="PendingPayments" component={PendingPaymentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Perfil' }} />
      <Stack.Screen name="RideHistory" component={ClientRideHistoryScreen} options={{ headerShown: true, title: 'Historial de Viajes' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: true, title: 'Calificar Viaje' }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: true, title: 'Métodos de Pago' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Configuración' }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ headerShown: true, title: 'Mi cuenta' }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: true, title: 'Eliminar Cuenta' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: true, title: 'Ayuda' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} options={{ headerShown: true, title: 'Detalles del Viaje' }} />
      <Stack.Screen name="SavedCards" component={SavedCardsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddCard" component={AddCardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Invoice" component={InvoiceScreen} options={{ headerShown: true, title: 'Factura' }} />
    </Stack.Navigator>
  );
}
