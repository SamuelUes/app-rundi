import React, { useEffect, useMemo, useRef, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import { LoadingIcon } from '../../ui/LoadingIcon';
import alertService from '../../../services/notification/alertService';
import designatedCrewService from '../../../services/driver/designatedCrewService';
import { isCandidateSelectable } from '../../../utils/driver/designatedCrew';
import type { CrewCandidate } from '../../../types/designatedCrew';

interface Props {
  visible: boolean;
  serviceAreaId: string | null;
  onClose: () => void;
}

const normalizeText = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

const normalizeLicense = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/gi, '');

function matchesQuery(candidate: CrewCandidate, query: string): boolean {
  if (!query) return true;
  const text = normalizeText(query);
  const license = normalizeLicense(query);
  return (
    normalizeText(candidate.name || '').includes(text) ||
    (license.length > 0 && normalizeLicense(candidate.licenseNumber || '').includes(license))
  );
}

export function DesignatedCrewSearchModal({ visible, serviceAreaId, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [query, setQuery] = useState('');
  const [allCandidates, setAllCandidates] = useState<CrewCandidate[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);
  const loadedAreaRef = useRef<string | null>(null);

  const loadAreaCandidates = async (areaId: string) => {
    setLoading(true);
    try {
      const response = await designatedCrewService.searchCandidates({ areaId });
      setAllCandidates(response.candidates ?? []);
      loadedAreaRef.current = areaId;
    } catch (error: any) {
      const message = String(error?.message || '');
      alertService.showErrorAlert(
        message.includes('RATE_LIMIT') ? t('driver.crew.search.rateLimited') : t('driver.crew.errors.generic'),
      );
      setAllCandidates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleLicenseSearch = async () => {
    const license = normalizeLicense(query);
    if (license.length < 4) {
      alertService.showErrorAlert(t('driver.crew.search.tooShort'));
      return;
    }
    setLoading(true);
    try {
      const response = await designatedCrewService.searchCandidates({ licenseNumber: license });
      setAllCandidates(response.candidates ?? []);
    } catch (error: any) {
      const message = String(error?.message || '');
      alertService.showErrorAlert(
        message.includes('RATE_LIMIT') ? t('driver.crew.search.rateLimited') : t('driver.crew.errors.generic'),
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!visible) return;
    if (serviceAreaId && loadedAreaRef.current !== serviceAreaId) {
      void loadAreaCandidates(serviceAreaId);
    }
  }, [visible, serviceAreaId]);

  useEffect(() => {
    if (!visible) {
      setQuery('');
      setAllCandidates(null);
      setInvitingId(null);
      loadedAreaRef.current = null;
    }
  }, [visible]);

  const results = useMemo(() => {
    if (!allCandidates) return null;
    const filtered = allCandidates.filter((c) => matchesQuery(c, query));
    const order: Record<string, number> = { available: 0, busy: 1, offline: 2, paired: 3, not_eligible: 4, self: 5 };
    return filtered.sort((a, b) => (order[a.status] ?? 9) - (order[b.status] ?? 9));
  }, [allCandidates, query]);

  const handleInvite = async (candidate: CrewCandidate) => {
    setInvitingId(candidate.driverId);
    try {
      await designatedCrewService.sendInvite(candidate.driverId);
      alertService.showSuccessAlert(t('driver.crew.search.title'), t('driver.crew.search.inviteSent', { name: candidate.name }));
      setAllCandidates(null);
      setQuery('');
      onClose();
    } catch {
      alertService.showErrorAlert(t('driver.crew.errors.generic'));
    } finally {
      setInvitingId(null);
    }
  };

  const renderItem = ({ item }: { item: CrewCandidate }) => {
    const selectable = isCandidateSelectable(item.status);
    return (
      <View style={[styles.row, !selectable && styles.rowDisabled]}>
        <View style={styles.avatar}>
          {item.photoURL ? <Image source={{ uri: item.photoURL }} style={styles.avatarImage} /> : <Ionicons name="person" size={20} color={colors.textSecondary} />}
        </View>
        <View style={styles.rowCopy}>
          <Text style={styles.name}>{item.name}</Text>
          <Text style={styles.meta}>
            ★ {item.rating.toFixed(1)} · {t('driver.crew.search.license', { license: item.licenseNumber || '—' })}
          </Text>
          <Text style={[styles.status, selectable ? styles.statusOk : styles.statusOff]}>
            {t(`driver.crew.search.status.${item.status}`)}
          </Text>
        </View>
        <Pressable
          style={[styles.inviteButton, !selectable && styles.inviteButtonDisabled]}
          disabled={!selectable || invitingId !== null}
          onPress={() => handleInvite(item)}
          accessibilityRole="button"
          accessibilityState={{ disabled: !selectable }}
        >
          {invitingId === item.driverId ? (
            <LoadingIcon size={16} color="#241A09" />
          ) : (
            <Text style={styles.inviteLabel}>{t('driver.crew.search.invite')}</Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>{t('driver.crew.search.title')}</Text>
              <Text style={styles.subtitle}>{t('driver.crew.search.subtitle')}</Text>
            </View>
            {serviceAreaId && (
              <Pressable
                onPress={() => void loadAreaCandidates(serviceAreaId)}
                hitSlop={8}
                accessibilityRole="button"
                style={styles.refreshButton}
              >
                <Ionicons name="refresh" size={20} color={colors.text} />
              </Pressable>
            )}
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchRow}>
            <View style={styles.inputWrap}>
              <Ionicons name="search" size={18} color={colors.textSecondary} style={styles.inputIcon} />
              <TextInput
                style={styles.input}
                value={query}
                onChangeText={setQuery}
                placeholder={t('driver.crew.search.placeholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="search"
                onSubmitEditing={serviceAreaId ? undefined : handleLicenseSearch}
              />
              {query.length > 0 && (
                <Pressable onPress={() => setQuery('')} hitSlop={8} accessibilityRole="button">
                  <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
                </Pressable>
              )}
            </View>
            {!serviceAreaId && (
              <Pressable style={styles.searchButton} onPress={handleLicenseSearch} disabled={loading} accessibilityRole="button">
                {loading ? <LoadingIcon size={16} color="#241A09" /> : <Text style={styles.inviteLabel}>{t('driver.crew.search.button')}</Text>}
              </Pressable>
            )}
          </View>
          {loading && !results && (
            <View style={styles.loadingWrap}>
              <LoadingIcon size={24} color={colors.textSecondary} />
            </View>
          )}
          {results && results.length === 0 && (
            <Text style={styles.empty}>{t(query ? 'driver.crew.search.emptyFiltered' : 'driver.crew.search.empty')}</Text>
          )}
          <FlatList data={results ?? []} keyExtractor={(item) => item.driverId} renderItem={renderItem} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: { maxHeight: '80%', minHeight: '45%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    refreshButton: { padding: 4 },
    searchRow: { flexDirection: 'row', gap: 10 },
    inputWrap: {
      flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 12, flexDirection: 'row', alignItems: 'center', gap: 8,
      backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)',
    },
    inputIcon: { marginRight: 2 },
    input: { flex: 1, height: '100%', color: colors.text, fontSize: 15, padding: 0 },
    searchButton: { height: 46, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#B38737', alignItems: 'center', justifyContent: 'center' },
    loadingWrap: { paddingVertical: 24, alignItems: 'center' },
    empty: { fontSize: 13, color: colors.textSecondary, textAlign: 'center', paddingVertical: 12 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12 },
    rowDisabled: { opacity: 0.55 },
    avatar: { width: 42, height: 42, borderRadius: 21, overflow: 'hidden', alignItems: 'center', justifyContent: 'center', backgroundColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(28,25,23,0.06)' },
    avatarImage: { width: '100%', height: '100%' },
    rowCopy: { flex: 1, gap: 2 },
    name: { fontSize: 15, fontWeight: '700', color: colors.text },
    meta: { fontSize: 12, color: colors.textSecondary },
    status: { fontSize: 12, fontWeight: '600' },
    statusOk: { color: '#2E7D32' },
    statusOff: { color: colors.textSecondary },
    inviteButton: { paddingHorizontal: 14, height: 36, borderRadius: 18, backgroundColor: '#B38737', alignItems: 'center', justifyContent: 'center' },
    inviteButtonDisabled: { backgroundColor: isDark ? 'rgba(255,255,255,0.1)' : 'rgba(28,25,23,0.1)' },
    inviteLabel: { fontSize: 14, fontWeight: '700', color: '#241A09' },
  });
