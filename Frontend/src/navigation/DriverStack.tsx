import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useTheme } from '../hooks/shared/theme/useTheme';
import DriverHomeScreen from '../screens/Driver/DriverHomeScreen';
import RideRequestsScreen from '../screens/Driver/RideRequestsScreen';
import AvailableRidesScreen from '../screens/Driver/AvailableRidesScreen';
import ActiveRideScreen from '../screens/Driver/ActiveRideScreen';
import FollowerActiveRideScreen from '../screens/Driver/FollowerActiveRideScreen';
import RidePreviewScreen from '../screens/Driver/RidePreviewScreen';
import EarningsScreen from '../screens/Driver/EarningsScreen';
import VehicleVerificationScreen from '../screens/Driver/VehicleVerificationScreen';
import DriversDocumentsInspectionScreen from '../screens/Driver/DriversDocumentsInspectionScreen';
import DriverProfileScreen from '../screens/Driver/DriverProfileScreen';
import ProfileScreen from '../screens/Shared/ProfileScreen';
import RideHistoryScreen from '../screens/Driver/RideHistoryScreen';
import TodayRidesScreen from '../screens/Driver/TodayRidesScreen';
import VehicleInspectionScreen from '../screens/Driver/VehicleInspectionScreen';
import RatingScreen from '../screens/Shared/RatingScreen';
import PaymentMethodsScreen from '../screens/Shared/PaymentMethodsScreen';
import AddCardScreen from '../screens/Shared/AddCardScreen';
import SavedCardsScreen from '../screens/Shared/SavedCardsScreen';
import SettingsScreen from '../screens/Shared/SettingsScreen';
import AccountScreen from '../screens/Shared/AccountScreen';
import DeleteAccountScreen from '../screens/Shared/DeleteAccountScreen';
import HelpScreen from '../screens/Shared/HelpScreen';
import ChatScreen from '../screens/Shared/ChatScreen';
import SupportChatScreen from '../screens/Shared/SupportChatScreen';
import SupportCallScreen from '../screens/Shared/SupportCallScreen';
import RideCallScreen from '../screens/Shared/RideCallScreen';
import SupportComplaintScreen from '../screens/Shared/SupportComplaintScreen';
import CompleteVehicleInfoScreen from '../screens/Shared/CompleteVehicleInfoScreen';
import RideDetailsScreen from '../screens/Shared/RideDetailsScreen';
import PreflightCheckScreen from '../screens/Shared/PreflightCheckScreen';
import DriverPendingApprovalScreen from '../screens/Driver/DriverPendingApprovalScreen';
import type { PreflightRouteConfig } from '../types/preflight';
import PaymentConfirmationScreen from '../screens/Driver/PaymentConfirmationScreen';
import WaitingClientConfirmationScreen from '../screens/Driver/WaitingClientConfirmationScreen';
import RechargeFundsScreen from '../screens/Driver/RechargeFundsScreen';
import PayCommissionsScreen from '../screens/Driver/PayCommissionsScreen';
import PendingPaymentsScreen from '../screens/Client/PendingPaymentsScreen';
import PhoneVerificationScreen from '../screens/Auth/PhoneVerificationScreen';
import type { RegistrationMethod, RegistrationAuthProvider } from './types';
import { useOverlayVisibilityOnBackground } from '../hooks/shared/overlay/useOverlayVisibilityOnBackground';
import { useOverlayDeepLink } from '../hooks/shared/overlay/useOverlayDeepLink';
import proximityService from '../services/proximityService';

export type DriverStackParamList = {
  DriverPreflight: PreflightRouteConfig | undefined;
  DriverHome: undefined;
  DriverPendingApproval:
    | {
        approvalInfo?: {
          accountStatus: 'active' | 'pending' | 'suspended' | 'rejected';
          documentsStatus: 'verified' | 'pending' | 'suspended' | 'rejected';
          hasActiveVehicle: boolean;
        };
      }
    | undefined;
  RideRequests: undefined;
  AvailableRides: undefined;
  ActiveRide: {
    rideId: string;
  };
  FollowerActiveRide: {
    rideId: string;
  };
  RidePreview: {
    ride: {
      id: string;
      clientId: string;
      clientName?: string;
      clientPhone?: string;
      origin: { lat: number; lng: number; address?: string };
      destination: { lat: number; lng: number; address?: string };
      extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
      estimatedPrice: number;
      estimatedDistance?: number;
      estimatedDuration?: number;
      clientSuggestedPrice?: number;
      driverOfferedPrice?: number | null;
      paymentMethod?: 'cash' | 'card';
    };
    nearbyRides?: any[]; // Opcional: siguientes solicitudes cercanas para rotar entre ellas
    proximity?: boolean; // Si viene desde viaje por aproximación
    autoPresented?: boolean; // Abierto automáticamente por proximidad (se auto-cierra tras 6s sin cambios)
  };
  Earnings: undefined;
  VehicleVerification: {
    vehicleId: string;
  };
  DriversDocumentsInspection: undefined;
  DriverProfile: undefined;
  Profile: undefined;
  RideHistory: undefined;
  TodayRides: undefined;
  VehicleInspection: {
    rideId: string;
    clientName?: string;
    clientVehicleInfo?: string;
  };
  Rating: {
    rideId: string;
  };
  PaymentMethods: undefined;
  AddCard: undefined;
  SavedCards: undefined;
  Settings: undefined;
  Account: undefined;
  DeleteAccount: undefined;
  Help: undefined;
  Chat: {
    rideId: string;
    otherUserId?: string;
    otherUserName: string;
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
    extraDestinations?: Array<{ lat: number; lng: number; address?: string }>;
  };
  RechargeFunds: undefined;
  PayCommissions: undefined;
  PendingPayments: undefined;
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
};

