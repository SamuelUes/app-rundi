import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';

import { useTheme } from '../../context/ThemeContext';
import { useAuth } from '../../context/AuthContext';
import type { DriverStackParamList } from '../../navigation/DriverStack';

export type NormalizedAccountStatus = 'active' | 'pending' | 'suspended' | 'rejected';
export type NormalizedDocumentsStatus = 'verified' | 'pending' | 'suspended' | 'rejected';

export type DriverApprovalInfo = {
  accountStatus: NormalizedAccountStatus;
  documentsStatus: NormalizedDocumentsStatus;
  hasActiveVehicle: boolean;
};

type Props = NativeStackScreenProps<DriverStackParamList, 'DriverPendingApproval'>;

const SUPPORT_PHONE = '+50512345678';

export default function DriverPendingApprovalScreen({ navigation, route }: Props) {
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const { logout } = useAuth();

  const approvalInfo: DriverApprovalInfo | undefined = route.params?.approvalInfo;

  const accountStatus: NormalizedAccountStatus = approvalInfo?.accountStatus ?? 'pending';
  const documentsStatus: NormalizedDocumentsStatus = approvalInfo?.documentsStatus ?? 'pending';
  const hasActiveVehicle = approvalInfo?.hasActiveVehicle ?? false;

  const isHardBlock =
    accountStatus === 'suspended' || accountStatus === 'rejected' || documentsStatus === 'rejected';

  const title = isHardBlock
    ? accountStatus === 'suspended'
      ? 'Cuenta suspendida'
      : 'Cuenta rechazada'
    : 'Tu cuenta está en revisión';

  const description = isHardBlock
    ? 'Tu cuenta no puede usarse por el momento. Por favor contacta a soporte para revisar tu caso.'
    : 'Estamos verificando tus documentos y vehículo. Este proceso puede tomar entre 24 y 48 horas.';

  const handleCallSupport = () => {
    Linking.openURL(`tel:${SUPPORT_PHONE}`);
  };

  const handleOpenProfile = () => {
    navigation.navigate('DriverProfile');
  };

  const handleReload = () => {
    navigation.replace('DriverPreflight', {
      role: 'driver',
      successRoute: 'DriverHome',
      activeRideRoute: 'ActiveRide',
      pendingPaymentsRoute: 'PendingPayments',
      payCommissionsRoute: 'PayCommissions',
      pendingApprovalRoute: 'DriverPendingApproval',
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  const renderStatusBadge = (label: string, value: string, color: string) => (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={[styles.statusBadge, { backgroundColor: color }]}>
        <Text style={styles.statusBadgeText}>{value}</Text>
      </View>
    </View>
  );

  const accountColor =
    accountStatus === 'active'
      ? '#16A34A'
      : accountStatus === 'pending'
      ? '#F59E0B'
      : '#EF4444';

  const documentsColor =
    documentsStatus === 'verified'
      ? '#16A34A'
      : documentsStatus === 'pending'
      ? '#F59E0B'
      : '#EF4444';

  const vehicleColor = hasActiveVehicle ? '#16A34A' : '#F59E0B';

  return (
    <View style={styles.container}>
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <Text style={styles.description}>{description}</Text>

        <View style={styles.statusContainer}>
          {renderStatusBadge(
            'Estado de cuenta',
            accountStatus === 'active'
              ? 'Activa'
              : accountStatus === 'pending'
              ? 'Pendiente'
              : accountStatus === 'suspended'
              ? 'Suspendida'
              : 'Rechazada',
            accountColor,
          )}

          {renderStatusBadge(
            'Documentos',
            documentsStatus === 'verified'
              ? 'Verificados'
              : documentsStatus === 'pending'
              ? 'Pendientes'
              : documentsStatus === 'suspended'
              ? 'Suspendidos'
              : 'Rechazados',
            documentsColor,
          )}

          {renderStatusBadge(
            'Vehículos',
            hasActiveVehicle ? 'Al menos un vehículo activo' : 'Sin vehículo activo aprobado',
            vehicleColor,
          )}
        </View>

        {isHardBlock && (
          <View style={styles.supportBox}>
            <Text style={styles.supportTitle}>Necesitas ayuda de soporte</Text>
            <Text style={styles.supportText}>
              Comunícate con nuestro equipo para revisar el estado de tu cuenta y tus documentos.
            </Text>

            <TouchableOpacity style={styles.supportButton} onPress={handleCallSupport}>
              <Text style={styles.supportButtonText}>Llamar a soporte</Text>
            </TouchableOpacity>
          </View>
        )}

        {!isHardBlock && (
          <View style={styles.infoBox}>
            <Text style={styles.infoText}>
              Te notificaremos cuando tu cuenta esté lista para comenzar a recibir viajes.
            </Text>
          </View>
        )}

        <TouchableOpacity style={styles.refreshButton} onPress={handleReload}>
          <Text style={styles.refreshButtonText}>Recarga para actualizar</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.footerButtons}>
        <TouchableOpacity style={styles.secondaryButton} onPress={handleOpenProfile}>
          <Text style={styles.secondaryButtonText}>Ver mi perfil</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.primaryButton} onPress={handleLogout}>
          <Text style={styles.primaryButtonText}>Cerrar sesión</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      padding: 24,
      justifyContent: 'space-between',
    },
    card: {
      borderRadius: 16,
      backgroundColor: colors.card,
      padding: 20,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 22,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    description: {
      fontSize: 14,
      color: colors.textSecondary,
      marginBottom: 16,
    },
    statusContainer: {
      marginTop: 8,
      marginBottom: 16,
      gap: 8,
    },
    statusRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    statusLabel: {
      fontSize: 14,
      color: colors.textSecondary,
      flex: 1,
    },
    statusBadge: {
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 999,
      minWidth: 110,
      alignItems: 'center',
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    supportBox: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.error + '10',
      borderWidth: 1,
      borderColor: colors.error,
      gap: 8,
    },
    supportTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    supportText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    supportButton: {
      marginTop: 4,
      paddingVertical: 10,
      borderRadius: 999,
      backgroundColor: '#1D4ED8',
      alignItems: 'center',
    },
    supportButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFFFFF',
    },
    infoBox: {
      marginTop: 8,
      padding: 12,
      borderRadius: 12,
      backgroundColor: colors.primary + '15',
      borderWidth: 1,
      borderColor: colors.primary,
    },
    infoText: {
      fontSize: 13,
      color: colors.textSecondary,
    },
    refreshButton: {
      marginTop: 12,
      paddingVertical: 10,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    refreshButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    footerButtons: {
      flexDirection: 'row',
      gap: 12,
    },
    secondaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
    },
    secondaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
    },
    primaryButton: {
      flex: 1,
      paddingVertical: 12,
      borderRadius: 999,
      backgroundColor: colors.primary,
      alignItems: 'center',
    },
    primaryButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: '#FFFFFF',
    },
  });
