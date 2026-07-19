import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import {
  isSameDay,
  startOfDay,
  roundMinutesUp,
  getScheduleBounds,
  SCHEDULE_MINUTE_STEP,
} from '../../../utils/schedule';
import alertService from '../../../services/alertService';

interface UseScheduleRideOptions {
  tr: (path: string, options?: Record<string, any>) => string;
}

export function useScheduleRide({ tr }: UseScheduleRideOptions) {
  const [scheduleModalVisible, setScheduleModalVisible] = useState(false);
  const [scheduledAt, setScheduledAt] = useState<number | null>(null);
  const [scheduleDayIndex, setScheduleDayIndex] = useState(0);
  const [scheduleHour, setScheduleHour] = useState<number>(0);
  const [scheduleMinute, setScheduleMinute] = useState<number>(0);

  const trRef = useRef(tr);
  trRef.current = tr;

  const scheduleDayOptions = useMemo(() => {
    const { minDate, maxDate } = getScheduleBounds();
    const days: Array<{ label: string; date: Date }> = [];
    const cursor = startOfDay(minDate);
    const end = startOfDay(maxDate);
    while (cursor.getTime() <= end.getTime()) {
      const d = new Date(cursor);
      const label = d.toLocaleDateString(undefined, {
        weekday: 'short',
        month: 'short',
        day: '2-digit',
      });
      days.push({ label, date: d });
      cursor.setDate(cursor.getDate() + 1);
    }
    return days;
  }, []);

  const scheduleMinuteOptions = useMemo(() => {
    const values: number[] = [];
    for (let m = 0; m < 60; m += SCHEDULE_MINUTE_STEP) {
      values.push(m);
    }
    return values;
  }, []);

  const selectedScheduleDay = useMemo(
    () => scheduleDayOptions[scheduleDayIndex]?.date || scheduleDayOptions[0]?.date || null,
    [scheduleDayIndex, scheduleDayOptions],
  );

  const scheduleHourOptions = useMemo(() => {
    if (!selectedScheduleDay) return [];
    const { minDate, maxDate } = getScheduleBounds();
    const minHour = isSameDay(selectedScheduleDay, minDate) ? minDate.getHours() : 0;
    const maxHour = isSameDay(selectedScheduleDay, maxDate) ? maxDate.getHours() : 23;
    if (minHour > maxHour) return [];
    const values: number[] = [];
    for (let h = minHour; h <= maxHour; h++) {
      values.push(h);
    }
    return values;
  }, [selectedScheduleDay]);

  const scheduleMinuteOptionsForHour = useMemo(() => {
    if (!selectedScheduleDay) return scheduleMinuteOptions;
    const { minDate, maxDate } = getScheduleBounds();
    let minMinute = 0;
    let maxMinute = 59;
    if (isSameDay(selectedScheduleDay, minDate) && scheduleHour === minDate.getHours()) {
      minMinute = minDate.getMinutes();
    }
    if (isSameDay(selectedScheduleDay, maxDate) && scheduleHour === maxDate.getHours()) {
      maxMinute = maxDate.getMinutes();
    }
    return scheduleMinuteOptions.filter((minute) => minute >= minMinute && minute <= maxMinute);
  }, [selectedScheduleDay, scheduleHour, scheduleMinuteOptions]);

  useEffect(() => {
    if (!scheduleHourOptions.length) return;
    if (!scheduleHourOptions.includes(scheduleHour)) {
      setScheduleHour(scheduleHourOptions[0]);
    }
  }, [scheduleHourOptions, scheduleHour]);

  useEffect(() => {
    if (!scheduleMinuteOptionsForHour.length) return;
    if (!scheduleMinuteOptionsForHour.includes(scheduleMinute)) {
      setScheduleMinute(scheduleMinuteOptionsForHour[0]);
    }
  }, [scheduleMinuteOptionsForHour, scheduleMinute]);

  const openScheduleModal = useCallback(() => {
    const { minDate, maxDate } = getScheduleBounds();
    let base = scheduledAt ? roundMinutesUp(new Date(scheduledAt), SCHEDULE_MINUTE_STEP) : new Date(minDate);
    if (base.getTime() < minDate.getTime()) {
      base = new Date(minDate);
    } else if (base.getTime() > maxDate.getTime()) {
      base = new Date(maxDate);
    }
    base.setSeconds(0, 0);

    const dayIndex = scheduleDayOptions.findIndex((opt) => {
      return (
        opt.date.getFullYear() === base.getFullYear() &&
        opt.date.getMonth() === base.getMonth() &&
        opt.date.getDate() === base.getDate()
      );
    });

    setScheduleDayIndex(dayIndex >= 0 ? dayIndex : 0);
    setScheduleHour(base.getHours());
    setScheduleMinute(base.getMinutes() - (base.getMinutes() % SCHEDULE_MINUTE_STEP));
    setScheduleModalVisible(true);
  }, [scheduledAt, scheduleDayOptions]);

  const applyScheduleSelection = useCallback(() => {
    const day = scheduleDayOptions[scheduleDayIndex]?.date;
    if (!day) {
      return;
    }

    const candidate = new Date(day);
    candidate.setHours(scheduleHour, scheduleMinute, 0, 0);
    const ms = candidate.getTime();
    const { minDate, maxDate } = getScheduleBounds();
    const minMs = minDate.getTime();
    const maxMs = maxDate.getTime();

    if (ms < minMs || ms > maxMs) {
      alertService.showErrorAlert(trRef.current('scheduling.invalidRange'));
      return;
    }

    setScheduledAt(ms);
    setScheduleModalVisible(false);
  }, [scheduleDayOptions, scheduleDayIndex, scheduleHour, scheduleMinute]);

  const clearSchedule = useCallback(() => {
    setScheduledAt(null);
  }, []);

  return {
    scheduleModalVisible,
    setScheduleModalVisible,
    scheduledAt,
    setScheduledAt,
    scheduleDayIndex,
    setScheduleDayIndex,
    scheduleHour,
    setScheduleHour,
    scheduleMinute,
    setScheduleMinute,
    scheduleDayOptions,
    scheduleHourOptions,
    scheduleMinuteOptions,
    scheduleMinuteOptionsForHour,
    openScheduleModal,
    applyScheduleSelection,
    clearSchedule,
  };
}
