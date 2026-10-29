import React, { useMemo } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Linking, ScrollView } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useTranslation } from 'react-i18next';

import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import type { DriverStackParamList } from '../../navigation/DriverStack';
import SupportChatShortcut from '../../components/shared/SupportChatShortcut';

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
  const { colors, isDark } = useTheme();
  const logoutColor = isDark ? '#FF8A80' : '#B42318';
  const styles = useMemo(() => createStyles(colors, logoutColor), [colors, logoutColor]);
  const { logout } = useAuth();
  const { t } = useTranslation();
  const ns = 'driver.driverPendingApproval';

  const approvalInfo: DriverApprovalInfo | undefined = route.params?.approvalInfo;

  const accountStatus: NormalizedAccountStatus = approvalInfo?.accountStatus ?? 'pending';
  const documentsStatus: NormalizedDocumentsStatus = approvalInfo?.documentsStatus ?? 'pending';
  const hasActiveVehicle = approvalInfo?.hasActiveVehicle ?? false;

  const isHardBlock =
    accountStatus === 'suspended' || accountStatus === 'rejected' || documentsStatus === 'rejected';

  const title = isHardBlock
    ? accountStatus === 'suspended'
      ? t(`${ns}.header.suspendedTitle`)
      : t(`${ns}.header.rejectedTitle`)
    : t(`${ns}.header.pendingTitle`);

  const description = isHardBlock
    ? t(`${ns}.header.blockedDescription`)
    : t(`${ns}.header.pendingDescription`);

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
      rechargeFundsRoute: 'RechargeFunds',
      pendingApprovalRoute: 'DriverPendingApproval',
    });
  };

  const handleLogout = async () => {
    await logout();
  };

  const renderStatusBadge = (label: string, value: string, color: string) => (
    <View style={styles.statusRow}>
      <Text style={styles.statusLabel}>{label}</Text>
      <View style={[styles.statusBadge, { backgroundColor: `${color}18` }]}>
        <View style={[styles.statusDot, { backgroundColor: color }]} />
        <Text style={styles.statusBadgeText}>{value}</Text>
      </View>
    </View>
  );

  const accountColor =
    accountStatus === 'active'
      ? colors.success
      : accountStatus === 'pending'
      ? colors.warning
      : colors.error;

  const documentsColor =
    documentsStatus === 'verified'
      ? colors.success
      : documentsStatus === 'pending'
      ? colors.warning
      : colors.error;

  const vehicleColor = hasActiveVehicle ? colors.success : colors.warning;
  const headerColor = isHardBlock ? colors.error : colors.primary;
  const headerIcon = isHardBlock ? 'report-problem' : 'schedule';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.content}>
          <View style={styles.statusCard}>
            <View style={styles.header}>
              <View style={[styles.headerIcon, { backgroundColor: `${headerColor}18` }]}>
                <MaterialIcons name={headerIcon} size={26} color={headerColor} />
              </View>
              <View style={styles.headerText}>
                <Text style={styles.title}>{title}</Text>
                <Text style={styles.description}>{description}</Text>
              </View>
            </View>

            <View style={styles.statusContainer}>
              {renderStatusBadge(
                t(`${ns}.status.accountLabel`),
                t(`${ns}.status.accountValues.${accountStatus}`),
                accountColor,
              )}

              {renderStatusBadge(
                t(`${ns}.status.documentsLabel`),
                t(`${ns}.status.documentsValues.${documentsStatus}`),
                documentsColor,
              )}

              {renderStatusBadge(
                t(`${ns}.status.vehicleLabel`),
                hasActiveVehicle
                  ? t(`${ns}.status.vehicleValues.active`)
                  : t(`${ns}.status.vehicleValues.none`),
                vehicleColor,
              )}
            </View>

            {isHardBlock ? (
              <View style={styles.supportBox}>
                <Text style={styles.supportTitle}>{t(`${ns}.supportBasic.title`)}</Text>
                <Text style={styles.supportText}>{t(`${ns}.supportBasic.description`)}</Text>
                <TouchableOpacity
                  style={styles.supportButton}
                  onPress={handleCallSupport}
                  accessibilityRole="button"
                >
                  <MaterialIcons name="call" size={18} color="#241B0B" />
                  <Text style={styles.supportButtonText}>
                    {t(`${ns}.supportBasic.button`)}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <View style={styles.infoBox}>
                <MaterialIcons name="info-outline" size={20} color={colors.primary} />
                <Text style={styles.infoText}>{t(`${ns}.info.text`)}</Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={styles.refreshButton}
            onPress={handleReload}
            accessibilityRole="button"
          >
            <MaterialIcons name="refresh" size={20} color="#241B0B" />
            <Text style={styles.refreshButtonText}>{t(`${ns}.buttons.refresh`)}</Text>
          </TouchableOpacity>

          <View style={styles.secondaryActions}>
            <TouchableOpacity
              style={styles.profileButton}
              onPress={handleOpenProfile}
              accessibilityRole="button"
            >
              <Text style={styles.profileButtonText}>{t(`${ns}.buttons.viewProfile`)}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.logoutButton}
              onPress={handleLogout}
              activeOpacity={0.75}
              accessibilityRole="button"
            >
              <MaterialIcons name="logout" size={18} color={logoutColor} />
              <Text style={styles.logoutButtonText}>{t(`${ns}.buttons.logout`)}</Text>
            </TouchableOpacity>
          </View>

          <SupportChatShortcut
            style={styles.supportChat}
            destination="complaints"
            initialCategory="service"
            initialTitle={t(`${ns}.support.supportChatTitle`)}
            label={t(`${ns}.support.supportChatLabel`)}
            description={t(`${ns}.support.supportChatDescription`)}
          />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const createStyles = (colors: any, logoutColor: string) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    scrollView: {
      flex: 1,
    },
    scrollContent: {
      flexGrow: 1,
      paddingHorizontal: 20,
      paddingVertical: 16,
    },
    content: {
      width: '100%',
      maxWidth: 480,
      alignSelf: 'center',
      gap: 16,
    },
    statusCard: {
      padding: 20,
      borderRadius: 22,
      backgroundColor: colors.card,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      gap: 18,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
    },
    headerIcon: {
      width: 52,
      height: 52,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerText: {
      flex: 1,
      gap: 6,
    },
    title: {
      fontSize: 23,
      lineHeight: 28,
      fontWeight: '800',
      color: colors.text,
    },
    description: {
      fontSize: 14,
      lineHeight: 20,
      color: colors.textSecondary,
    },
    statusContainer: {
      gap: 10,
    },
    statusRow: {
      minHeight: 40,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    statusLabel: {
      flex: 1,
      minWidth: 84,
      fontSize: 14,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    statusBadge: {
      maxWidth: '62%',
      flexShrink: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 7,
      paddingHorizontal: 10,
      paddingVertical: 7,
      borderRadius: 12,
    },
    statusDot: {
      width: 8,
      height: 8,
      borderRadius: 4,
    },
    statusBadgeText: {
      flexShrink: 1,
      fontSize: 12,
      lineHeight: 16,
      fontWeight: '700',
      color: colors.text,
      textAlign: 'center',
    },
    infoBox: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.primary + '12',
    },
    infoText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    supportBox: {
      padding: 14,
      borderRadius: 16,
      backgroundColor: colors.error + '10',
      borderWidth: 1,
      borderColor: colors.error + '35',
      gap: 8,
    },
    supportTitle: {
      fontSize: 14,
      fontWeight: '700',
      color: colors.text,
    },
    supportText: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.textSecondary,
    },
    supportButton: {
      minHeight: 48,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      marginTop: 4,
      paddingHorizontal: 16,
      borderRadius: 14,
      backgroundColor: colors.error,
    },
    supportButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: '#241B0B',
    },
    refreshButton: {
      minHeight: 56,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 18,
      borderRadius: 16,
      backgroundColor: colors.primary,
    },
    refreshButtonText: {
      fontSize: 15,
      fontWeight: '700',
      color: '#241B0B',
    },
    secondaryActions: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
    },
    profileButton: {
      flex: 1,
      minHeight: 50,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.card,
    },
    profileButtonText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    logoutButton: {
      flex: 1,
      minHeight: 50,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      paddingHorizontal: 12,
      borderRadius: 15,
      borderWidth: 1.5,
      borderColor: `${logoutColor}40`,
      backgroundColor: colors.error + '12',
    },
    logoutButtonText: {
      fontSize: 14,
      fontWeight: '700',
      color: logoutColor,
      textAlign: 'center',
    },
    supportChat: {
      marginTop: 0,
    },
  });
