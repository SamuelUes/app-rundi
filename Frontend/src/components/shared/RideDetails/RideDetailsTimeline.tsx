import React from 'react';
import { View, Text } from 'react-native';
import type { TFunction } from 'i18next';

interface RideDetailsTimelineProps {
  ride: any;
  formatDateTime: (dateString: any) => string;
  t: TFunction;
  styles: any;
}

export function RideDetailsTimeline({
  ride,
  formatDateTime,
  t,
  styles,
}: RideDetailsTimelineProps) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.timeline.title')}</Text>
      <View style={styles.card}>
        {ride.requestedAt && typeof ride.requestedAt !== 'object' ? (
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.requested')}</Text>
            <Text style={styles.dateValue}>{formatDateTime(ride.requestedAt)}</Text>
          </View>
        ) : null}
        {ride.acceptedAt && typeof ride.acceptedAt !== 'object' ? (
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.accepted')}</Text>
            <Text style={styles.dateValue}>{formatDateTime(ride.acceptedAt)}</Text>
          </View>
        ) : null}
        {ride.startedAt && typeof ride.startedAt !== 'object' ? (
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.started')}</Text>
            <Text style={styles.dateValue}>{formatDateTime(ride.startedAt)}</Text>
          </View>
        ) : null}
        {ride.completedAt && typeof ride.completedAt !== 'object' ? (
          <View style={styles.dateRow}>
            <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.completed')}</Text>
            <Text style={styles.dateValue}>{formatDateTime(ride.completedAt)}</Text>
          </View>
        ) : null}
        {ride.canceledAt && typeof ride.canceledAt !== 'object' ? (
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.canceled')}</Text>
              {ride.cancelReason && typeof ride.cancelReason === 'string' ? (
                <Text style={styles.cancelReason}>
                  {t('shared.rideDetail.sections.timeline.cancelReason', {
                    reason: ride.cancelReason,
                  })}
                </Text>
              ) : null}
            </View>
            <Text style={styles.dateValue}>{formatDateTime(ride.canceledAt)}</Text>
          </View>
        ) : null}
        {(!ride.canceledAt || typeof ride.canceledAt === 'object') &&
         ride.cancelReason && typeof ride.cancelReason === 'string' ? (
          <View style={styles.dateRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.dateLabel}>{t('shared.rideDetail.sections.timeline.canceled')}</Text>
              <Text style={styles.cancelReason}>
                {t('shared.rideDetail.sections.timeline.cancelReason', {
                  reason: ride.cancelReason,
                })}
              </Text>
            </View>
            <Text style={styles.dateValue}>{t('shared.rideDetail.labels.notAvailable')}</Text>
          </View>
        ) : null}
      </View>
    </View>
  );
}
