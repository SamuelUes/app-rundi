import React, { useMemo, useState } from 'react';
import {
  Modal,
  StyleProp,
  StyleSheet,
  Text,
  TextInputProps,
  TouchableOpacity,
  View,
  ViewStyle,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../hooks/shared/theme/useTheme';
import { FormattedInput } from './FormattedInput';

type DateValueFormat = 'iso' | 'dmy';
type DatePickerMode = 'month' | 'weeks';

interface DatePickerFieldProps extends Omit<TextInputProps, 'value' | 'onChangeText' | 'style'> {
  value: string;
  onChangeText: (value: string) => void;
  style?: StyleProp<ViewStyle>;
  /** Formato del texto del campo: 'iso' = YYYY-MM-DD (default), 'dmy' = DD-MM-YYYY */
  valueFormat?: DateValueFormat;
  /** 'month' = calendario mensual (default), 'weeks' = tira de una semana navegable */
  mode?: DatePickerMode;
  /** Límites de selección: los días fuera del rango se ven deshabilitados */
  minDate?: Date;
  maxDate?: Date;
}

const MONTH_NAMES: Record<'es' | 'en', string[]> = {
  es: [
    'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
    'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre',
  ],
  en: [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ],
};

const WEEKDAY_NAMES: Record<'es' | 'en', string[]> = {
  es: ['D', 'L', 'M', 'X', 'J', 'V', 'S'],
  en: ['S', 'M', 'T', 'W', 'T', 'F', 'S'],
};

const parseDate = (value: string, format: DateValueFormat): Date | null => {
  const match =
    format === 'dmy'
      ? /^(\d{2})-(\d{2})-(\d{4})$/.exec(value.trim())
      : /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const year = Number(format === 'dmy' ? match[3] : match[1]);
  const month = Number(match[2]);
  const day = Number(format === 'dmy' ? match[1] : match[3]);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }
  return date;
};

const formatDateValue = (date: Date, format: DateValueFormat): string => {
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return format === 'dmy' ? `${day}-${month}-${year}` : `${year}-${month}-${day}`;
};

