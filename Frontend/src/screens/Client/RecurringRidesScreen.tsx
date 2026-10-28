import React, { useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  Image,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { useRecurringRides } from '../../hooks/client/useRecurringRides';
import { deleteRecurringRide, MAX_RECURRING_RIDES } from '../../services/recurringRidesService';
import { RRIcon } from '../../components/client/recurringRides/RRIcon';
import DestPinImg from '../../assets/icons/final-marker/final-marker.svg';
import StopPinImg from '../../assets/icons/extra-marker/extra-marker.svg';
import alertService from '../../services/alertService';
import type { RecurringRide } from '../../types/recurringRide';

const VEHICLE_LABEL_KEYS: Record<RecurringRide['vehicleType'], string> = {
  moto: 'shared.searchRide.vehicle.motoLabel',
  auto: 'shared.searchRide.vehicle.autoLabel',
  designated_driver: 'shared.searchRide.vehicle.designatedLabel',
};
const ORIGIN_PIN_IMG = require('../../assets/icons/origin_marker/origin_marker.png');

export default function RecurringRidesScreen({ navigation }: any) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const { rides, loading } = useRecurringRides(user?.id);
  const dangerColor = isDark ? '#EF8A80' : '#C62828';
  const metaIconColor = isDark ? 'rgba(245,241,234,0.65)' : colors.textSecondary;
  const accent = isDark ? colors.SecondBorder : '#B38737';
  const accentInk = isDark ? '#FFFFFF' : '#FFFFFF';

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
            <RRIcon id={item.vehicleType} size={18} color={accent} />
          </View>
          <Text style={styles.cardTitle} numberOfLines={1}>{item.title}</Text>
          <TouchableOpacity
            onPress={() => handleDelete(item)}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('client.recurringRides.delete')}
          >
            <RRIcon id="delete" size={18} color={dangerColor} />
          </TouchableOpacity>
        </View>

        <View style={styles.routeList}>
          <View style={styles.routeRow}>
            <View style={styles.routeIconCol}>
              <Image source={ORIGIN_PIN_IMG} style={styles.routePin} resizeMode="contain" />
              <View style={styles.routeConnector} />
            </View>
            <Text style={styles.routeAddr} numberOfLines={1}>{item.origin.address}</Text>
          </View>
          {item.extraStops.map((stop, index) => (
            <View style={styles.routeRow} key={`${item.id}-stop-${index}`}>
              <View style={styles.routeIconCol}>
                <StopPinImg width={18} height={18} />
                <View style={styles.routeConnector} />
              </View>
              <Text style={styles.routeAddr} numberOfLines={1}>{stop.address}</Text>
            </View>
          ))}
          <View style={styles.routeRow}>
            <View style={styles.routeIconCol}>
              <DestPinImg width={18} height={18} />
            </View>
            <Text style={styles.routeAddr} numberOfLines={1}>{item.destination.address}</Text>
          </View>
        </View>

        <View style={styles.cardMetaRow}>
          <View style={styles.metaChip}>
            <RRIcon id={item.vehicleType} size={13} color={metaIconColor} />
            <Text style={styles.metaChipText}>{t(VEHICLE_LABEL_KEYS[item.vehicleType])}</Text>
          </View>
          <View style={styles.metaChip}>
            <RRIcon id="person" size={13} color={metaIconColor} />
            <Text style={styles.metaChipText}>{item.passengers}</Text>
          </View>
          <View style={styles.metaChip}>
            <RRIcon id={item.paymentMethod} size={13} color={metaIconColor} />
            <Text style={styles.metaChipText}>
              {t(`client.recurringRides.${item.paymentMethod}`)}
            </Text>
          </View>
          {item.extraStops.length > 0 && (
            <View style={styles.metaChip}>
              <RRIcon id="stops" size={13} color={metaIconColor} />
              <Text style={styles.metaChipText}>
                {t('client.recurringRides.stopsCount', { count: item.extraStops.length })}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.cardActions}>
          <Pressable style={styles.actionPrimary} onPress={() => handleRequest(item)} accessibilityRole="button">
            <RRIcon id="request" size={15} color={accentInk} />
            <Text style={styles.actionPrimaryText}>{t('client.recurringRides.request')}</Text>
          </Pressable>
          <Pressable style={styles.actionChip} onPress={() => handleEdit(item)} accessibilityRole="button">
            <RRIcon id="edit" size={15} color={accent} />
            <Text style={styles.actionChipText}>{t('client.recurringRides.edit')}</Text>
          </Pressable>
        </View>
      </View>
    ),
    [styles, colors, t, dangerColor, metaIconColor, accent, accentInk, handleRequest, handleEdit, handleDelete],
  );

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top + 12 }]}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation?.goBack?.()}
          accessibilityRole="button"
        >
          <RRIcon id="back" size={20} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{t('client.recurringRides.title')}</Text>
        <TouchableOpacity
          style={styles.addButton}
          onPress={handleCreate}
          disabled={rides.length >= MAX_RECURRING_RIDES}
          accessibilityRole="button"
          accessibilityLabel={t('client.recurringRides.addNew')}
        >
          <RRIcon id="add" size={22} color={rides.length >= MAX_RECURRING_RIDES ? colors.textSecondary : accent} />
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
                <RRIcon id="repeat" size={30} color={accent} />
              </View>
              <Text style={styles.emptyTitle}>{t('client.recurringRides.emptyTitle')}</Text>
              <Text style={styles.emptyBody}>{t('client.recurringRides.emptyBody')}</Text>
              <Pressable style={styles.emptyCta} onPress={handleCreate} accessibilityRole="button">
                <RRIcon id="add" size={18} color={accentInk} />
                <Text style={styles.emptyCtaText}>{t('client.recurringRides.createFirst')}</Text>
              </Pressable>
            </View>
          )
        }
      />
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => {
  const accent = isDark ? colors.SecondBorder : '#B38737';
  const accentInk = isDark ? '#FFFFFF' : '#FFFFFF';
  const accentSoftBg = isDark ? 'rgba(110,68,255,0.16)' : 'rgba(179,135,55,0.16)';
  return StyleSheet.create({
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
      backgroundColor: accentSoftBg,
    },
    cardTitle: { flex: 1, fontSize: 16, fontWeight: '800', color: colors.text },
    routeList: { marginTop: 2 },
    routeRow: { flexDirection: 'row', alignItems: 'stretch', gap: 10 },
    routeIconCol: { width: 18, alignItems: 'center' },
    routePin: { width: 18, height: 18 },
    routeConnector: {
      flex: 1,
      width: 0,
      borderLeftWidth: 1.5,
      borderStyle: 'dashed',
      borderColor: isDark ? 'rgba(110,68,255,0.5)' : 'rgba(179,135,55,0.45)',
      marginVertical: 2,
    },
    routeAddr: {
      flex: 1,
      fontSize: 13.5,
      fontWeight: '600',
      color: colors.text,
      paddingVertical: 4,
    },
    cardMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 12 },
    metaChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingVertical: 4,
      paddingHorizontal: 9,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
    },
    metaChipText: { fontSize: 11.5, fontWeight: '700', color: colors.textSecondary },
    cardActions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 14, flexWrap: 'wrap' },
    actionPrimary: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingVertical: 9,
      paddingHorizontal: 14,
      borderRadius: 999,
      backgroundColor: accent,
    },
    actionPrimaryText: { fontSize: 13, fontWeight: '800', color: accentInk },
    actionChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingVertical: 9,
      paddingHorizontal: 12,
      borderRadius: 999,
      backgroundColor: isDark ? 'rgba(255,255,255,06)' : 'rgba(28,25,23,0.05)',
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: isDark ? 'rgba(255,255,255,0.12)' : 'rgba(28,25,23,0.1)',
    },
    actionChipText: { fontSize: 13, fontWeight: '700', color: accent },
    emptyWrap: { alignItems: 'center', paddingTop: 80, paddingHorizontal: 32 },
    emptyIconDisc: {
      width: 64,
      height: 64,
      borderRadius: 32,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: accentSoftBg,
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
      backgroundColor: accent,
    },
    emptyCtaText: { fontSize: 14.5, fontWeight: '800', color: accentInk },
  });
};
