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
      if (!user) navigation.replace('Auth');
      else if (user.role === 'client') navigation.replace('Client');
      else navigation.replace('Driver');
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
