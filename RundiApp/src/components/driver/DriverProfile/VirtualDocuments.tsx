import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { getMyDocuments, type MyDocuments } from '../../../api/compliance';
import StorageImage from '../../shared/StorageImage';
import { useTheme } from '../../../hooks/shared/theme/useTheme';

type Props = {
  visible: boolean;
  onClose: () => void;
  vehicleId: string | null;
  profilePhoto: string | null;
  driver: any;
};

export function VirtualDocuments({ visible, onClose, vehicleId, profilePhoto, driver }: Props) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const [documents, setDocuments] = useState<MyDocuments | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setLoading(true);
    setError(false);
    getMyDocuments().then((data) => {
      if (!cancelled) setDocuments(data);
    }).catch(() => {
      if (!cancelled) setError(true);
    }).finally(() => {
      if (!cancelled) setLoading(false);
    });
    return () => { cancelled = true; };
  }, [visible]);

  const license = documents?.licenses.find((item) => item.is_current === true);
  const vehicle = documents?.vehicles.find((item) => item.id === vehicleId);
  const insurance = vehicle?.documents.vehicle_insurance_policies?.[0];
  const circulation = vehicle?.documents.vehicle_circulation_cards?.[0];
  const value = (v: unknown) => Array.isArray(v) ? v.join(', ') : v == null || v === '' ? '—' : String(v).slice(0, 100);
  const row = (label: string, v: unknown) => (
    <View style={styles.row} key={label}>
      <Text style={[styles.label, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[styles.value, { color: colors.text }]}>{value(v)}</Text>
    </View>
  );
  const card = (title: string, icon: React.ComponentProps<typeof Ionicons>['name'], rows: React.ReactNode, photo?: boolean) => (
    <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}>
      <View style={styles.cardHeader}>
        <View style={[styles.cardIcon, { backgroundColor: colors.surface }]}>
          <Ionicons name={icon} size={22} color={colors.primary} />
        </View>
        <Text style={[styles.cardTitle, { color: colors.text }]}>{title}</Text>
        {photo && (
          profilePhoto ? (
            <StorageImage uri={profilePhoto} style={styles.photo} contentFit="cover" />
          ) : (
            <View style={[styles.photo, styles.photoPlaceholder, { backgroundColor: colors.surface }]}>
              <Ionicons name="person-outline" size={25} color={colors.textSecondary} />
            </View>
          )
        )}
      </View>
      <View style={[styles.divider, { backgroundColor: colors.border }]} />
      <View style={styles.cardBody}>{rows}</View>
    </View>
  );

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top }]}>
        <View style={styles.header}>
          <TouchableOpacity
            style={[styles.backButton, { backgroundColor: colors.card, borderColor: colors.border, shadowColor: colors.shadow }]}
            onPress={onClose}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={t('driver.virtualDocuments.close')}
          >
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>{t('driver.virtualDocuments.title')}</Text>
          <View style={styles.headerSpacer} />
        </View>
        {loading ? <View style={styles.state}><ActivityIndicator color={colors.primary} /></View> : error ? (
          <View style={styles.state}>
            <Ionicons name="cloud-offline-outline" size={32} color={colors.textSecondary} />
            <Text style={[styles.message, { color: colors.textSecondary }]}>{t('driver.virtualDocuments.error')}</Text>
          </View>
        ) : (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {card(t('driver.virtualDocuments.license'), 'card-outline', <>
              {row(t('driver.virtualDocuments.number'), license?.license_number ?? driver?.licenseNumber ?? driver?.license_number)}
              {row(t('driver.virtualDocuments.expiry'), license?.expiry_date ?? driver?.licenseExpiry ?? driver?.license_expiry)}
              {row(t('driver.virtualDocuments.issue'), license?.issue_date)}
              {row(t('driver.virtualDocuments.type'), license?.license_type)}
              {row(t('driver.virtualDocuments.categories'), license?.categories)}
            </>, true)}
            {card(t('driver.virtualDocuments.insurance'), 'shield-checkmark-outline', <>
              {row(t('driver.virtualDocuments.plate'), vehicle?.plate)}
              {row(t('driver.virtualDocuments.number'), insurance?.policy_number)}
              {row(t('driver.virtualDocuments.insurer'), insurance?.insurer_name)}
              {row(t('driver.virtualDocuments.coverage'), insurance?.coverage_type)}
              {row(t('driver.virtualDocuments.issue'), insurance?.effective_from)}
              {row(t('driver.virtualDocuments.expiry'), insurance?.effective_until)}
            </>)}
            {card(t('driver.virtualDocuments.circulation'), 'car-outline', <>
              {row(t('driver.virtualDocuments.plate'), vehicle?.plate)}
              {row(t('driver.virtualDocuments.number'), circulation?.card_number)}
              {row(t('driver.virtualDocuments.issue'), circulation?.issued_at)}
              {row(t('driver.virtualDocuments.expiry'), circulation?.declared_valid_until)}
              {row(t('driver.virtualDocuments.brand'), circulation?.declared_brand)}
              {row(t('driver.virtualDocuments.model'), circulation?.declared_model)}
              {row(t('driver.virtualDocuments.year'), circulation?.declared_year)}
              {row('VIN', circulation?.declared_vin)}
            </>)}
          </ScrollView>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { 
    flex: 1 
  },
  
  header: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    paddingHorizontal: 20, 
    paddingTop: 8,
    paddingBottom: 18
  },

  backButton: { 
    width: 40, 
    height: 40, 
    borderRadius: 20, 
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center', 
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2
  },

  title: { 
    flex: 1, 
    fontSize: 20, 
    fontWeight: '700',
    textAlign: 'center'
  },

  headerSpacer: { 
    width: 40 
  },

  content: { 
    paddingHorizontal: 18, 
    paddingTop: 22, 
    gap: 16, 
    paddingBottom: 40 
  },

  card: { 
    borderRadius: 22, 
    borderWidth: 0.2, 
    padding: 20, 
    shadowOffset: { width: 0, height: 4 }, 
    shadowOpacity: 0.05, 
    shadowRadius: 12, 
    elevation: 2 
  },

  cardHeader: { 
    flexDirection: 'row', 
    alignItems: 'center', 
    gap: 12 
  },

  cardIcon: { 
    width: 44, 
    height: 44, 
    borderRadius: 15, 
    alignItems: 'center', 
    justifyContent: 'center' 
  },

  cardTitle: { 
    fontSize: 17, 
    fontWeight: '700', 
    flex: 1 
  },

  photo: { 
    width: 60, 
    height: 60, 
    borderRadius: 18 
  },

  photoPlaceholder: { 
    alignItems: 'center', 
    justifyContent: 'center' 
  },

  divider: { 
    height: StyleSheet.hairlineWidth, 
    marginTop: 18, 
    marginBottom: 12 
  },

  cardBody: { gap: 2 },

  row: { 
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'flex-start', 
    gap: 12, 
    paddingVertical: 7 
  },

  label: { 
    flex: 1, 
    fontSize: 13, 
    lineHeight: 19 
  },

  value: { 
    flex: 1.25, 
    textAlign: 'right', 
    fontSize: 14, 
    lineHeight: 19, 
    fontWeight: '600' 
  },

  state: { 
    flex: 1, 
    alignItems: 'center', 
    justifyContent: 'center', 
    padding: 24, 
    gap: 12 
  },

  message: { 
    textAlign: 'center', 
    fontSize: 14, 
    lineHeight: 20 
  },
});
