import React from 'react';
import { View, Text, TouchableOpacity, Modal } from 'react-native';
import { Picker as RNPicker } from '@react-native-picker/picker';
type TrFunction = (path: string, options?: Record<string, any>) => string;

interface ScheduleOption {
  label: string;
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
          <View style={[styles.pickerBox, { borderColor: colors.border || (isDark ? '#444' : '#ddd') }]}>
            <RNPicker selectedValue={scheduleDayIndex} onValueChange={(value) => onSetScheduleDayIndex(Number(value))}>
              {scheduleDayOptions.map((opt, idx) => (
                <RNPicker.Item key={`day-${idx}`} label={opt.label} value={idx} />
              ))}
            </RNPicker>
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
            <TouchableOpacity style={[styles.scheduleButton, { backgroundColor: '#b38737' }]} onPress={onConfirm}>
              <Text style={styles.scheduleButtonTextPrimary}>{tr('scheduling.modalConfirm')}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
