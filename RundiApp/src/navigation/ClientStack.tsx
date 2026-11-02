import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/shared/theme/useTheme';
import HomeScreen from '../screens/Client/HomeScreen'; //existe el .old
import HomeScreenOffers from '../screens/Client/HomeScreenOffers';
import SearchRideScreenNewDesign from '../screens/Client/SearchRideScreen';
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
import SupportChatScreen from '../screens/Shared/SupportChatScreen';
import SupportCallScreen from '../screens/Shared/SupportCallScreen';
import RideCallScreen from '../screens/Shared/RideCallScreen';
import SupportComplaintScreen from '../screens/Shared/SupportComplaintScreen';
import RideDetailsScreen from '../screens/Shared/RideDetailsScreen';
import SavedCardsScreen from '../screens/Shared/SavedCardsScreen';
import AddCardScreen from '../screens/Shared/AddCardScreen';
import InvoiceScreen from '../screens/Shared/InvoiceScreen';
import PhoneVerificationScreen from '../screens/Auth/PhoneVerificationScreen';
import DriverPhoneScreen from '../screens/Auth/DriverPhoneScreen';
import DriverDataScreen from '../screens/Auth/DriverDataScreen';
import RegisterConfirm from '../screens/Auth/RegisterDriverFormConfirm';
import type { RegistrationMethod, RegistrationAuthProvider } from './types';
import type { RecurringRide } from '../types/recurringRide';
import RecurringRidesScreen from '../screens/Client/RecurringRidesScreen';
import RecurringRideFormScreen from '../screens/Client/RecurringRideFormScreen';
import { useClientPresence } from '../hooks/shared/presence/useClientPresence';
import { useInitializeClientProfile } from '../hooks/client/ClientProfileSync/useClientProfileSync';
import PreflightCheckScreen from '../screens/Shared/PreflightCheckScreen';
import type { PreflightRouteConfig } from '../types/preflight';
import { Platform } from 'react-native';
import { useAuth } from '../hooks/shared/auth/useAuth';
import preflightService from '../services/ride/preflightService';

export type ClientStackParamList = {
  ClientPreflight: PreflightRouteConfig;
  ClientHome: undefined;
  HomeOffers: { rideId?: string } | undefined;
  SearchRide: { recurringRide?: RecurringRide } | undefined;
  RecurringRides: undefined;
  RecurringRideForm: { ride?: RecurringRide } | undefined;
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
    showDesignatedDriverEvidenceNotice?: boolean;
  };
  Payment: {
    rideId: string;
    amount: number;
    driverId?: string;
    driverName?: string;
    vehiclePlate?: string;
    driverPhoto?: string;
    isPendingPayment?: boolean;
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
    otherUserId?: string;
    otherUserName: string;
    otherUserPhone?: string;
  };
  SupportChat: {
    rideId?: string | null;
    initialCategory?: 'service' | 'driver' | 'payment' | 'app' | 'other';
    initialTitle?: string | null;
    complaintId?: string | null;
  } | undefined;
  SupportCall: {
    complaintId?: string | null;
    rideId?: string | null;
  } | undefined;
  RideCall: {
    rideId?: string | null;
    otherUserId?: string | null;
    otherUserName?: string | null;
    autoStart?: boolean;
  } | undefined;
  SupportComplaints: {
    initialTicketId?: string | null;
  } | undefined;
  RideDetails: {
    rideId: string;
  };
  SavedCards: undefined;
  AddCard: undefined;
  Invoice: {
    rideId: string;
  };
  PhoneVerification: {
    name: string;
    email?: string;
    phone: string;
    password?: string;
    role?: 'client' | 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified?: boolean;
    context?: 'register_phone' | 'add_phone' | 'register_upgrade_driver';
  };
  DriverPhone: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    context?: 'register_phone' | 'register_upgrade_driver';
  };
  DriverData: {
    name: string;
    email?: string;
    phone: string;
    password?: string;
    role: 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    googleIdToken?: string;
    phoneVerified: boolean;
    context?: 'register_driver' | 'register_upgrade_driver';
  };
  RegisterConfirm: {
    name: string;
    email?: string;
    phone?: string;
    password?: string;
    role: 'client' | 'driver';
    method: RegistrationMethod;
    authProvider: RegistrationAuthProvider;
    phoneVerified?: boolean;
    googleIdToken?: string;
    driverData?: any;
    vehicleData?: any;
    context?: 'register_driver' | 'register_upgrade_driver';
  };
};

