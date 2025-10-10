import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '../context/AuthContext';
import AuthStack from './AuthStack';
import ClientStack from './ClientStack';
import DriverStack from './DriverStack';

export default function AppNavigator() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <View style={styles.loading}>
        <ActivityIndicator size="large" color="#007AFF" />
      </View>
    );
  }

  // Si no hay usuario, mostrar pantallas de autenticación
  if (!user) {
    return <AuthStack />;
  }

  // Si el usuario es conductor, mostrar pantallas de conductor
  if (user.role === 'driver') {
    return <DriverStack />;
  }

  // Si el usuario es cliente, mostrar pantallas de cliente
  return <ClientStack />;
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#fff',
  },
});
