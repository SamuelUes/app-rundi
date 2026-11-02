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
  const validDate = (value: any) => value && typeof value !== 'object';

  const events: { key: string; label: string; at: string; canceled?: boolean; reason?: string }[] = [];

  if (validDate(ride.requestedAt)) {
    events.push({ key: 'requested', label: t('shared.rideDetail.sections.timeline.requested'), at: formatDateTime(ride.requestedAt) });
  }
  if (validDate(ride.acceptedAt)) {
    events.push({ key: 'accepted', label: t('shared.rideDetail.sections.timeline.accepted'), at: formatDateTime(ride.acceptedAt) });
  }
  if (validDate(ride.startedAt)) {
    events.push({ key: 'started', label: t('shared.rideDetail.sections.timeline.started'), at: formatDateTime(ride.startedAt) });
  }
  if (validDate(ride.completedAt)) {
    events.push({ key: 'completed', label: t('shared.rideDetail.sections.timeline.completed'), at: formatDateTime(ride.completedAt) });
  }
  if (validDate(ride.canceledAt)) {
    events.push({
      key: 'canceled',
      label: t('shared.rideDetail.sections.timeline.canceled'),
      at: formatDateTime(ride.canceledAt),
      canceled: true,
      reason: typeof ride.cancelReason === 'string' ? ride.cancelReason : undefined,
    });
  } else if (ride.cancelReason && typeof ride.cancelReason === 'string') {
    events.push({
      key: 'canceled',
      label: t('shared.rideDetail.sections.timeline.canceled'),
      at: t('shared.rideDetail.labels.notAvailable'),
      canceled: true,
      reason: ride.cancelReason,
    });
  }

  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{t('shared.rideDetail.sections.timeline.title')}</Text>
      <View style={styles.card}>
        {events.map((event, idx) => (
          <View key={event.key}>
            <View style={styles.timelineRow}>
              <View style={styles.timelineMarkerCol}>
                <View style={[styles.timelineDot, event.canceled && styles.timelineDotCanceled]} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dateLabel}>{event.label}</Text>
                {event.reason ? (
                  <Text style={styles.cancelReason}>
                    {t('shared.rideDetail.sections.timeline.cancelReason', {
                      reason: event.reason,
                    })}
                  </Text>
                ) : null}
              </View>
              <Text style={styles.dateValue}>{event.at}</Text>
            </View>
            {idx < events.length - 1 && <View style={styles.timelineConnector} />}
          </View>
        ))}
      </View>
    </View>
  );
}
