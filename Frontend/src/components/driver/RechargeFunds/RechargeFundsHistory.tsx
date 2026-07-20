import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import type { TFunction } from 'i18next';

interface RechargeFundsHistoryProps {
  historyItems: any[];
  rechargeHistory: any[];
  historyPage: number;
  totalHistoryPages: number;
  historyTexts: any;
  formatCurrency: (n: number) => string;
  formatDateLabel: (value?: string | null) => string;
  asText: (value: unknown, fallback?: string) => string;
  onOpenInvoice: (item: any) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  t: TFunction;
  styles: any;
}

export function RechargeFundsHistory({
  historyItems,
  rechargeHistory,
  historyPage,
  totalHistoryPages,
  historyTexts,
  formatCurrency,
  formatDateLabel,
  asText,
  onOpenInvoice,
  onPrevPage,
  onNextPage,
  t,
  styles,
}: RechargeFundsHistoryProps) {
  return (
    <View style={styles.historyCard}>
      <View style={styles.historyHeader}>
        <Text style={styles.historyTitle}>{historyTexts.title}</Text>
        <Text style={styles.historyCounter}>{t('driver.rechargeFunds.history.totalLabel', { count: rechargeHistory.length })}</Text>
      </View>

      {historyItems.length === 0 ? (
        <Text style={styles.historyEmptyText}>{historyTexts.empty}</Text>
      ) : (
        <View style={styles.historyList}>
          {historyItems.map((item) => (
            <TouchableOpacity
              key={item.id}
              style={styles.historyItem}
              activeOpacity={0.8}
              onPress={() => onOpenInvoice(item)}
            >
              <View style={styles.historyItemTop}>
                <Text style={styles.historyItemAmount}>{formatCurrency(item.amount)}</Text>
                <Text style={styles.historyItemStatus}>{asText(item.status, t('driver.rechargeFunds.history.defaultStatus'))}</Text>
              </View>
              <Text style={styles.historyItemMeta}>{formatDateLabel(item.createdAt)}</Text>
              <Text style={styles.historyItemMeta}>
                {t('driver.rechargeFunds.history.sourceLabel', {
                  source: asText(item.source, t('driver.rechargeFunds.history.defaultSource')),
                })}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      <View style={styles.paginationRow}>
        <TouchableOpacity
          style={[styles.paginationBtn, historyPage <= 1 && styles.paginationBtnDisabled]}
          disabled={historyPage <= 1}
          onPress={onPrevPage}
        >
          <Text style={styles.paginationBtnText}>{historyTexts.previous}</Text>
        </TouchableOpacity>

        <Text style={styles.paginationText}>
          {t('driver.rechargeFunds.history.page', {
            current: historyPage,
            total: totalHistoryPages,
          })}
        </Text>

        <TouchableOpacity
          style={[
            styles.paginationBtn,
            historyPage >= totalHistoryPages && styles.paginationBtnDisabled,
          ]}
          disabled={historyPage >= totalHistoryPages}
          onPress={onNextPage}
        >
          <Text style={styles.paginationBtnText}>{historyTexts.next}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}
