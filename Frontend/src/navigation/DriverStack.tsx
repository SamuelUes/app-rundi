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
    </Stack.Navigator>
  );
}
