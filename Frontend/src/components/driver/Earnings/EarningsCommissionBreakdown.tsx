import React from 'react';
import { View, Text } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { TFunction } from 'i18next';

interface CommissionCategory {
  normal: { rides: number; commission: number };
  designated: { rides: number; commission: number };
  total: { rides: number; commission: number };
}

interface CommissionBreakdownData {
  cash: CommissionCategory;
  card: CommissionCategory;
  totals: { commission: number };
}

interface EarningsCommissionBreakdownProps {
  commissionBreakdown: CommissionBreakdownData;
  commissionNormalPercent: string;
  commissionDesignatedPercent: string;
  colors: any;
  formatCurrency: (amount?: number | null) => string;
  styles: any;
  t: TFunction;
}

export function EarningsCommissionBreakdown({
  commissionBreakdown,
  commissionNormalPercent,
  commissionDesignatedPercent,
  colors,
  formatCurrency,
  styles,
  t,
}: EarningsCommissionBreakdownProps) {
  const hasCommissions =
    commissionBreakdown.cash.total.commission > 0 || commissionBreakdown.card.total.commission > 0;
  if (!hasCommissions) return null;

  const renderCategory = (
    category: CommissionCategory,
    icon: string,
    label: string,
    subtotalLabel: string,
  ) => {
    if (category.total.rides === 0) return null;
    return (
      <View style={styles.commissionSection}>
        <View style={styles.commissionHeader}>
          <MaterialIcons name={icon as any} size={24} color={colors.textSecondary} />
          <Text style={styles.commissionLabel}>{label}</Text>
        </View>

        {category.normal.rides > 0 && (
          <View style={styles.commissionRow}>
            <Text style={styles.commissionDetail}>
              {t('driver.earnings.commission.normalTrips', {
                count: category.normal.rides,
                rate: commissionNormalPercent,
              })}
            </Text>
            <Text style={styles.commissionAmount}>
              {formatCurrency(category.normal.commission)}
            </Text>
          </View>
        )}

        {category.designated.rides > 0 && (
          <View style={styles.commissionRow}>
            <Text style={styles.commissionDetail}>
              {t('driver.earnings.commission.designatedTrips', {
                count: category.designated.rides,
                rate: commissionDesignatedPercent,
              })}
            </Text>
            <Text style={styles.commissionAmount}>
              {formatCurrency(category.designated.commission)}
            </Text>
          </View>
        )}

        <View style={[styles.commissionRow, styles.commissionRowTotal]}>
          <Text style={styles.commissionTotalLabel}>{subtotalLabel}</Text>
          <Text style={styles.commissionTotalAmount}>
            {formatCurrency(category.total.commission)}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.commissionCard}>
      <Text style={styles.commissionTitle}>{t('driver.earnings.commission.title')}</Text>

      {renderCategory(
        commissionBreakdown.cash,
        'payments',
        t('driver.earnings.commission.cashLabel'),
        t('driver.earnings.commission.subtotalCash'),
      )}

      {renderCategory(
        commissionBreakdown.card,
        'credit-card',
        t('driver.earnings.commission.cardLabel'),
        t('driver.earnings.commission.subtotalCard'),
      )}

      <View style={styles.commissionGrandTotal}>
        <Text style={styles.commissionGrandTotalLabel}>{t('driver.earnings.commission.totalLabel')}</Text>
        <Text style={styles.commissionGrandTotalAmount}>
          {formatCurrency(commissionBreakdown.totals.commission)}
        </Text>
      </View>
    </View>
  );
}