const Stack = createNativeStackNavigator<DriverStackParamList>();

export default function DriverStack() {
  const { colors } = useTheme();
  // Sistema de overlay SIMPLIFICADO - Solo cleanup al volver a foreground
  const [overlayEnabled, setOverlayEnabledState] = React.useState<boolean>(false);

  React.useEffect(() => {
    let cancelled = false;

    // Cargar preferencia sin delays innecesarios
    proximityService.getOverlayEnabled()
      .then(enabled => {
        if (!cancelled) {
          setOverlayEnabledState(enabled);
          console.log(`✅ [DriverStack] Overlay preference loaded: ${enabled}`);
        }
      })
      .catch(err => {
        console.warn('[DriverStack] Error loading overlay preference:', err);
      });

    const unsubscribe = proximityService.subscribeOverlayEnabled((enabled) => {
      if (!cancelled) {
        setOverlayEnabledState(enabled);
        console.log(`🔄 [DriverStack] Overlay preference updated: ${enabled}`);
      }
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  // Hook simplificado - solo limpia al volver a foreground
  useOverlayVisibilityOnBackground(overlayEnabled);
  // Hook para detectar cuando se toca la burbuja flotante
  useOverlayDeepLink();

  return (
      <Stack.Navigator
        initialRouteName="DriverPreflight"
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
        name="DriverPreflight"
        component={PreflightCheckScreen as React.ComponentType<any>}
        options={{ headerShown: false }}
        initialParams={{
          role: 'driver',
          successRoute: 'DriverHome',
          activeRideRoute: 'ActiveRide',
          pendingPaymentsRoute: 'PendingPayments',
          rechargeFundsRoute: 'RechargeFunds',
          pendingApprovalRoute: 'DriverPendingApproval',
        }}
      />
      <Stack.Screen
        name="DriverPendingApproval"
        component={DriverPendingApprovalScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="DriverHome" component={DriverHomeScreen} options={{ title: 'Conductor' }} />
      <Stack.Screen name="AvailableRides" component={AvailableRidesScreen} options={{ title: 'Viajes Disponibles' }} />
      <Stack.Screen name="ActiveRide" component={ActiveRideScreen} options={{ title: 'Viaje Activo' }} />
      <Stack.Screen name="FollowerActiveRide" component={FollowerActiveRideScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RidePreview" component={RidePreviewScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RideRequests" component={RideRequestsScreen} options={{ title: 'Solicitudes' }} />
      <Stack.Screen name="VehicleVerification" component={VehicleVerificationScreen} options={{ title: 'Verificación del Vehículo' }} />
      <Stack.Screen name="DriversDocumentsInspection" component={DriversDocumentsInspectionScreen} options={{ title: 'Documentos del Conductor' }} />
      <Stack.Screen name="Earnings" component={EarningsScreen} options={{ title: 'Ganancias' }} />
      <Stack.Screen name="DriverProfile" component={DriverProfileScreen} options={{title: 'Mi Perfil' }} />
      <Stack.Screen name="Profile" component={ProfileScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RideHistory" component={RideHistoryScreen} options={{ headerShown: false }} />
      <Stack.Screen name="TodayRides" component={TodayRidesScreen} options={{ title: 'Viajes de Hoy' }} />
      <Stack.Screen name="VehicleInspection" component={VehicleInspectionScreen} options={{ title: 'Inspección del Vehículo' }} />
      <Stack.Screen name="Rating" component={RatingScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PaymentMethods" component={PaymentMethodsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="AddCard" component={AddCardScreen} options={{ headerShown: false }} />
      <Stack.Screen name="SavedCards" component={SavedCardsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Account" component={AccountScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Settings" component={SettingsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="DeleteAccount" component={DeleteAccountScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Help" component={HelpScreen} options={{ headerShown: false }} />
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
      <Stack.Screen name="CompleteVehicleInfo" component={CompleteVehicleInfoScreen} options={{ headerShown: false }} />
      <Stack.Screen name="RideDetails" component={RideDetailsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PaymentConfirmation" component={PaymentConfirmationScreen} options={{ headerShown: false }} />
      <Stack.Screen name="WaitingClientConfirmation" component={WaitingClientConfirmationScreen} options={{ headerShown:false }} />
      <Stack.Screen name="RechargeFunds" component={RechargeFundsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PayCommissions" component={PayCommissionsScreen} options={{ headerShown: false }} />
      <Stack.Screen name="PendingPayments" component={PendingPaymentsScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="PhoneVerification"
        component={PhoneVerificationScreen as React.ComponentType<any>}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
