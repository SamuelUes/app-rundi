import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';
import { LoadingIcon } from '../../ui/LoadingIcon';
import { TimerEditIcon } from '../../ui/TimerEditIcon';
type TrFunction = (path: string, options?: Record<string, any>) => string;

interface SearchRideCTAProps {
  scheduledAt: number | null;
  submittingRequest: boolean;
  isRequestReady: boolean;
  onOpenScheduleModal: () => void;
  onClearSchedule: () => void;
  onConfirmRequest: () => void;
  styles: any;
  colors: { primary?: string; text?: string; textSecondary?: string };
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
  colors,
  tr,
}: SearchRideCTAProps) {
  const accentColor = colors.primary || '#b38737';
  return (
    <View style={styles.ctaContainer}>
      {scheduledAt ? (
        <View style={styles.scheduledRow}>
          <TouchableOpacity
            style={styles.scheduledInfo}
            disabled={submittingRequest}
            onPress={onOpenScheduleModal}
          >
            <TimerEditIcon size={16} color={accentColor} />
            <Text style={styles.scheduledText} numberOfLines={1}>
              {tr('scheduling.scheduledLabel', {
                date: new Date(scheduledAt).toLocaleString(),
              })}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.scheduledClear}
            disabled={submittingRequest}
            onPress={onClearSchedule}
            accessibilityRole="button"
            accessibilityLabel={tr('scheduling.clearButton')}
          >
            <MaterialIcons name="close" size={18} color={colors.textSecondary || '#666666'} />
          </TouchableOpacity>
        </View>
      ) : null}
      <View style={styles.ctaRow}>
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
        <TouchableOpacity
          style={[
            styles.scheduleIconCta,
            scheduledAt && styles.scheduleIconCtaActive,
            submittingRequest && styles.ctaDisabled,
          ]}
          disabled={submittingRequest}
          onPress={onOpenScheduleModal}
          accessibilityRole="button"
          accessibilityLabel={tr('scheduling.openButton')}
        >
          <TimerEditIcon size={24} color={'#fff'} />
        </TouchableOpacity>
      </View>
    </View>
  );
}
