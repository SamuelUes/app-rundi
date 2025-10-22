import React, { useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';
import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';

export default function SplashScreen({ navigation }: any) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { user } = useAuth();

  useEffect(() => {
    const t = setTimeout(() => {
      console.log('🔍 SplashScreen - Usuario:', JSON.stringify(user, null, 2));
      console.log('🔍 SplashScreen - Rol:', user?.role);
      console.log('🔍 SplashScreen - Tipo de rol:', typeof user?.role);
      console.log('🔍 SplashScreen - Comparación roles:');
      console.log('   - user.role === "client":', user?.role === 'client');
      console.log('   - user.role === "driver":', user?.role === 'driver');
      console.log('   - user.role === "designated_driver":', user?.role === 'designated_driver');
      
      if (!user) {
        console.log('❌ No hay usuario, ir a Auth');
        navigation.replace('Auth');
      } else if (user.role === 'client') {
        console.log('👤 Usuario es cliente, ir a Client');
        navigation.replace('Client');
      } else if (user.role === 'driver' || user.role === 'designated_driver') {
        console.log(`🚗 Usuario es ${user.role}, ir a Driver`);
        navigation.replace('Driver');
      } else {
        console.log('⚠️ Rol desconocido:', user.role);
        console.log('⚠️ Roles disponibles: client, driver, designated_driver');
        navigation.replace('Auth');
      }
    }, 600);
    return () => clearTimeout(t);
  }, [navigation, user]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>App Uber</Text>
      <Text>Cargando...</Text>
      <ActivityIndicator size="large" color={colors.primary} />
    </View>
  );
}

const createStyles = (colors: any) => StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background, },
  title: { fontSize: 24, fontWeight: '800', marginBottom: 8 },
});
