import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { LoadingIcon } from '../../ui/LoadingIcon';
type TrFunction = (path: string, options?: Record<string, any>) => string;

interface SearchRideCTAProps {
  scheduledAt: number | null;
  submittingRequest: boolean;
  isRequestReady: boolean;
  onOpenScheduleModal: () => void;
  onClearSchedule: () => void;
  onConfirmRequest: () => void;
  styles: any;
  tr: TrFunction;
}

export function SearchRideCTA({
  scheduledAt,
  submittingRequest,
  isRequestReady,
  onOpenScheduleModal,
  onClearSchedule,
  onConfirmRequest,
  styles,
  tr,
}: SearchRideCTAProps) {
  return (
    <View style={styles.ctaContainer}>
      <TouchableOpacity
        style={[styles.scheduleCta, submittingRequest && styles.scheduleCtaDisabled]}
        disabled={submittingRequest}
        onPress={onOpenScheduleModal}
      >
        <Text style={styles.scheduleCtaText}>
          {scheduledAt
            ? tr('scheduling.scheduledLabel', {
                date: new Date(scheduledAt).toLocaleString(),
              })
            : tr('scheduling.openButton')}
        </Text>
      </TouchableOpacity>
      {scheduledAt ? (
        <TouchableOpacity
          style={[styles.scheduleClearCta, submittingRequest && styles.scheduleCtaDisabled]}
          disabled={submittingRequest}
          onPress={onClearSchedule}
        >
          <Text style={styles.scheduleClearText}>{tr('scheduling.clearButton')}</Text>
        </TouchableOpacity>
      ) : null}
      <TouchableOpacity
        style={[styles.cta, (!isRequestReady || submittingRequest) && styles.ctaDisabled]}
        disabled={!isRequestReady || submittingRequest}
        onPress={onConfirmRequest}
      >
        {submittingRequest ? (
          <View style={styles.ctaLoadingRow}>
            <LoadingIcon size={20} color="#fff" style={{ marginRight: 8 }} />
            <Text style={styles.ctaText}>{tr('cta.loading')}</Text>
          </View>
        ) : (
          <Text style={styles.ctaText}>
            {scheduledAt ? tr('cta.primaryScheduled') : tr('cta.primary')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
}
