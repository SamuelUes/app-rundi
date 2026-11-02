import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, Modal, Platform } from 'react-native';
import { Picker as RNPicker } from '@react-native-picker/picker';
import { DatePickerField } from '../../ui/DatePickerField';
import { getScheduleBounds } from '../../../utils/format/schedule';
type TrFunction = (path: string, options?: Record<string, any>) => string;

interface ScheduleOption {
  label: string;
  date?: Date;
}

interface SearchRideScheduleModalProps {
  visible: boolean;
  isDark: boolean;
  colors: any;
  scheduleDayIndex: number;
  scheduleDayOptions: ScheduleOption[];
  scheduleHour: number;
  scheduleHourOptions: number[];
  scheduleMinute: number;
  scheduleMinuteOptionsForHour: number[];
  onSetScheduleDayIndex: (value: number) => void;
  onSetScheduleHour: (value: number) => void;
  onSetScheduleMinute: (value: number) => void;
  onClose: () => void;
  onConfirm: () => void;
  styles: any;
  tr: TrFunction;
}

const toDmy = (date: Date): string =>
  `${String(date.getDate()).padStart(2, '0')}-${String(date.getMonth() + 1).padStart(2, '0')}-${date.getFullYear()}`;

export function SearchRideScheduleModal({
  visible,
  isDark,
  colors,
  scheduleDayIndex,
  scheduleDayOptions,
  scheduleHour,
  scheduleHourOptions,
  scheduleMinute,
  scheduleMinuteOptionsForHour,
  onSetScheduleDayIndex,
  onSetScheduleHour,
  onSetScheduleMinute,
  onClose,
  onConfirm,
  styles,
  tr,
}: SearchRideScheduleModalProps) {
  const [dateText, setDateText] = useState('');
  const scheduleBounds = useMemo(() => getScheduleBounds(), [visible]);

  useEffect(() => {
    const day = scheduleDayOptions[scheduleDayIndex]?.date;
    if (day) setDateText(toDmy(day));
  }, [scheduleDayIndex, scheduleDayOptions]);

  const handleDateTextChange = useCallback(
    (text: string) => {
      setDateText(text);
      const match = /^(\d{2})-(\d{2})-(\d{4})$/.exec(text.trim());
      if (!match) return;
      const picked = new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
      if (Number.isNaN(picked.getTime())) return;
      const idx = scheduleDayOptions.findIndex(
        (opt) =>
          opt.date &&
          opt.date.getFullYear() === picked.getFullYear() &&
          opt.date.getMonth() === picked.getMonth() &&
          opt.date.getDate() === picked.getDate(),
      );
      if (idx >= 0) {
        onSetScheduleDayIndex(idx);
        return;
      }
      const first = scheduleDayOptions[0]?.date;
      const last = scheduleDayOptions[scheduleDayOptions.length - 1]?.date;
      if (first && picked.getTime() < first.getTime()) onSetScheduleDayIndex(0);
      else if (last && picked.getTime() > last.getTime()) onSetScheduleDayIndex(scheduleDayOptions.length - 1);
    },
    [scheduleDayOptions, onSetScheduleDayIndex],
  );

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.scheduleOverlay}>
        <View style={[styles.scheduleCard, { backgroundColor: isDark ? '#1f1f1f' : colors.card }]}>
          <Text style={[styles.scheduleTitle, { color: colors.text }]}>{tr('scheduling.modalTitle')}</Text>

          <Text style={[styles.scheduleLabel, { color: colors.text }]}>{tr('scheduling.dateLabel')}</Text>
          <View
            style={[
              styles.pickerBox,
              {
                borderColor: colors.border || (isDark ? '#444' : '#ddd'),
                paddingHorizontal: 12,
                paddingVertical: Platform.select({ ios: 10, android: 4, default: 6 }),
                justifyContent: 'center',
              },
            ]}
          >
            <DatePickerField
              value={dateText}
              onChangeText={handleDateTextChange}
              valueFormat="dmy"
              mode="weeks"
              minDate={scheduleBounds.minDate}
              maxDate={scheduleBounds.maxDate}
              placeholder="DD-MM-YYYY"
              placeholderTextColor={colors.textSecondary}
            />
          </View>

          <Text style={[styles.scheduleLabel, { color: colors.text }]}>{tr('scheduling.timeLabel')}</Text>
          <View style={styles.timeRow}>
            <View
              style={[
                styles.pickerBox,
                styles.timePicker,
                { borderColor: colors.border || (isDark ? '#444' : '#ddd') },
              ]}
            >
              <RNPicker selectedValue={scheduleHour} onValueChange={(value) => onSetScheduleHour(Number(value))}>
                {scheduleHourOptions.map((h) => (
                  <RNPicker.Item key={`hour-${h}`} label={String(h).padStart(2, '0')} value={h} />
                ))}
              </RNPicker>
            </View>
            <Text style={[styles.timeSeparator, { color: colors.text }]}>:</Text>
            <View
              style={[
                styles.pickerBox,
                styles.timePicker,
                { borderColor: colors.border || (isDark ? '#444' : '#ddd') },
              ]}
            >
              <RNPicker selectedValue={scheduleMinute} onValueChange={(value) => onSetScheduleMinute(Number(value))}>
                {scheduleMinuteOptionsForHour.map((m) => (
                  <RNPicker.Item key={`min-${m}`} label={String(m).padStart(2, '0')} value={m} />
                ))}
              </RNPicker>
            </View>
          </View>

          <View style={styles.scheduleButtonsRow}>
            <TouchableOpacity
              style={[
                styles.scheduleButton,
                styles.scheduleCancelButton,
                { borderColor: colors.border || (isDark ? '#444' : '#ddd') },
              ]}
              onPress={onClose}
            >
              <Text style={[styles.scheduleButtonText, { color: colors.text }]}>{tr('scheduling.modalCancel')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.scheduleButton, { backgroundColor: colors.primary || '#b38737' }]} onPress={onConfirm}>
              <Text style={styles.scheduleButtonTextPrimary}>{tr('scheduling.modalConfirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
