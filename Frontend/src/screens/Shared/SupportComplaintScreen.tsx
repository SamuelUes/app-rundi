import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LoadingIcon } from '../../components/ui/LoadingIcon';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import supportTicketsService, { SupportTicket } from '../../services/supportTicketsService';

type SupportComplaintScreenRouteParams = {
  initialTicketId?: string | null;
};

type SupportComplaintScreenProps = {
  route?: { params?: SupportComplaintScreenRouteParams };
};

const ALLOWED_CATEGORIES: Array<'service' | 'driver' | 'payment' | 'app' | 'other'> = [
  'service',
  'driver',
  'payment',
  'app',
  'other',
];

export default function SupportComplaintScreen({ route }: SupportComplaintScreenProps) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark, insets), [colors, isDark, insets]);
  const navigation = useNavigation<any>();
  const { user } = useAuth();
  const { t } = useTranslation();

  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [deletingTicketIds, setDeletingTicketIds] = useState<Record<string, boolean>>({});

  const initialTicketId = route?.params?.initialTicketId || null;

  const fetchTickets = useCallback(async () => {
    if (!user?.id) {
      setTickets([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      const response = await supportTicketsService.getMyTickets({ pageSize: 100 });
      setTickets(response);
    } catch (error) {
      console.error('[SupportComplaintScreen] Error fetching tickets:', error);
      setTickets([]);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    fetchTickets();
  }, [fetchTickets]);

  useFocusEffect(
    useCallback(() => {
      // Re cargar cada vez que la pantalla vuelve a foco
      fetchTickets();
    }, [fetchTickets]),
  );

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchTickets();
    setRefreshing(false);
  };

  const confirmDeleteTicket = useCallback(
    async (ticketId: string) => {
      setDeletingTicketIds((prev) => ({ ...prev, [ticketId]: true }));
      try {
        await supportTicketsService.deleteTicket(ticketId);
        setTickets((prev) => prev.filter((ticket) => ticket.id !== ticketId));
        try {
          const response = await supportTicketsService.getMyTickets({ pageSize: 100 });
          setTickets(response);
        } catch (refreshError) {
          console.error('[SupportComplaintScreen] Error refreshing tickets after delete:', refreshError);
        }
        Alert.alert(t('shared.supportcomplaint.tickets.deleteSuccess'));
      } catch (error) {
        console.error('[SupportComplaintScreen] Error deleting ticket:', error);
        Alert.alert(t('shared.supportcomplaint.tickets.deleteError'));
      } finally {
        setDeletingTicketIds((prev) => {
          const next = { ...prev };
          delete next[ticketId];
          return next;
        });
      }
    },
    [t],
  );

  const handleDeleteTicket = useCallback(
    (ticketId: string) => {
      Alert.alert(
        t('shared.supportcomplaint.tickets.deleteConfirmTitle'),
        t('shared.supportcomplaint.tickets.deleteConfirmMessage'),
        [
          {
            text: t('shared.supportcomplaint.tickets.deleteCancelButton'),
            style: 'cancel',
          },
          {
            text: t('shared.supportcomplaint.tickets.deleteConfirmButton'),
            style: 'destructive',
            onPress: () => confirmDeleteTicket(ticketId),
          },
        ],
      );
    },
    [confirmDeleteTicket, t],
  );

  const getTicketStatusLabel = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'open') return t('shared.supportcomplaint.status.open');
    if (normalized === 'in_progress') return t('shared.supportcomplaint.status.in_progress');
    if (normalized === 'resolved') return t('shared.supportcomplaint.status.resolved');
    if (normalized === 'rejected') return t('shared.supportcomplaint.status.rejected');
    return status;
  };

  const getTicketStatusColor = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'open') return '#2F8FE8';
    if (normalized === 'in_progress') return '#E8890C';
    if (normalized === 'resolved') return '#2FA84F';
    if (normalized === 'rejected') return '#E5484D';
    return colors.textSecondary;
  };

  const getTicketStatusIcon = (status: string) => {
    const normalized = status.toLowerCase();
    if (normalized === 'open') return 'ellipse-outline' as const;
    if (normalized === 'in_progress') return 'time-outline' as const;
    if (normalized === 'resolved') return 'checkmark-circle' as const;
    if (normalized === 'rejected') return 'close-circle' as const;
    return 'ellipse-outline' as const;
  };

  const navigateToSupportChat = (ticket?: SupportTicket) => {
    if (ticket) {
      const normalizedCategory = (ticket.category || '').toLowerCase();
      const category = ALLOWED_CATEGORIES.includes(normalizedCategory as any)
        ? (normalizedCategory as typeof ALLOWED_CATEGORIES[number])
        : 'service';

      navigation.navigate('SupportChat', {
        rideId: ticket.rideId || null,
        initialCategory: category,
        initialTitle: ticket.title,
        complaintId: ticket.id,
      });
    } else {
      navigation.navigate('SupportChat', {
        rideId: null,
        initialCategory: 'service',
        initialTitle: '',
        complaintId: null,
      });
    }
  };

  const renderTicketList = () => {
    if (loading) {
      return (
        <View style={styles.loadingContainer}>
          <LoadingIcon size={32} color={colors.primary} />
          <Text style={styles.loadingText}>
            {t('shared.supportcomplaint.tickets.loading')}
          </Text>
        </View>
      );
    }

    if (tickets.length === 0) {
      return (
        <View style={styles.emptyState}>
          <View style={styles.emptyIconWrap}>
            <MaterialIcons name="support" size={34} color={colors.primary} />
          </View>
          <Text style={styles.emptyTitle}>{t('shared.supportcomplaint.tickets.emptyTitle')}</Text>
          <Text style={styles.emptyDescription}>
            {t('shared.supportcomplaint.tickets.emptyDescription')}
          </Text>
          <TouchableOpacity
            style={[styles.primaryButton, { backgroundColor: '#C9A35A' }]}
            onPress={() => navigateToSupportChat()}
            activeOpacity={0.8}
          >
            <Ionicons name="add" size={18} color="#241A05" />
            <Text style={styles.primaryButtonText}>
              {t('shared.supportcomplaint.tickets.newReport')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return tickets.map((ticket) => {
      const isDeleting = Boolean(deletingTicketIds[ticket.id]);
      const statusColor = getTicketStatusColor(ticket.status);
      return (
        <TouchableOpacity
          key={ticket.id}
          style={[
            styles.ticketCard,
            initialTicketId === ticket.id && styles.ticketCardHighlighted,
          ]}
          onPress={() => navigateToSupportChat(ticket)}
          activeOpacity={0.75}
        >
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketTitle} numberOfLines={2}>
              {ticket.title}
            </Text>
            <View
              style={[
                styles.ticketStatusPill,
                { backgroundColor: `${statusColor}22`, borderColor: `${statusColor}55` },
              ]}
            >
              <Ionicons name={getTicketStatusIcon(ticket.status)} size={12} color={statusColor} />
              <Text style={[styles.ticketStatusLabel, { color: statusColor }]}>
                {getTicketStatusLabel(ticket.status)}
              </Text>
            </View>
          </View>
          {ticket.category ? (
            <View style={styles.ticketMetaRow}>
              <Ionicons name="pricetag-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.ticketMeta}>
                {t('shared.supportcomplaint.tickets.category')}: {ticket.category}
              </Text>
            </View>
          ) : null}
          {ticket.createdAt ? (
            <View style={styles.ticketMetaRow}>
              <Ionicons name="calendar-outline" size={13} color={colors.textSecondary} />
              <Text style={styles.ticketMeta}>
                {t('shared.supportcomplaint.tickets.createdAt')}:{' '}
                {new Date(ticket.createdAt).toLocaleString()}
              </Text>
            </View>
          ) : null}
          {ticket.resolutionNotes && ticket.status.toLowerCase() === 'resolved' ? (
            <View style={styles.ticketResolutionBox}>
              <Ionicons name="checkmark-done-outline" size={14} color={colors.primary} />
              <Text style={styles.ticketResolution} numberOfLines={2}>
                {t('shared.supportcomplaint.tickets.resolution')}: {ticket.resolutionNotes}
              </Text>
            </View>
          ) : null}
          <View style={styles.ticketActions}>
            <TouchableOpacity
              style={[
                styles.deleteButton,
                isDeleting && styles.deleteButtonDisabled,
              ]}
              onPress={(event) => {
                event.stopPropagation();
                handleDeleteTicket(ticket.id);
              }}
              disabled={isDeleting}
              activeOpacity={0.75}
            >
              {isDeleting ? (
                <LoadingIcon size={16} color="#E5484D" />
              ) : (
                <>
                  <Ionicons name="trash-outline" size={14} color="#E5484D" />
                  <Text style={styles.deleteButtonText}>
                    {t('shared.supportcomplaint.tickets.delete')}
                  </Text>
                </>
              )}
            </TouchableOpacity>
            <Ionicons name="chevron-forward" size={18} color={colors.primary} />
          </View>
        </TouchableOpacity>
      );
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerCard}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.headerCircleButton}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={22} color={colors.text} />
        </TouchableOpacity>
        <View style={styles.headerTextCol}>
          <Text style={styles.headerTitle}>{t('shared.supportcomplaint.tickets.title')}</Text>
          <Text style={styles.headerSubtitle}>
            {t('shared.supportcomplaint.tickets.subtitle')}
          </Text>
        </View>
      </View>

      <ScrollView
        style={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={styles.listContent}
      >
        <TouchableOpacity
          style={styles.createButton}
          onPress={() => navigateToSupportChat()}
          activeOpacity={0.85}
        >
          <Ionicons name="add" size={20} color="#241A05" />
          <Text style={styles.createButtonText}>
            {t('shared.supportcomplaint.tickets.createCta')}
          </Text>
        </TouchableOpacity>
        {renderTicketList()}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean, insets: { top: number; bottom: number }) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
      marginTop: insets.top + 8,
      marginHorizontal: 16,
      marginBottom: 4,
      paddingVertical: 12,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: 'rgba(211, 153, 46, 0.94)',
      borderWidth: 1,
      borderColor: 'rgba(255, 255, 255, 0.24)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 6 },
      shadowOpacity: 0.16,
      shadowRadius: 16,
      elevation: 8,
    },
    headerCircleButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: 'rgba(255, 255, 255, 0.26)',
      alignItems: 'center',
      justifyContent: 'center',
    },
    headerTextCol: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 19,
      fontWeight: '700',
      color: '#FFFFFF',
      letterSpacing: 0.2,
    },
    headerSubtitle: {
      fontSize: 12.5,
      color: 'rgba(255, 255, 255, 0.85)',
      marginTop: 1,
    },
    listContainer: {
      flex: 1,
    },
    listContent: {
      paddingHorizontal: 16,
      paddingTop: 10,
      paddingBottom: insets.bottom + 24,
    },
    createButton: {
      backgroundColor: colors.primary,
      paddingVertical: 14,
      borderRadius: 16,
      alignItems: 'center',
      justifyContent: 'center',
      flexDirection: 'row',
      gap: 6,
      marginBottom: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.12,
      shadowRadius: 10,
      elevation: 4,
    },
    createButtonText: {
      color: '#241A05',
      fontWeight: '700',
      fontSize: 15,
    },
    loadingContainer: {
      marginTop: 60,
      alignItems: 'center',
    },
    loadingText: {
      marginTop: 12,
      color: colors.textSecondary,
    },
    emptyState: {
      alignItems: 'center',
      marginTop: 56,
      paddingHorizontal: 24,
    },
    emptyIconWrap: {
      width: 72,
      height: 72,
      borderRadius: 36,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 14,
    },
    emptyTitle: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
    },
    emptyDescription: {
      fontSize: 14,
      color: colors.textSecondary,
      textAlign: 'center',
      marginBottom: 18,
      lineHeight: 20,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 999,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    primaryButtonText: {
      color: '#241A05',
      fontWeight: '700',
      fontSize: 14,
    },
    ticketCard: {
      backgroundColor: colors.card,
      borderRadius: 20,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 3 },
      shadowOpacity: isDark ? 0.2 : 0.05,
      shadowRadius: 10,
      elevation: 3,
    },
    ticketCardHighlighted: {
      borderColor: colors.primary,
      backgroundColor: isDark ? 'rgba(179, 135, 55, 0.12)' : 'rgba(179, 135, 55, 0.06)',
    },
    ticketHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 8,
      gap: 10,
    },
    ticketTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    ticketStatusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      borderWidth: 1,
    },
    ticketStatusLabel: {
      fontSize: 11.5,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    ticketMetaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 5,
    },
    ticketMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      flexShrink: 1,
    },
    ticketResolutionBox: {
      marginTop: 10,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
      padding: 10,
      borderRadius: 12,
      backgroundColor: isDark ? 'rgba(179, 135, 55, 0.14)' : 'rgba(179, 135, 55, 0.08)',
    },
    ticketResolution: {
      fontSize: 13,
      color: colors.text,
      flex: 1,
      lineHeight: 18,
    },
    ticketActions: {
      marginTop: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(229, 72, 77, 0.16)' : 'rgba(229, 72, 77, 0.09)',
    },
    deleteButtonDisabled: {
      opacity: 0.6,
    },
    deleteButtonText: {
      color: '#E5484D',
      fontSize: 12.5,
      fontWeight: '600',
    },
  });