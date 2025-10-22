import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../context/ThemeContext';
import HomeScreen from '../screens/Client/HomeScreen'; //existe el .old
import SearchRideScreen from '../screens/Client/SearchRideScreen'; //existe el .old
import RideConfirmationScreen from '../screens/Client/RideConfirmationScreen'; //existe el .old
import RideTrackingScreen from '../screens/Client/RideTrackingScreen';
import PaymentScreen from '../screens/Client/PaymentScreen'; //existe el .old
import CashPaymentScreen from '../screens/Client/CashPaymentScreen'; //existe el .old
import PendingPaymentsScreen from '../screens/Client/PendingPaymentsScreen';
import ProfileScreen from '../screens/Shared/ProfileScreen';
import ClientRideHistoryScreen from '../screens/Client/ClientRideHistoryScreen';
import RatingScreen from '../screens/Shared/RatingScreen';
import PaymentMethodsScreen from '../screens/Shared/PaymentMethodsScreen';
import SettingsScreen from '../screens/Shared/SettingsScreen';
import DeleteAccountScreen from '../screens/Shared/DeleteAccountScreen';
import HelpScreen from '../screens/Shared/HelpScreen';
import ChatScreen from '../screens/Shared/ChatScreen';
import RideDetailsScreen from '../screens/Shared/RideDetailsScreen';
import SavedCardsScreen from '../screens/Shared/SavedCardsScreen';
import AddCardScreen from '../screens/Shared/AddCardScreen';

export type ClientStackParamList = {
  ClientHome: undefined;
  SearchRide: undefined;
  RideConfirmation: {
    rideId: string;
  };
  RideTracking: {
    rideId: string;
    driverId: string;
    driverName: string;
    vehiclePlate: string;
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
};

const Stack = createNativeStackNavigator<ClientStackParamList>();

export default function ClientStack() {
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
      <Stack.Screen name="ClientHome" component={HomeScreen} />
      <Stack.Screen name="SearchRide" component={SearchRideScreen} options={{ headerShown: true, title: 'Buscar viaje' }} />
      <Stack.Screen name="RideConfirmation" component={RideConfirmationScreen} options={{ headerShown: true, title: 'Confirmación de Viaje' }} />
      <Stack.Screen name="RideTracking" component={RideTrackingScreen} options={{ headerShown: true, title: 'Tracking en vivo' }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: true, title: 'Pago' }} />
      <Stack.Screen name="CashPayment" component={CashPaymentScreen} options={{ headerShown: true, title: 'Pago en Efectivo' }} />
      <Stack.Screen name="PendingPayments" component={PendingPaymentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: true, title: 'Perfil' }} />
      <Stack.Screen name="RideHistory" component={ClientRideHistoryScreen} options={{ headerShown: true, title: 'Historial de Viajes' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: true, title: 'Calificar Viaje' }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: true, title: 'Métodos de Pago' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: true, title: 'Configuración' }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: true, title: 'Eliminar Cuenta' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: true, title: 'Ayuda' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} options={{ headerShown: true, title: 'Detalles del Viaje' }} />
      <Stack.Screen name="SavedCards" component={SavedCardsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddCard" component={AddCardScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
