import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';

interface EmptyStateProps {
  icon?: string;
  title: string;
  message: string;
  actionText?: string;
  onAction?: () => void;
}

/**
 * Componente de Empty State
 * Muestra un mensaje elegante cuando no hay datos
 */
export const EmptyState: React.FC<EmptyStateProps> = ({
  icon = '📭',
  title,
  message,
  actionText,
  onAction,
}) => {
  const { colors } = useTheme();

  return (
    <View style={styles.container}>
      <Text style={styles.icon}>{icon}</Text>
      <Text style={[styles.title, { color: colors.text }]}>{title}</Text>
      <Text style={[styles.message, { color: colors.textSecondary }]}>{message}</Text>
      
      {actionText && onAction && (
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={onAction}
        >
          <Text style={styles.buttonText}>{actionText}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

/**
 * Empty State para Viajes
 */
export const NoRidesEmptyState: React.FC<{ onAction?: () => void }> = ({ onAction }) => (
  <EmptyState
    icon="🚗"
    title="No hay viajes disponibles"
    message="Cuando haya nuevos viajes, aparecerán aquí"
    actionText={onAction ? "Actualizar" : undefined}
    onAction={onAction}
  />
);

/**
 * Empty State para Historial
 */
export const NoHistoryEmptyState: React.FC<{ onAction?: () => void }> = ({ onAction }) => (
  <EmptyState
    icon="📋"
    title="Sin historial de viajes"
    message="Tus viajes completados aparecerán aquí"
    actionText={onAction ? "Solicitar viaje" : undefined}
    onAction={onAction}
  />
);

/**
 * Empty State para Notificaciones
 */
export const NoNotificationsEmptyState: React.FC = () => (
  <EmptyState
    icon="🔔"
    title="No tienes notificaciones"
    message="Te avisaremos cuando haya algo nuevo"
  />
);

/**
 * Empty State para Búsqueda
 */
export const NoSearchResultsEmptyState: React.FC<{ searchTerm?: string }> = ({ searchTerm }) => (
  <EmptyState
    icon="🔍"
    title="Sin resultados"
    message={searchTerm ? `No encontramos resultados para "${searchTerm}"` : "Intenta con otra búsqueda"}
  />
);

/**
 * Empty State para Conductores
 */
export const NoDriversEmptyState: React.FC = () => (
  <EmptyState
    icon="👨‍✈️"
    title="No hay conductores disponibles"
    message="Intenta de nuevo en unos momentos"
  />
);

/**
 * Empty State para Conexión
 */
export const NoConnectionEmptyState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => (
  <EmptyState
    icon="📡"
    title="Sin conexión"
    message="Verifica tu conexión a internet e intenta de nuevo"
    actionText={onRetry ? "Reintentar" : undefined}
    onAction={onRetry}
  />
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  icon: {
    fontSize: 64,
    marginBottom: 16,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
  message: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 20,
  },
  button: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
