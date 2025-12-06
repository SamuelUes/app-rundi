import React, { useMemo } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '../../context/ThemeContext';

export type PermissionsExplanationProps = {
  role: 'driver' | 'client';
};

const PermissionsExplanation: React.FC<PermissionsExplanationProps> = ({ role }) => {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const isDriver = role === 'driver';

  return (
    <View style={styles.container}>
      <Text style={styles.sectionTitle}>Permisos que usamos y por qué</Text>
      <Text style={styles.sectionSubtitle}>
        Solo pedimos los permisos necesarios para que la app funcione de forma segura y confiable.
      </Text>

      <View style={styles.permissionBlock}>
        <Text style={styles.permissionTitle}>📍 Ubicación en todo momento</Text>
        <Text style={styles.permissionText}>
          Usamos tu ubicación para mostrar el mapa, calcular rutas y tiempos estimados, y encontrar viajes cercanos.
          {isDriver
            ? ' Como conductor, también la usamos en segundo plano para detectar viajes cercanos, mantener el viaje activo aunque la app no esté en primer plano y para funciones de seguridad.'
            : ' Como cliente, la usamos principalmente mientras la app está en uso para encontrar conductores cercanos y compartir tu ubicación durante el viaje.'}
        </Text>
      </View>

      {isDriver && (
        <View style={styles.permissionBlock}>
          <Text style={styles.permissionTitle}>🫧 Mostrar encima de otras apps (solo conductores)</Text>
          <Text style={styles.permissionText}>
            Este permiso nos permite mostrar una pequeña burbuja flotante cuando tienes un viaje activo o estás disponible
            como conductor, incluso si cambias a otra app. Así puedes volver rápidamente al viaje y mantener el seguimiento
            sin perder información importante.
          </Text>
          {Platform.OS === 'android' && (
            <Text style={styles.permissionNote}>
              En Android, este permiso se llama "Aparecer encima de otras apps" o "Mostrar sobre otras aplicaciones".
            </Text>
          )}
        </View>
      )}

      <View style={styles.permissionBlock}>
        <Text style={styles.permissionTitle}>🔔 Notificaciones</Text>
        <Text style={styles.permissionText}>
          Usamos las notificaciones para avisarte cuando:
        </Text>
        <Text style={styles.bullet}>• Se crea, acepta o actualiza un viaje.</Text>
        <Text style={styles.bullet}>• Llega tu conductor o cambia el estado del viaje.</Text>
        {isDriver && <Text style={styles.bullet}>• Hay viajes nuevos disponibles cerca de tu ubicación.</Text>}
        <Text style={styles.bullet}>• Hay mensajes importantes sobre tu cuenta o seguridad.</Text>
      </View>

      {isDriver && (
        <View style={styles.permissionBlock}>
          <Text style={styles.permissionTitle}>🏃 Actividad física / reconocimiento de actividad</Text>
          <Text style={styles.permissionText}>
            En algunos dispositivos Android, el permiso de actividad física se usa junto con la ubicación para mejorar la
            detección del movimiento del dispositivo y optimizar el uso de batería mientras se rastrean los viajes.
            No usamos estos datos para fines de salud, solo para mejorar la precisión y estabilidad del seguimiento del viaje.
          </Text>
        </View>
      )}
    </View>
  );
};

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      marginTop: 24,
      paddingHorizontal: 4,
    },
    sectionTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    sectionSubtitle: {
      fontSize: 13,
      color: colors.textSecondary,
      marginBottom: 12,
    },
    permissionBlock: {
      marginBottom: 12,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.surface,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
    },
    permissionTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    permissionText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    bullet: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
      marginTop: 2,
    },
    permissionNote: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.textSecondary,
      marginTop: 6,
    },
  });

export default PermissionsExplanation;
