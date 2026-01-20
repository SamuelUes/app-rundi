import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  ScrollView,
  RefreshControl,
} from 'react-native';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useTheme } from '../../context/ThemeContext';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../context/AuthContext';
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
  const { colors } = useTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);
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
    if (normalized === 'open') return '#1976D2';
    if (normalized === 'in_progress') return '#FF9800';
    if (normalized === 'resolved') return '#388E3C';
    if (normalized === 'rejected') return '#D32F2F';
    return colors.textSecondary;
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
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>
            {t('shared.supportcomplaint.tickets.loading')}
          </Text>
        </View>
      );
    }

    if (tickets.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text style={styles.emptyIcon}>🙌</Text>
          <Text style={styles.emptyTitle}>{t('shared.supportcomplaint.tickets.emptyTitle')}</Text>
          <Text style={styles.emptyDescription}>
            {t('shared.supportcomplaint.tickets.emptyDescription')}
          </Text>
          <TouchableOpacity style={styles.primaryButton} onPress={() => navigateToSupportChat()}>
            <Text style={styles.primaryButtonText}>
              {t('shared.supportcomplaint.tickets.newReport')}
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return tickets.map((ticket) => {
      const isDeleting = Boolean(deletingTicketIds[ticket.id]);
      return (
        <TouchableOpacity
          key={ticket.id}
          style={[
            styles.ticketCard,
            initialTicketId === ticket.id && styles.ticketCardHighlighted,
          ]}
          onPress={() => navigateToSupportChat(ticket)}
        >
          <View style={styles.ticketHeader}>
            <Text style={styles.ticketTitle} numberOfLines={2}>
              {ticket.title}
            </Text>
            <View
              style={[
                styles.ticketStatusPill,
                { backgroundColor: getTicketStatusColor(ticket.status) },
              ]}
            >
              <Text style={styles.ticketStatusLabel}>{getTicketStatusLabel(ticket.status)}</Text>
            </View>
          </View>
          {ticket.category ? (
            <Text style={styles.ticketMeta}>
              {t('shared.supportcomplaint.tickets.category')}: {ticket.category}
            </Text>
          ) : null}
          {ticket.createdAt ? (
            <Text style={styles.ticketMeta}>
              {t('shared.supportcomplaint.tickets.createdAt')}:{' '}
              {new Date(ticket.createdAt).toLocaleString()}
            </Text>
          ) : null}
          {ticket.resolutionNotes && ticket.status.toLowerCase() === 'resolved' ? (
            <Text style={styles.ticketResolution} numberOfLines={2}>
              {t('shared.supportcomplaint.tickets.resolution')}: {ticket.resolutionNotes}
            </Text>
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
            >
              {isDeleting ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={styles.deleteButtonText}>
                  {t('shared.supportcomplaint.tickets.delete')}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      );
    });
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('shared.supportcomplaint.tickets.title')}</Text>
        <Text style={styles.subtitle}>
          {t('shared.supportcomplaint.tickets.subtitle')}
        </Text>
      </View>

      <TouchableOpacity style={styles.createButton} onPress={() => navigateToSupportChat()}>
        <Text style={styles.createButtonText}>
          {t('shared.supportcomplaint.tickets.createCta')}
        </Text>
      </TouchableOpacity>

      <ScrollView
        style={styles.listContainer}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        contentContainerStyle={{ paddingBottom: 32 }}
      >
        {renderTicketList()}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: any) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 16,
      paddingTop: 32,
    },
    header: {
      marginBottom: 20,
    },
    title: {
      fontSize: 26,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 4,
      marginTop: 30
    },
    subtitle: {
      fontSize: 14,
      color: colors.textSecondary,
    },
    createButton: {
      backgroundColor: '#b38737',
      paddingVertical: 14,
      borderRadius: 12,
      alignItems: 'center',
      marginBottom: 20,
    },
    createButtonText: {
      color: '#fff',
      fontWeight: '600',
      fontSize: 16,
    },
    listContainer: {
      flex: 1,
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
      marginTop: 60,
      paddingHorizontal: 16,
    },
    emptyIcon: {
      fontSize: 48,
      marginBottom: 12,
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
      marginBottom: 16,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 10,
    },
    primaryButtonText: {
      color: '#fff',
      fontWeight: '600',
    },
    ticketCard: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    ticketCardHighlighted: {
      borderColor: colors.primary,
      borderWidth: 2,
    },
    ticketHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    ticketTitle: {
      flex: 1,
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginRight: 12,
    },
    ticketStatusPill: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 4,
    },
    ticketStatusLabel: {
      fontSize: 12,
      color: '#fff',
      fontWeight: '600',
    },
    ticketMeta: {
      fontSize: 13,
      color: colors.textSecondary,
      marginTop: 4,
    },
    ticketResolution: {
      fontSize: 13,
      color: colors.text,
      marginTop: 6,
    },
    ticketActions: {
      marginTop: 12,
      flexDirection: 'row',
      justifyContent: 'flex-end',
    },
    deleteButton: {
      backgroundColor: '#d32f2f',
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 20,
    },
    deleteButtonDisabled: {
      opacity: 0.6,
    },
    deleteButtonText: {
      color: '#fff',
      fontSize: 13,
      fontWeight: '600',
    },
  });