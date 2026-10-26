import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
} from 'react-native';
import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useRecurringRides } from '../../hooks/client/useRecurringRides';
import { deleteRecurringRide, MAX_RECURRING_RIDES } from '../../services/recurringRidesService';
import alertService from '../../services/alertService';
import type { RecurringRide } from '../../types/recurringRide';

const VEHICLE_ICONS: Record<RecurringRide['vehicleType'], keyof typeof MaterialIcons.glyphMap> = {
  moto: 'two-wheeler',
  auto: 'directions-car',
  designated_driver: 'person-pin',
};

export default function RecurringRidesScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { rides, loading } = useRecurringRides(user?.id);

  const handleRequest = useCallback(
    (ride: RecurringRide) => navigation.navigate('SearchRide', { recurringRide: ride }),
    [navigation],
  );
  const handleEdit = useCallback(
    (ride: RecurringRide) => navigation.navigate('RecurringRideForm', { ride }),
    [navigation],
  );
  const handleCreate = useCallback(
    () => navigation.navigate('RecurringRideForm'),
    [navigation],
  );

  const handleDelete = useCallback(
    (ride: RecurringRide) => {
      alertService.showConfirmAlert(
        t('client.recurringRides.deleteConfirmTitle'),
        t('client.recurringRides.deleteConfirmBody', { title: ride.title }),
        async () => {
          if (!user?.id) return;
          try {
            await deleteRecurringRide(user.id, ride.id);
            alertService.showSuccessAlert(t('client.recurringRides.deleted'), '');
          } catch {
            alertService.showErrorAlert(t('client.recurringRides.deleteError'));
          }
        },
        undefined,
        t('client.recurringRides.delete'),
        t('buttons.cancel'),
        true,
      );
    },
    [user?.id, t],
  );

  const renderItem = useCallback(
    ({ item }: { item: RecurringRide }) => (
      <View style={styles.card}>
        <View style={styles.cardHeader}>
          <View style={styles.vehicleDisc}>
            <MaterialIcons name={VEHICLE_ICONS[item.vehicleType]} size={18} color="#B38737" />
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
        </View>
        <View style={styles.cardRoute}>
          <MaterialIcons name="trip-origin" size={13} color="#4CAF50" />
          <Text style={styles.cardRouteText} numberOfLines={1}>{item.origin.address}</Text>
        </View>
        <View style={styles.cardRoute}>
          <MaterialIcons name="place" size={13} color="#E53935" />
          <Text style={styles.cardRouteText} numberOfLines={1}>{item.destination.address}</Text>
        </View>
        {item.extraStops.length > 0 && (
          <Text style={styles.cardMeta}>
            {t('client.recurringRides.stopsCount', { count: item.extraStops.length })}
          </Text>
        )}
        <View style={styles.cardActions}>
          <Pressable style={styles.actionPrimary} onPress={() => handleRequest(item)} accessibilityRole="button">
            <MaterialIcons name="near-me" size={15} color="#241A09" />
            <Text style={styles.actionPrimaryText}>{t('client.recurringRides.request')}</Text>
          </Pressable>
          <Pressable style={styles.actionChip} onPress={() => handleEdit(item)} accessibilityRole="button">
            <MaterialIcons name="edit" size={15} color="#B38737" />
            <Text style={styles.actionChipText}>{t('client.recurringRides.edit')}</Text>
          </Pressable>
          <Pressable style={styles.actionChip} onPress={() => handleDelete(item)} accessibilityRole="button">
            <MaterialIcons name="delete-outline" size={15} color="#C62828" />
            <Text style={[styles.actionChipText, { color: '#C62828' }]}>
              {t('client.recurringRides.delete')}
            </Text>
          </Pressable>
        </View>
      </View>
    ),
    [styles, t, handleRequest, handleEdit, handleDelete],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation?.goBack?.()}
          accessibilityRole="button"
        >
          <Ionicons name="chevron-back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('client.recurringRides.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleCreate}
          disabled={rides.length >= MAX_RECURRING_RIDES}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.addNew')}
        >
          <MaterialIcons name="add" size={22} color={rides.length >= MAX_RECURRING_RIDES ? colors.textSecondary : '#B38737'} />
        </TouchableOpacity>
      </View>

      <FlatList
        data={rides}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          loading ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyIconDisc}>
                <MaterialIcons name="repeat" size={30} color="#B38737" />
              </View>
              <Text style={styles.emptyTitle}>{t('client.recurringRides.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('client.recurringRides.emptyBody')}</Text>
              <Pressable style={styles.emptyCta} onPress={handleCreate} accessibilityRole="button">
                <MaterialIcons name="add" size={18} color="#241A09" />
                <Text style={styles.emptyCtaText}>{t('client.recurringRides.createFirst')}</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingBottom: 12,
      gap: 12,
    },
    backButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
    },
    headerTitle: { flex: 1, fontSize: 18, fontWeight: '800', color: colors.text, textAlign: 'center' },
    addButton: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.08)',
    },
    listContent: { padding: 16, gap: 12, paddingBottom: 40 },
    card: {
      borderRadius: 20,
      padding: 16,
      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : '#FFFFFF',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.08)',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: isDark ? 0.25 : 0.08,
      shadowRadius: 10,
      elevation: 4,
    },
    cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
    vehicleDisc: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(179,135,55,0.16)',
    },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
    cardRoute: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 4 },
    cardRouteText: { flex: 1, fontSize: 13.5, fontWeight: '600', color: colors.text },
    cardMeta: { fontSize: 12, fontWeight: '600', color: colors.textSecondary, marginTop: 6, marginLeft: 21 },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
    actionPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: '#B38737',
    },
    actionPrimaryText: { fontSize: 13, fontWeight: '800', color: '#241A09' },
    actionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
    },
    actionChipText: { fontSize: 13, fontWeight: '700', color: '#B38737' },
    emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyIconDisc: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(179,135,55,0.14)',
      marginBottom: 16,
    },
    emptyTitle: { fontSize: 17, fontWeight: '800', color: colors.text, textAlign: 'center' },
    emptyBody: {
      fontSize: 13.5,
      fontWeight: '500',
      color: colors.textSecondary,
      textAlign: 'center',
      marginTop: 8,
      lineHeight: 19,
    },
    emptyCta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginTop: 22,
      paddingVertical: 12,
      paddingHorizontal: 22,
      borderRadius: 999,
      backgroundColor: '#B38737',
    },
    emptyCtaText: { fontSize: 14.5, fontWeight: '800', color: '#241A09' },
  });