const Stack = createNativeStackNavigator<ClientStackParamList>();

export default function ClientStack() {
  const { colors } = useTheme();
  const { user } = useAuth();
  // Mantener heartbeat del cliente en Realtime DB
  useClientPresence();
  // Inicializar perfil del cliente (cacheo automático en backend)
  useInitializeClientProfile();

  // Warm-ups: socket RTDB + callable de preflight corren en paralelo con
  // los checks locales del PreflightCheckScreen y el primer render.
  React.useEffect(() => {
    if (!user?.id) return;
    preflightService
      .warmPreflightData({ role: 'client', userId: user.id, platform: Platform.OS })
      .catch(() => {});
  }, [user?.id]);
  
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
      <Stack.Screen name="SearchRide" component={SearchRideScreenNewDesign} options={{ headerShown: false, title: 'Buscar viaje' }} />
      <Stack.Screen name="RecurringRides" component={RecurringRidesScreen} options={{ headerShown: false, title: 'Viajes recurrentes' }} />
      <Stack.Screen name="RecurringRideForm" component={RecurringRideFormScreen} options={{ headerShown: false, title: 'Viaje recurrente' }} />
      {/* <Stack.Screen name="RideConfirmation" component={RideConfirmationScreen} options={{ headerShown: true, title: 'Confirmación de Viaje' }} /> */}
      <Stack.Screen name="RideTracking" component={RideTrackingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Payment" component={PaymentScreen} options={{ headerShown: false, title: 'Pago' }} />
      <Stack.Screen name="CashPayment" component={CashPaymentScreen} options={{ headerShown: false, title: 'Pago en Efectivo' }} />
      <Stack.Screen name="PendingPayments" component={PendingPaymentsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RideHistory" component={ClientRideHistoryScreen} options={{ headerShown: false, title: 'Historial de Viajes' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: false, title: 'Calificar Viaje' }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: false, title: 'Métodos de Pago' }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false, title: 'Configuración' }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: false, title: 'Eliminar Cuenta' }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false, title: 'Ayuda' }} />
      <Stack.Screen name="Chat" component={ChatScreen} options={{ headerShown: true, title: 'Chat' }} />
      <Stack.Screen
        name="SupportChat"
        component={SupportChatScreen}
        options={{ headerShown: false, title: 'Atención al cliente' }}
      />
      <Stack.Screen
        name="SupportCall"
        component={SupportCallScreen}
        options={{ headerShown: false, title: 'Llamada de soporte' }}
      />
      <Stack.Screen
        name="RideCall"
        component={RideCallScreen}
        options={{ headerShown: false, title: 'Llamada del viaje' }}
      />
      <Stack.Screen
        name="SupportComplaints"
        component={SupportComplaintScreen}
        options={{ headerShown: false, title: 'Mis reportes' }}
      />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} options={{ headerShown: false, title: 'Detalles del Viaje' }} />
      <Stack.Screen name="SavedCards" component={SavedCardsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddCard" component={AddCardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Invoice" component={InvoiceScreen} options={{ headerShown: false, title: 'Factura' }} />
      <Stack.Screen
        name="PhoneVerification"
        component={PhoneVerificationScreen as React.ComponentType<any>}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="DriverPhone"
        component={DriverPhoneScreen as React.ComponentType<any>}
        options={{ headerShown: false, title: 'Teléfono para Conductor' }}
      />
      <Stack.Screen
        name="DriverData"
        component={DriverDataScreen as React.ComponentType<any>}
        options={{ headerShown: false, title: 'Datos del Conductor' }}
      />
      <Stack.Screen
        name="RegisterConfirm"
        component={RegisterConfirm as React.ComponentType<any>}
        options={{ headerShown: false, title: 'Confirmar Registro de Conductor' }}
      />
    </Stack.Navigator>
  );
}
