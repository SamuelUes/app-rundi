import React, { useMemo, useState } from 'react';
import { FlatList, Image, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../../hooks/shared/theme/useTheme';
import { LoadingIcon } from '../../ui/LoadingIcon';
import alertService from '../../../services/alertService';
import designatedCrewService from '../../../services/designatedCrewService';
import { isCandidateSelectable } from '../../../utils/designatedCrew';
import type { CrewCandidate } from '../../../types/designatedCrew';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function DesignatedCrewSearchModal({ visible, onClose }: Props) {
  const { t } = useTranslation();
  const { colors, isDark } = useTheme();
  const styles = useMemo(() => createStyles(colors, isDark), [colors, isDark]);
  const [license, setLicense] = useState('');
  const [results, setResults] = useState<CrewCandidate[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [invitingId, setInvitingId] = useState<string | null>(null);

  const handleSearch = async () => {
    if (license.replace(/[^a-z0-9]/gi, '').length < 4) {
      alertService.showErrorAlert(t('driver.crew.search.tooShort'));
      return;
    }
    setSearching(true);
    try {
      const response = await designatedCrewService.searchCandidates(license);
      setResults(response.candidates ?? []);
    } catch (error: any) {
      const message = String(error?.message || '');
      alertService.showErrorAlert(
        message.includes('RATE_LIMIT') ? t('driver.crew.search.rateLimited') : t('driver.crew.errors.generic'),
      );
    } finally {
      setSearching(false);
    }
  };

  const handleInvite = async (candidate: CrewCandidate) => {
    setInvitingId(candidate.driverId);
    try {
      await designatedCrewService.sendInvite(candidate.driverId);
      alertService.showSuccessAlert(t('driver.crew.search.title'), t('driver.crew.search.inviteSent', { name: candidate.name }));
      setResults(null);
      setLicense('');
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
            ★ {item.rating.toFixed(1)} · {t('driver.crew.search.license', { license: item.licenseNumber })}
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
            <Pressable onPress={onClose} hitSlop={8} accessibilityRole="button">
              <Ionicons name="close" size={22} color={colors.text} />
            </Pressable>
          </View>
          <View style={styles.searchRow}>
            <TextInput
              style={styles.input}
              value={license}
              onChangeText={setLicense}
              placeholder={t('driver.crew.search.placeholder')}
              placeholderTextColor={colors.textSecondary}
              autoCapitalize="characters"
              autoCorrect={false}
              returnKeyType="search"
              onSubmitEditing={handleSearch}
            />
            <Pressable style={styles.searchButton} onPress={handleSearch} disabled={searching} accessibilityRole="button">
              {searching ? <LoadingIcon size={16} color="#241A09" /> : <Text style={styles.inviteLabel}>{t('driver.crew.search.button')}</Text>}
            </Pressable>
          </View>
          {results && results.length === 0 && <Text style={styles.empty}>{t('driver.crew.search.empty')}</Text>}
          <FlatList data={results ?? []} keyExtractor={(item) => item.driverId} renderItem={renderItem} />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (colors: any, isDark: boolean) =>
  StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    sheet: { maxHeight: '80%', backgroundColor: colors.background, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, gap: 14 },
    header: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
    title: { fontSize: 18, fontWeight: '700', color: colors.text },
    subtitle: { fontSize: 13, color: colors.textSecondary, marginTop: 4 },
    searchRow: { flexDirection: 'row', gap: 10 },
    input: { flex: 1, height: 46, borderRadius: 14, paddingHorizontal: 14, color: colors.text, backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(28,25,23,0.05)' },
    searchButton: { height: 46, paddingHorizontal: 18, borderRadius: 14, backgroundColor: '#B38737', alignItems: 'center', justifyContent: 'center' },
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
