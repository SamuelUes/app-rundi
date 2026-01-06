import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useTranslation } from 'react-i18next';

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
export const NoRidesEmptyState: React.FC<{ onAction?: () => void }> = ({ onAction }) => {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="🚗"
      title={t('common.components.emptyState.noRides.title')}
      message={t('common.components.emptyState.noRides.message')}
      actionText={onAction ? t('common.components.emptyState.noRides.action') : undefined}
      onAction={onAction}
    />
  );
};

/**
 * Empty State para Historial
 */
export const NoHistoryEmptyState: React.FC<{ onAction?: () => void }> = ({ onAction }) => {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="📋"
      title={t('common.components.emptyState.noHistory.title')}
      message={t('common.components.emptyState.noHistory.message')}
      actionText={onAction ? t('common.components.emptyState.noHistory.action') : undefined}
      onAction={onAction}
    />
  );
};

/**
 * Empty State para Notificaciones
 */
export const NoNotificationsEmptyState: React.FC = () => {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="🔔"
      title={t('common.components.emptyState.noNotifications.title')}
      message={t('common.components.emptyState.noNotifications.message')}
    />
  );
};

/**
 * Empty State para Búsqueda
 */
export const NoSearchResultsEmptyState: React.FC<{ searchTerm?: string }> = ({ searchTerm }) => {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="🔍"
      title={t('common.components.emptyState.noSearchResults.title')}
      message={
        searchTerm
          ? t('common.components.emptyState.noSearchResults.message', { term: searchTerm })
          : t('common.components.emptyState.noSearchResults.genericMessage')
      }
    />
  );
};

/**
 * Empty State para Conductores
 */
export const NoDriversEmptyState: React.FC = () => {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="👨‍✈️"
      title={t('common.components.emptyState.noDrivers.title')}
      message={t('common.components.emptyState.noDrivers.message')}
    />
  );
};

/**
 * Empty State para Conexión
 */
export const NoConnectionEmptyState: React.FC<{ onRetry?: () => void }> = ({ onRetry }) => {
  const { t } = useTranslation();
  return (
    <EmptyState
      icon="📡"
      title={t('common.components.emptyState.noConnection.title')}
      message={t('common.components.emptyState.noConnection.message')}
      actionText={onRetry ? t('common.components.emptyState.noConnection.action') : undefined}
      onAction={onRetry}
    />
  );
};

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
