import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { collection, doc, getDoc, onSnapshot, query, where } from 'firebase/firestore';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import StorageImage from '../../components/shared/StorageImage';
import { assignProgrammedDriver, cancelProgrammedRide, confirmProgrammedRide, removeProgrammedDriver, searchProgrammedDrivers, type ProgrammedDriverCandidate, type ProgrammedRide } from '../../api/programmed';
import { getFirebaseFirestore } from '../../config/firebase';
import { FS_COL } from '../../constants/firestore';
import { useAuth } from '../../hooks/shared/auth/useAuth';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import alertService from '../../services/notification/alertService';
import { withAlpha } from '../../utils/format/colors';

function address(value: unknown, fallback: string): string {
  if (value && typeof value === 'object' && 'address' in value && typeof value.address === 'string') {
    return value.address || fallback;
  }
  return fallback;
}

function driverName(value: unknown): string | null {
  if (value && typeof value === 'object' && 'name' in value && typeof value.name === 'string') {
    return value.name || null;
  }
  return null;
}

export default function ProgrammedRidesScreen({ navigation }: any) {
  const { t, i18n } = useTranslation();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [rides, setRides] = useState<ProgrammedRide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [subscriptionVersion, setSubscriptionVersion] = useState(0);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [searchRideId, setSearchRideId] = useState<string | null>(null);
  const [searchText, setSearchText] = useState('');
  const [candidates, setCandidates] = useState<ProgrammedDriverCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const searchVersion = useRef(0);

  useEffect(() => () => { searchVersion.current += 1; }, []);

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!user?.id) {
      setRides([]);
      setLoading(false);
      return;
    }
    let active = true;
    let unsubscribe: (() => void) | undefined;
    setLoading(true);
    setError(false);
    (async () => {
      try {
        const db = await getFirebaseFirestore();
        if (!active) return;
        unsubscribe = onSnapshot(
          query(collection(db, FS_COL.programmed), where('clientId', '==', user.id)),
          snapshot => {
            if (!active) return;
            setRides(snapshot.docs.map(doc => ({ ...doc.data(), id: doc.id } as ProgrammedRide)));
            setLoading(false);
            setError(false);
          },
          () => {
            if (!active) return;
            setError(true);
            setLoading(false);
          },
        );
      } catch {
        if (active) {
          setError(true);
          setLoading(false);
        }
      }
    })();
    return () => {
      active = false;
      unsubscribe?.();
    };
  }, [user?.id, subscriptionVersion]);

  const futureRides = useMemo(() => rides
    .filter(ride => (ride.status === 'scheduled' || ride.status === 'client_confirmed') && Number(ride.scheduledAt) > now)
    .sort((a, b) => Number(a.scheduledAt) - Number(b.scheduledAt)), [rides, now]);

  const perform = async (ride: ProgrammedRide, action: 'confirm' | 'cancel') => {
    if (busyId) return;
    setBusyId(ride.id);
    try {
      if (action === 'confirm') await confirmProgrammedRide(ride.id, 'client');
      else await cancelProgrammedRide(ride.id);
    } catch {
      alertService.showErrorAlert(t('client.programmedRides.actionError'));
    } finally {
      setBusyId(null);
    }
  };

  const copyCode = async (code: string) => {
    try {
      const Clipboard = await import('expo-clipboard');
      if (!(await Clipboard.setStringAsync(code))) throw new Error('Clipboard unavailable');
      alertService.showSuccessAlert(t('client.programmedRides.codeCopied'), '');
    } catch {
      alertService.showErrorAlert(t('client.programmedRides.clipboardUnavailable'));
    }
  };

  const searchDrivers = async (rideId: string) => {
    if (searchText.trim().length < 3) {
      alertService.showErrorAlert(t('client.programmedRides.searchTooShort'));
      return;
    }
    const version = ++searchVersion.current;
    setSearching(true);
    try {
      const results = await searchProgrammedDrivers(rideId, searchText.trim());
      const db = await getFirebaseFirestore();
      const withPhotos = await Promise.all(results.map(async candidate => {
        try {
          const profile = await getDoc(doc(db, FS_COL.driverPublic, candidate.driverId));
          const photoUrl = profile.data()?.photoUrl;
          return typeof photoUrl === 'string' ? { ...candidate, photoUrl } : candidate;
        } catch {
          return candidate;
        }
      }));
      if (version === searchVersion.current) setCandidates(withPhotos);
    } catch {
      if (version === searchVersion.current) alertService.showErrorAlert(t('client.programmedRides.actionError'));
    } finally {
      if (version === searchVersion.current) setSearching(false);
    }
  };

  const inviteDriver = async (rideId: string, driverId: string) => {
    if (busyId) return;
    setBusyId(rideId);
    try {
      await assignProgrammedDriver(rideId, driverId);
      setSearchRideId(null);
      setCandidates(null);
      alertService.showSuccessAlert(t('client.programmedRides.inviteSent'), '');
    } catch {
      alertService.showErrorAlert(t('client.programmedRides.actionError'));
    } finally {
      setBusyId(null);
    }
  };

  const removeDriver = async (ride: ProgrammedRide) => {
    if (busyId || !ride.driverId) return;
    setBusyId(ride.id);
    try {
      await removeProgrammedDriver(ride);
      setSearchRideId(null);
      setCandidates(null);
      alertService.showSuccessAlert(t('client.programmedRides.driverRemoved'), '');
    } catch {
      alertService.showErrorAlert(t('client.programmedRides.driverRemoveError'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <View style={styles.container}>
      <View style={[styles.header, { paddingTop: insets.top }]}>
        <Pressable onPress={() => navigation.goBack()} accessibilityRole="button" accessibilityLabel={t('buttons.back')} style={styles.back}>
          <MaterialIcons name="arrow-back" size={24} color={colors.text} />
        </Pressable>

        <View style={styles.heading}>
          <Text style={styles.eyebrow}>{t('client.programmedRides.eyebrow')}</Text>
          <Text style={styles.title}>{t('client.programmedRides.title')}</Text>
          <Text style={styles.subtitle}>{t('client.programmedRides.subtitle')}</Text>
        </View>
      </View>
      
      {loading ? <ActivityIndicator style={styles.message} color={colors.primary} accessibilityLabel={t('client.programmedRides.loading')} /> : (
        <FlatList
          data={error ? [] : futureRides}
          keyboardShouldPersistTaps="handled"
          keyExtractor={item => item.id}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListEmptyComponent={
            <View style={styles.empty}>
              <View style={styles.emptyIcon}>
                <MaterialIcons name={error ? 'cloud-off' : 'event-available'} size={28} color={colors.primary} />
              </View>
              <Text style={styles.emptyTitle}>{t(error ? 'client.programmedRides.error' : 'client.programmedRides.empty')}</Text>
              {error ? (
                <Pressable accessibilityRole="button" style={styles.secondary} onPress={() => setSubscriptionVersion(version => version + 1)}>
                  <Text style={styles.secondaryText}>{t('client.programmedRides.retry')}</Text>
                </Pressable>
              ) : null}
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.card}>
              <View style={styles.cardHeader}>
                <View style={styles.calendar}>
                  <Text style={styles.calendarMonth}>{new Date(Number(item.scheduledAt)).toLocaleDateString(i18n.language, { month: 'short' }).replace('.', '').toUpperCase()}</Text>
                  <Text style={styles.calendarDay}>{new Date(Number(item.scheduledAt)).getDate()}</Text>
                </View>
                <View style={styles.dateColumn}>
                  <Text style={styles.date}>{new Date(Number(item.scheduledAt)).toLocaleDateString(i18n.language, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}</Text>
                  <View style={styles.timeRow}>
                    <MaterialIcons name="schedule" size={15} color={colors.textSecondary} />
                    <Text style={styles.time}>{new Date(Number(item.scheduledAt)).toLocaleTimeString(i18n.language, { hour: 'numeric', minute: '2-digit' })}</Text>
                  </View>
                </View>
              </View>
              <View style={styles.statusRow}>
                <MaterialIcons name={item.clientConfirmed ? 'check-circle' : 'schedule'} size={15} color={item.clientConfirmed ? styles.statusConfirmed.color : styles.statusText.color} />
                <Text style={[styles.statusText, item.clientConfirmed && styles.statusConfirmed]}>{t(item.clientConfirmed ? 'client.programmedRides.confirmed' : 'client.programmedRides.pending')}</Text>
              </View>
              <View style={styles.route}>
                <View style={styles.routeRow}>
                  <View style={styles.routeMarkerColumn}><View style={[styles.routeDot, styles.originDot]} /><View style={styles.routeLine} /></View>
                  <View style={styles.routeText}><Text style={styles.label}>{t('client.programmedRides.origin')}</Text><Text style={styles.address}>{address(item.origin, t('client.programmedRides.noAddress'))}</Text></View>
                </View>
                {Array.isArray(item.extraDestinations) ? item.extraDestinations.map((stop, index) => (
                  <View style={styles.routeRow} key={index}>
                    <View style={styles.routeMarkerColumn}><View style={[styles.routeDot, styles.stopDot]} /><View style={styles.routeLine} /></View>
                    <View style={styles.routeText}><Text style={styles.label}>{t('client.programmedRides.stop', { number: index + 1 })}</Text><Text style={styles.address}>{address(stop, t('client.programmedRides.noAddress'))}</Text></View>
                  </View>
                )) : null}
                <View style={styles.routeRow}>
                  <View style={styles.routeMarkerColumn}><View style={[styles.routeDot, styles.destinationDot]} /></View>
                  <View style={styles.routeText}><Text style={styles.label}>{t('client.programmedRides.destination')}</Text><Text style={styles.address}>{address(item.destination, t('client.programmedRides.noAddress'))}</Text></View>
                </View>
              </View>
              <View style={styles.driverRow}>
                <View style={styles.driverIcon}><MaterialIcons name="person-outline" size={20} color={colors.primary} /></View>
                <View style={styles.routeText}>
                  {driverName(item.driver) ? <Text style={styles.address}>{driverName(item.driver)}</Text> : null}
                  <Text style={styles.driverText}>{t(item.driverId ? item.driverConfirmed ? 'client.programmedRides.driverConfirmed' : 'client.programmedRides.driverPending' : item.driverInvitationStatus === 'declined' ? 'client.programmedRides.driverDeclined' : 'client.programmedRides.noDriver')}</Text>
                </View>
                <Pressable
                  disabled={!!busyId}
                  onPress={() => {
                    if (item.driverId) {
                      alertService.showConfirmAlert(
                        t(item.driverConfirmed ? 'client.programmedRides.removeDriverTitle' : 'client.programmedRides.cancelInviteTitle'),
                        t(item.driverConfirmed ? 'client.programmedRides.removeDriverBody' : 'client.programmedRides.cancelInviteBody'),
                        () => void removeDriver(item),
                        undefined,
                        t(item.driverConfirmed ? 'client.programmedRides.removeDriver' : 'client.programmedRides.cancelInvite'),
                        t('client.programmedRides.retract'),
                        true,
                      );
                      return;
                    }
                    searchVersion.current += 1;
                    setSearching(false);
                    setSearchRideId(searchRideId === item.id ? null : item.id);
                    setSearchText('');
                    setCandidates(null);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={t(item.driverId ? item.driverConfirmed ? 'client.programmedRides.removeDriver' : 'client.programmedRides.cancelInvite' : 'client.programmedRides.findDriver')}
                  style={[styles.driverAction, !!busyId && styles.disabled]}
                >
                  <MaterialIcons name={item.driverId ? 'person-remove' : 'person-search'} size={18} color={item.driverId ? styles.removeIcon.color : colors.primary} />
                  <Text style={[styles.driverActionText, !!item.driverId && styles.removeIcon]}>
                    {t(item.driverId ? item.driverConfirmed ? 'client.programmedRides.removeDriverShort' : 'client.programmedRides.cancelInviteShort' : 'client.programmedRides.invite')}
                  </Text>
                </Pressable>
              </View>
              {searchRideId === item.id && !item.driverId ? (
                <View style={styles.searchPanel}>
                  <View style={styles.searchRow}>
                    <TextInput
                      value={searchText}
                      onChangeText={value => { searchVersion.current += 1; setSearching(false); setSearchText(value); setCandidates(null); }}
                      placeholder={t('client.programmedRides.searchPlaceholder')}
                      placeholderTextColor={colors.textSecondary}
                      style={styles.searchInput}
                      returnKeyType="search"
                      onSubmitEditing={() => void searchDrivers(item.id)}
                      accessibilityLabel={t('client.programmedRides.searchPlaceholder')}
                    />
                    <Pressable disabled={searching} onPress={() => void searchDrivers(item.id)} style={styles.searchButton} accessibilityRole="button" accessibilityLabel={t('client.programmedRides.search')}>
                      {searching ? <ActivityIndicator color="#241A09" /> : <MaterialIcons name="search" size={21} color="#241A09" />}
                    </Pressable>
                  </View>
                  {candidates?.length === 0 ? <Text style={styles.statusText}>{t('client.programmedRides.noCandidates')}</Text> : null}
                  {candidates?.map(candidate => (
                    <View style={styles.candidateRow} key={candidate.driverId}>
                      <View style={styles.candidateAvatar}>
                        <MaterialIcons name="person-outline" size={21} color={colors.primary} />
                        {candidate.photoUrl ? (
                          <StorageImage uri={candidate.photoUrl} style={styles.candidatePhoto} />
                        ) : null}
                      </View>
                      <View style={styles.routeText}>
                        <Text style={styles.address}>{candidate.name || t('client.programmedRides.driverFallback')}</Text>
                        <Text style={styles.label}>{t('client.programmedRides.rating', { rating: candidate.rating.toFixed(1) })}</Text>
                      </View>
                      <Pressable disabled={!!busyId} style={[styles.primary, busyId && styles.disabled]} onPress={() => {
                        if (item.driverId && item.driverId !== candidate.driverId) {
                          alertService.showConfirmAlert(
                            t('client.programmedRides.replaceInviteTitle'),
                            t('client.programmedRides.replaceInviteBody'),
                            () => void inviteDriver(item.id, candidate.driverId),
                            undefined,
                            t('client.programmedRides.invite'),
                            t('client.programmedRides.retract'),
                          );
                        } else {
                          void inviteDriver(item.id, candidate.driverId);
                        }
                      }} accessibilityRole="button">
                        <Text style={styles.primaryText}>{t('client.programmedRides.invite')}</Text>
                      </Pressable>
                    </View>
                  ))}
                </View>
              ) : null}
              {item.shareCode ? (
                <View style={styles.codeRow}>
                  <Text style={styles.codeLabel}>{t('client.programmedRides.code')}</Text>
                  <Text style={styles.code} selectable>{item.shareCode}</Text>
                  <Pressable
                    onPress={() => void copyCode(item.shareCode!)}
                    accessibilityRole="button"
                    accessibilityLabel={t('client.programmedRides.copyCode')}
                    style={styles.copyButton}
                  >
                    <MaterialIcons name="content-copy" size={19} color={colors.primary} />
                  </Pressable>
                </View>
              ) : null}
              <View style={styles.actions}>
                {!item.clientConfirmed ? (
                  <Pressable disabled={!!busyId} style={[styles.primary, busyId && styles.disabled]} onPress={() => void perform(item, 'confirm')} accessibilityRole="button">
                    <Text style={styles.primaryText}>{t('client.programmedRides.confirm')}</Text>
                  </Pressable>
                ) : null}
                <Pressable disabled={!!busyId} style={[styles.secondary, busyId && styles.disabled]} accessibilityRole="button" onPress={() => alertService.showConfirmAlert(
                  t('client.programmedRides.cancelTitle'),
                  t('client.programmedRides.cancelBody'),
                  () => void perform(item, 'cancel'),
                  undefined,
                  t('client.programmedRides.cancel'),
                  t('client.programmedRides.retract'),
                  true,
                )}>
                  <Text style={styles.secondaryText}>{t('client.programmedRides.cancel')}</Text>
                </Pressable>
              </View>
            </View>
          )}
        />
      )}
    </View>
  );
}

const createStyles = (colors: any, isDark: boolean) => StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16 },
  back: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center', borderRadius: 22, backgroundColor: colors.card },
  heading: { paddingHorizontal: 22, paddingTop: 24, paddingBottom: 22, gap: 5 },
  eyebrow: { color: isDark ? '#E8C47F' : '#946D29', fontSize: 11, letterSpacing: 1, fontWeight: '800', textTransform: 'uppercase' },
  title: { color: colors.text, fontSize: 28, fontWeight: '800', letterSpacing: -0.6 },
  subtitle: { color: colors.textSecondary, fontSize: 14, lineHeight: 20 },
  list: { paddingHorizontal: 16, gap: 14, flexGrow: 1 },
  message: { color: colors.textSecondary, textAlign: 'center', marginTop: 48 },
  empty: { alignItems: 'center', paddingHorizontal: 28, paddingTop: 60, gap: 16 },
  emptyIcon: { width: 64, height: 64, borderRadius: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#3E3321' : '#F4EBDC' },
  emptyTitle: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center' },
  card: { 
    backgroundColor: colors.surface, 
    borderRadius: 22, 
    padding: 18, 
    gap: 15, 
    borderWidth: 0.2, 
    borderColor: colors.border,
    boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 3, color: withAlpha(colors.shadow, 0.16)  }],
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  calendar: { width: 54, height: 58, borderRadius: 15, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#403521' : '#F5EBDD' },
  calendarMonth: { color: isDark ? '#E8C47F' : '#946D29', fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  calendarDay: { color: colors.text, fontSize: 23, fontWeight: '800', fontVariant: ['tabular-nums'] },
  dateColumn: { flex: 1, gap: 5 },
  date: { color: colors.text, fontSize: 16, lineHeight: 21, fontWeight: '800', textTransform: 'capitalize' },
  timeRow: { flexDirection: 'row', gap: 5, alignItems: 'center' },
  time: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderRadius: 999, backgroundColor: isDark ? '#38342B' : '#F4F0E8', paddingHorizontal: 10, paddingVertical: 6 },
  statusText: { color: isDark ? '#E3C98F' : '#846126', fontSize: 12, fontWeight: '700' },
  statusConfirmed: { color: isDark ? '#9CCAA9' : '#3E7951' },
  route: { gap: 12, paddingTop: 2 },
  routeRow: { flexDirection: 'row', gap: 10 },
  routeMarkerColumn: { width: 20, alignItems: 'center', paddingTop: 3 },
  routeDot: { width: 11, height: 11, borderRadius: 6, borderWidth: 3 },
  originDot: { borderColor: '#398BFA' },
  stopDot: { borderColor: '#dd9251' },
  destinationDot: { borderColor: '#E35B5B' },
  routeLine: { width: 1, backgroundColor: colors.border, flex: 1, marginTop: 4, marginBottom: -13 },
  routeText: { flex: 1, gap: 3 },
  label: { color: colors.textSecondary, fontSize: 11, fontWeight: '600' },
  address: { color: colors.text, fontSize: 14, lineHeight: 20, fontWeight: '700' },
  driverRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 14 },
  driverIcon: { width: 34, height: 34, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#403521' : '#F5EBDD' },
  driverText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600', flex: 1 },
  driverAction: { minWidth: 44, minHeight: 44, paddingHorizontal: 10, flexDirection: 'row', gap: 5, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#403521' : '#F5EBDD' },
  driverActionText: { color: isDark ? '#E8C47F' : '#946D29', fontSize: 12, fontWeight: '700' },
  removeIcon: { color: isDark ? '#F08A82' : '#B73E37' },
  searchPanel: { gap: 10 },
  searchRow: { flexDirection: 'row', gap: 8 },
  searchInput: { flex: 1, minHeight: 46, paddingHorizontal: 12, borderRadius: 12, color: colors.text, backgroundColor: isDark ? '#383430' : '#F3F0EB' },
  searchButton: { width: 46, height: 46, alignItems: 'center', justifyContent: 'center', borderRadius: 12, backgroundColor: '#B38737' },
  candidateRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 4 },
  candidateAvatar: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', backgroundColor: isDark ? '#403521' : '#F5EBDD' },
  candidatePhoto: { ...StyleSheet.absoluteFill, borderRadius: 20 },
  codeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  codeLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '600', flex: 1 },
  code: { color: colors.text, fontSize: 16, fontWeight: '800', letterSpacing: 1.5, fontVariant: ['tabular-nums'] },
  copyButton: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? '#403521' : '#F5EBDD' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 2 },
  primary: { backgroundColor: '#B38737', borderRadius: 12, paddingHorizontal: 16, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  primaryText: { color: '#241A09', fontWeight: '700' },
  secondary: { backgroundColor: isDark ? '#3A3430' : '#F0ECE7', borderRadius: 12, paddingHorizontal: 16, minHeight: 46, alignItems: 'center', justifyContent: 'center' },
  secondaryText: { color: colors.text, fontWeight: '700' },
  disabled: { opacity: 0.5 },
});