const startOfDay = (date: Date): Date => {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

const startOfWeek = (date: Date): Date => {
  const d = startOfDay(date);
  d.setDate(d.getDate() - d.getDay());
  return d;
};

const addDays = (date: Date, days: number): Date => {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
};

/**
 * Campo de fecha: permite escribir la fecha manualmente (con máscara
 * automática YYYY-MM-DD o DD-MM-YYYY según `valueFormat`) o elegirla
 * desde un calendario modal.
 */
export const DatePickerField = ({
  value,
  onChangeText,
  style,
  placeholder,
  placeholderTextColor,
  valueFormat = 'iso',
  mode = 'month',
  minDate,
  maxDate,
  ...inputProps
}: DatePickerFieldProps) => {
  const { colors } = useTheme();
  const { t, i18n } = useTranslation();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [visible, setVisible] = useState(false);
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth());
  const [viewWeekStart, setViewWeekStart] = useState(() => startOfWeek(new Date()));

  const minDay = useMemo(() => (minDate ? startOfDay(minDate) : null), [minDate]);
  const maxDay = useMemo(() => (maxDate ? startOfDay(maxDate) : null), [maxDate]);

  const selectedDate = parseDate(value ?? '', valueFormat);
  const today = new Date();
  const lang = i18n.language?.toLowerCase().startsWith('en') ? 'en' : 'es';
  const editable = inputProps.editable !== false;

  const openCalendar = () => {
    let base = selectedDate ?? new Date();
    if (minDay && startOfDay(base).getTime() < minDay.getTime()) base = minDay;
    if (maxDay && startOfDay(base).getTime() > maxDay.getTime()) base = maxDay;
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
    setViewWeekStart(startOfWeek(base));
    setVisible(true);
  };

  const shiftMonth = (delta: number) => {
    const next = new Date(viewYear, viewMonth + delta, 1);
    setViewYear(next.getFullYear());
    setViewMonth(next.getMonth());
  };

  const isDayDisabled = (date: Date) => {
    const day = startOfDay(date).getTime();
    if (minDay && day < minDay.getTime()) return true;
    if (maxDay && day > maxDay.getTime()) return true;
    return false;
  };

  const weekDays = useMemo(
    () => Array.from({ length: 7 }, (_, i) => addDays(viewWeekStart, i)),
    [viewWeekStart],
  );
  const weekEnd = weekDays[6];
  const weekTitle =
    weekEnd.getMonth() === viewWeekStart.getMonth()
      ? `${MONTH_NAMES[lang][viewWeekStart.getMonth()]} ${viewWeekStart.getFullYear()}`
      : `${MONTH_NAMES[lang][viewWeekStart.getMonth()]} – ${MONTH_NAMES[lang][weekEnd.getMonth()]} ${weekEnd.getFullYear()}`;
  const canShiftWeek = (delta: number) => {
    const next = addDays(viewWeekStart, delta * 7);
    const nextEnd = addDays(next, 6);
    if (minDay && nextEnd.getTime() < minDay.getTime()) return false;
    if (maxDay && next.getTime() > maxDay.getTime()) return false;
    return true;
  };
  const shiftWeek = (delta: number) => {
    if (canShiftWeek(delta)) setViewWeekStart(addDays(viewWeekStart, delta * 7));
  };

  const selectWeekDay = (day: Date) => {
    if (isDayDisabled(day)) return;
    onChangeText(formatDateValue(day, valueFormat));
    setVisible(false);
  };

  const selectDay = (day: number) => {
    if (isDayDisabled(new Date(viewYear, viewMonth, day))) return;
    onChangeText(formatDateValue(new Date(viewYear, viewMonth, day), valueFormat));
    setVisible(false);
  };

  const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
  const cells: (number | null)[] = [
    ...Array<null>(firstWeekday).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const isSameDay = (a: Date, year: number, month: number, day: number) =>
    a.getFullYear() === year && a.getMonth() === month && a.getDate() === day;

  return (
    <View style={[style, styles.fieldRow]}>
      <FormattedInput
        {...inputProps}
        format={valueFormat === 'dmy' ? 'date-dmy' : 'date'}
        maxLength={10}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={placeholderTextColor ?? colors.textSecondary}
        style={styles.input}
      />
      <TouchableOpacity
        onPress={openCalendar}
        style={styles.calendarButton}
        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
        accessibilityRole="button"
        disabled={!editable}
      >
        <MaterialIcons
          name="calendar-month"
          size={22}
          color={editable ? colors.primary : colors.textSecondary}
        />
      </TouchableOpacity>

      <Modal
        visible={visible}
        transparent
        animationType="fade"
        onRequestClose={() => setVisible(false)}
      >
        <TouchableOpacity
          style={styles.overlay}
          activeOpacity={1}
          onPress={() => setVisible(false)}
        >
          <TouchableOpacity activeOpacity={1} style={styles.card} onPress={() => {}}>
            <View style={styles.headerRow}>
              <TouchableOpacity
                style={[
                  styles.navButton,
                  mode === 'weeks' && !canShiftWeek(-1) && styles.navButtonDisabled,
                ]}
                onPress={() => (mode === 'weeks' ? shiftWeek(-1) : shiftMonth(-1))}
                disabled={mode === 'weeks' && !canShiftWeek(-1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name="chevron-left"
                  size={24}
                  color={mode === 'weeks' && !canShiftWeek(-1) ? colors.disabled : colors.text}
                />
              </TouchableOpacity>
              <Text style={styles.monthTitle}>
                {mode === 'weeks' ? weekTitle : `${MONTH_NAMES[lang][viewMonth]} ${viewYear}`}
              </Text>
              <TouchableOpacity
                style={[
                  styles.navButton,
                  mode === 'weeks' && !canShiftWeek(1) && styles.navButtonDisabled,
                ]}
                onPress={() => (mode === 'weeks' ? shiftWeek(1) : shiftMonth(1))}
                disabled={mode === 'weeks' && !canShiftWeek(1)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <MaterialIcons
                  name="chevron-right"
                  size={24}
                  color={mode === 'weeks' && !canShiftWeek(1) ? colors.disabled : colors.text}
                />
              </TouchableOpacity>
            </View>

            {mode === 'weeks' ? (
              <View style={styles.weekStrip}>
                {weekDays.map((day, index) => {
                  const isSelected = !!selectedDate && startOfDay(selectedDate).getTime() === day.getTime();
                  const isToday = startOfDay(today).getTime() === day.getTime();
                  const disabled = isDayDisabled(day);
                  return (
                    <TouchableOpacity
                      key={`week-day-${index}`}
                      style={styles.weekDayCell}
                      onPress={() => selectWeekDay(day)}
                      disabled={disabled}
                    >
                      <Text
                        style={[
                          styles.weekDayLabel,
                          disabled && styles.dayTextDisabled,
                          isSelected && styles.daySelectedText,
                        ]}
                      >
                        {WEEKDAY_NAMES[lang][day.getDay()]}
                      </Text>
                      <View
                        style={[
                          styles.dayCellInner,
                          isToday && !isSelected && styles.dayToday,
                          isSelected && styles.daySelected,
                        ]}
                      >
                        <Text
                          style={[
                            styles.dayText,
                            disabled && styles.dayTextDisabled,
                            isSelected && styles.daySelectedText,
                          ]}
                        >
                          {day.getDate()}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <>
                <View style={styles.weekRow}>
                  {WEEKDAY_NAMES[lang].map((dayName, index) => (
                    <Text key={`${dayName}-${index}`} style={styles.weekLabel}>
                      {dayName}
                    </Text>
                  ))}
                </View>

                <View style={styles.daysGrid}>
                  {cells.map((day, index) => {
                    if (day === null) {
                      return <View key={`empty-${index}`} style={styles.dayCell} />;
                    }
                    const isSelected =
                      !!selectedDate && isSameDay(selectedDate, viewYear, viewMonth, day);
                    const isToday = isSameDay(today, viewYear, viewMonth, day);
                    const disabled = isDayDisabled(new Date(viewYear, viewMonth, day));
                    return (
                      <TouchableOpacity
                        key={`day-${day}`}
                        style={styles.dayCell}
                        onPress={() => selectDay(day)}
                        disabled={disabled}
                      >
                        <View
                          style={[
                            styles.dayCellInner,
                            isToday && !isSelected && styles.dayToday,
                            isSelected && styles.daySelected,
                          ]}
                        >
                          <Text
                            style={[
                              styles.dayText,
                              disabled && styles.dayTextDisabled,
                              isSelected && styles.daySelectedText,
                            ]}
                          >
                            {day}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </>
            )}

            <View style={styles.footerRow}>
              <TouchableOpacity
                style={styles.footerButton}
                onPress={() => setVisible(false)}
              >
                <Text style={styles.footerButtonText}>{t('common.actions.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>
    </View>
  );
};

export default DatePickerField;

const createStyles = (colors: any) =>
  StyleSheet.create({
    fieldRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    input: {
      flex: 1,
      padding: 0,
      paddingVertical: 0,
      fontSize: 15,
      color: colors.text,
    },
    calendarButton: {
      paddingLeft: 10,
    },
    overlay: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.5)',
      justifyContent: 'center',
      padding: 24,
    },
    card: {
      backgroundColor: colors.card,
      borderRadius: 16,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    navButton: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.surface,
    },
    navButtonDisabled: {
      opacity: 0.45,
    },
    monthTitle: {
      fontSize: 16,
      fontWeight: '700',
      color: colors.text,
    },
    weekRow: {
      flexDirection: 'row',
      marginBottom: 6,
    },
    weekLabel: {
      flex: 1,
      textAlign: 'center',
      fontSize: 12,
      fontWeight: '600',
      color: colors.textSecondary,
    },
    daysGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
    },
    dayCell: {
      width: '14.2857%',
      alignItems: 'center',
      paddingVertical: 2,
    },
    dayCellInner: {
      width: 38,
      height: 38,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 19,
    },
    dayText: {
      fontSize: 14,
      color: colors.text,
    },
    dayTextDisabled: {
      color: colors.disabled,
    },
    weekStrip: {
      flexDirection: 'row',
      marginTop: 2,
    },
    weekDayCell: {
      flex: 1,
      alignItems: 'center',
      gap: 4,
    },
    weekDayLabel: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.textSecondary,
      letterSpacing: 0.4,
    },
    dayToday: {
      borderWidth: 1,
      borderColor: colors.primary,
    },
    daySelected: {
      backgroundColor: colors.primary,
    },
    daySelectedText: {
      color: '#fff',
      fontWeight: '700',
    },
    footerRow: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      marginTop: 10,
    },
    footerButton: {
      paddingHorizontal: 16,
      paddingVertical: 8,
      borderRadius: 8,
    },
    footerButtonText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 14,
    },
  });
