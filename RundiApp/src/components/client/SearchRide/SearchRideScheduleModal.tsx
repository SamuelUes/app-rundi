import React, { useEffect, useMemo, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  Modal,
  Platform,
  KeyboardAvoidingView,
  Animated,
} from 'react-native';
import { Picker as RNPicker } from '@react-native-picker/picker';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TimerEditIcon } from '../../ui/TimerEditIcon';
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

export function SearchRideScheduleModal({
  visible,
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
  const insets = useSafeAreaInsets();
  const sheetAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.spring(sheetAnim, {
        toValue: 1,
        damping: 26,
        stiffness: 300,
        mass: 1,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(sheetAnim, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start();
    }
  }, [visible, sheetAnim]);

  const sheetAnimatedStyle = {
    transform: [
      {
        translateY: sheetAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [340, 0],
        }),
      },
    ],
    opacity: sheetAnim,
  };

  const selectionPreview = useMemo(() => {
    const day = scheduleDayOptions[scheduleDayIndex]?.date;
    if (!day) return '';
    const preview = new Date(day);
    preview.setHours(scheduleHour, scheduleMinute, 0, 0);
    return tr('scheduling.scheduledLabel', { date: preview.toLocaleString() });
  }, [scheduleDayOptions, scheduleDayIndex, scheduleHour, scheduleMinute, tr]);

  const accentColor = colors.primary || '#b38737';
  const pickerWheelStyle = [styles.schedulePickerWheel, { color: colors.text }];

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent={Platform.OS === 'android'}
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        style={styles.scheduleModalRoot}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <TouchableWithoutFeedback onPress={onClose}>
          <View style={styles.scheduleBackdrop} />
        </TouchableWithoutFeedback>

        <View style={styles.scheduleSheetDock} pointerEvents="box-none">
          <Animated.View
            style={[
              styles.scheduleSheet,
              { paddingBottom: Math.max(insets.bottom, 12) + 8 },
              sheetAnimatedStyle,
            ]}
          >
            <View style={styles.scheduleHandleZone}>
              <View style={styles.scheduleHandle} />
            </View>

            <View style={styles.scheduleHeaderRow}>
              <View style={styles.scheduleTitleIcon}>
                <TimerEditIcon size={18} color={accentColor} />
              </View>
              <Text style={styles.scheduleTitle} numberOfLines={1}>
                {tr('scheduling.modalTitle')}
              </Text>
              <TouchableOpacity
                style={styles.scheduleCloseBtn}
                onPress={onClose}
                accessibilityRole="button"
                accessibilityLabel={tr('scheduling.modalCancel')}
              >
                <Ionicons name="close" size={20} color={colors.textSecondary} />
              </TouchableOpacity>
            </View>

            <Text style={styles.scheduleSectionLabel}>{tr('scheduling.dateTimeLabel')}</Text>
            <View style={styles.schedulePickerTrack}>
              <View style={styles.scheduleDayPickerCol}>
                <RNPicker
                  selectedValue={scheduleDayIndex}
                  onValueChange={(value) => onSetScheduleDayIndex(Number(value))}
                  style={pickerWheelStyle}
                  dropdownIconColor={colors.textSecondary}
                >
                  {scheduleDayOptions.map((opt, i) => (
                    <RNPicker.Item
                      key={`day-${i}`}
                      label={opt.label}
                      value={i}
                      color={colors.text}
                    />
                  ))}
                </RNPicker>
              </View>
              <View style={styles.scheduleTimePickerCol}>
                <RNPicker
                  selectedValue={scheduleHour}
                  onValueChange={(value) => onSetScheduleHour(Number(value))}
                  style={pickerWheelStyle}
                  dropdownIconColor={colors.textSecondary}
                >
                  {scheduleHourOptions.map((h) => (
                    <RNPicker.Item
                      key={`hour-${h}`}
                      label={String(h).padStart(2, '0')}
                      value={h}
                      color={colors.text}
                    />
                  ))}
                </RNPicker>
              </View>
              <View style={styles.scheduleTimePickerCol}>
                <RNPicker
                  selectedValue={scheduleMinute}
                  onValueChange={(value) => onSetScheduleMinute(Number(value))}
                  style={pickerWheelStyle}
                  dropdownIconColor={colors.textSecondary}
                >
                  {scheduleMinuteOptionsForHour.map((m) => (
                    <RNPicker.Item
                      key={`min-${m}`}
                      label={String(m).padStart(2, '0')}
                      value={m}
                      color={colors.text}
                    />
                  ))}
                </RNPicker>
              </View>
            </View>

            {selectionPreview ? (
              <Text style={styles.schedulePreview}>{selectionPreview}</Text>
            ) : null}

            <TouchableOpacity
              style={styles.scheduleConfirmBtn}
              onPress={onConfirm}
              accessibilityRole="button"
            >
              <Text style={styles.scheduleConfirmText}>{tr('scheduling.modalConfirm')}</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.scheduleCancelBtn}
              onPress={onClose}
              accessibilityRole="button"
            >
              <Text style={styles.scheduleCancelText}>{tr('scheduling.modalCancel')}</Text>
            </TouchableOpacity>

            <View style={styles.scheduleHintRow}>
              <Ionicons name="information-circle" size={14} color={colors.textSecondary} />
              <Text style={styles.scheduleHintText}>{tr('scheduling.scheduleHint')}</Text>
            </View>
          </Animated.View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}
