import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';

export default function WebNotice() {
  if (Platform.OS !== 'web') return null;

  return (
    <View style={styles.container}>
      <View style={styles.notice}>
        <Text style={styles.title}>📱 Modo Web - Funcionalidad Limitada</Text>
        <Text style={styles.text}>
          Esta app está diseñada para dispositivos móviles con GPS.
        </Text>
        <Text style={styles.text}>
          En web no están disponibles:
        </Text>
        <Text style={styles.bullet}>• 🗺️ Mapas de Google (react-native-maps)</Text>
        <Text style={styles.bullet}>• 📍 GPS en tiempo real</Text>
        <Text style={styles.bullet}>• 🚗 Tracking de conductores</Text>
        
        <View style={styles.separator} />
        
        <Text style={styles.recommendTitle}>Para probar la app completa:</Text>
        <Text style={styles.recommend}>
          1. Descarga <Text style={styles.bold}>Expo Go</Text> en tu teléfono Android/iOS
        </Text>
        <Text style={styles.recommend}>
          2. Escanea el código QR de la terminal
        </Text>
        <Text style={styles.recommend}>
          3. ¡Disfruta de todas las funcionalidades!
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    padding: 20,
  },
  notice: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 24,
    maxWidth: 600,
    marginHorizontal: 'auto',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 16,
    textAlign: 'center',
  },
  text: {
    fontSize: 16,
    marginBottom: 8,
    color: '#333',
  },
  bullet: {
    fontSize: 14,
    marginLeft: 16,
    marginBottom: 4,
    color: '#666',
  },
  separator: {
    height: 1,
    backgroundColor: '#e0e0e0',
    marginVertical: 16,
  },
  recommendTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
    color: '#000',
  },
  recommend: {
    fontSize: 14,
    marginBottom: 6,
    color: '#555',
  },
  bold: {
    fontWeight: '700',
  },
});
