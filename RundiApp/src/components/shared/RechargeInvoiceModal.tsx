import React, { useMemo } from 'react';
import {
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { DriverRechargeHistoryItem } from '../../services/payment/rechargeFundsService';
import { useTranslation } from 'react-i18next';

type RechargeInvoiceModalProps = {
  visible: boolean;
  movement: DriverRechargeHistoryItem | null;
  onClose: () => void;
};

const formatCurrency = (value: number) => `C$${Number(value || 0).toFixed(2)}`;

const formatDateTime = (value?: string | null) => {
  if (!value) return '-';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
};

const toPrettyJson = (value: unknown) => {
  if (!value) return '-';
  try {
    return JSON.stringify(value, null, 2);
  } catch (_error) {
    return String(value);
  }
};

const asText = (value: unknown, fallback: string = '-') => {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
};

const Row = ({ label, value, textColor }: { label: string; value: string; textColor: string }) => (
  <View style={styles.row}>
    <Text style={styles.rowLabel}>{label}</Text>
    <Text style={[styles.rowValue, { color: textColor }]}>{value}</Text>
  </View>
);

export default function RechargeInvoiceModal({ visible, movement, onClose }: RechargeInvoiceModalProps) {
  const { colors } = useTheme();
  const { t } = useTranslation();

  const statusColor = useMemo(() => {
    if (!movement) return '#7B7B7B';
    const status = String(movement.status || '').toLowerCase();
    if (status === 'confirmed' || status === 'completed') return '#2E7D32';
    if (status === 'pending') return '#B77734';
    return '#B00020';
  }, [movement]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View
          style={[
            styles.sheet,
            {
              backgroundColor: colors.card,
              borderColor: colors.border,
            },
          ]}
        >
          <View style={styles.header}>
            <Text style={[styles.title, { color: colors.text }]}>{t('driver.rechargeFunds.invoice.title')}</Text>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: colors.textSecondary }]}>{t('driver.rechargeFunds.invoice.close')}</Text>
            </TouchableOpacity>
          </View>

          {!movement ? (
            <View style={styles.emptyWrap}>
              <Text style={[styles.emptyText, { color: colors.textSecondary }]}>{t('driver.rechargeFunds.invoice.empty')}</Text>
            </View>
          ) : (
            <ScrollView contentContainerStyle={styles.content}>
              <View style={[styles.amountCard, { backgroundColor: colors.surface, borderColor: colors.border }]}> 
                <Text style={[styles.amountLabel, { color: colors.textSecondary }]}>{t('driver.rechargeFunds.invoice.amount')}</Text>
                <Text style={[styles.amountValue, { color: colors.text }]}>{formatCurrency(movement.amount)}</Text>
                <View style={[styles.statusBadge, { backgroundColor: `${statusColor}20` }]}> 
                  <Text style={[styles.statusText, { color: statusColor }]}>
                    {asText(movement.status, t('driver.rechargeFunds.history.defaultStatus'))}
                  </Text>
                </View>
              </View>

              <Row label={t('driver.rechargeFunds.invoice.fields.movementId')} value={asText(movement.id)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.driverId')} value={asText(movement.driverId)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.createdAt')} value={formatDateTime(movement.createdAt)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.type')} value={asText(movement.rechargeType)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.source')} value={asText(movement.source)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.balanceBefore')} value={formatCurrency(movement.balanceBefore)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.balanceAfter')} value={formatCurrency(movement.balanceAfter)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.rideId')} value={asText(movement.rideId)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.externalReference')} value={asText(movement.externalReference)} textColor={colors.text} />
              <Row label={t('driver.rechargeFunds.invoice.fields.externalTransaction')} value={asText(movement.externalTransactionId)} textColor={colors.text} />

              {/* <View style={[styles.metaBlock, { backgroundColor: colors.surface }]}>
                <Text style={[styles.metaLabel, { color: colors.textSecondary }]}>{t('driver.rechargeFunds.invoice.fields.metadata')}</Text>
                <Text style={[styles.metaValue, { color: colors.text }]}>{toPrettyJson(movement.metadata)}</Text>
              </View> */}
            </ScrollView>
          )}
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    borderWidth: 1,
    maxHeight: '84%',
    minHeight: '56%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 10,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  closeBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  closeText: {
    fontSize: 14,
    fontWeight: '600',
  },
  emptyWrap: {
    padding: 20,
  },
  emptyText: {
    fontSize: 14,
  },
  content: {
    paddingHorizontal: 16,
    paddingBottom: 20,
    gap: 10,
  },
  amountCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 2,
  },
  amountLabel: {
    fontSize: 12,
    marginBottom: 4,
  },
  amountValue: {
    fontSize: 28,
    fontWeight: '800',
  },
  statusBadge: {
    alignSelf: 'flex-start',
    marginTop: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  row: {
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#99999955',
  },
  rowLabel: {
    fontSize: 12,
    color: '#8A8A8A',
    marginBottom: 3,
  },
  rowValue: {
    fontSize: 14,
    fontWeight: '600',
  },
  metaBlock: {
    borderRadius: 12,
    padding: 12,
    marginTop: 8,
  },
  metaLabel: {
    fontSize: 12,
    marginBottom: 6,
  },
  metaValue: {
    fontFamily: 'monospace',
    fontSize: 12,
    lineHeight: 18,
  },
});
