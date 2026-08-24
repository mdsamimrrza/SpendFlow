import React, { useState, useMemo } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import {
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  format,
  isSameMonth,
  isSameDay,
  isWithinInterval,
  isAfter,
  isBefore,
  parseISO,
  isValid,
  subDays,
} from 'date-fns';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

export interface DateRange {
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null;   // YYYY-MM-DD
}

interface CalendarModalProps {
  visible: boolean;
  onClose: () => void;
  onApply: (range: DateRange) => void;
  initialRange?: DateRange;
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];

export function CalendarModal({
  visible,
  onClose,
  onApply,
  initialRange,
}: CalendarModalProps) {
  const theme = useTheme();

  // Current view month in the calendar
  const [currentMonth, setCurrentMonth] = useState<Date>(() => {
    if (initialRange?.startDate) {
      const parsed = parseISO(initialRange.startDate);
      if (isValid(parsed)) return parsed;
    }
    return new Date();
  });

  const [startDate, setStartDate] = useState<string | null>(initialRange?.startDate ?? null);
  const [endDate, setEndDate] = useState<string | null>(initialRange?.endDate ?? null);

  // Sync with initialRange when modal opens
  React.useEffect(() => {
    if (visible) {
      setStartDate(initialRange?.startDate ?? null);
      setEndDate(initialRange?.endDate ?? null);
      if (initialRange?.startDate) {
        const parsed = parseISO(initialRange.startDate);
        if (isValid(parsed)) setCurrentMonth(parsed);
      } else {
        setCurrentMonth(new Date());
      }
    }
  }, [visible, initialRange]);

  const daysInGrid = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDateGrid = startOfWeek(monthStart);
    const endDateGrid = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: startDateGrid, end: endDateGrid });
  }, [currentMonth]);

  const handleDatePress = (day: Date) => {
    const formatted = format(day, 'yyyy-MM-dd');

    if (!startDate || (startDate && endDate)) {
      // Starting new selection
      setStartDate(formatted);
      setEndDate(null);
    } else if (startDate && !endDate) {
      const parsedStart = parseISO(startDate);
      if (isBefore(day, parsedStart)) {
        // User picked a day before start -> make it the new start
        setStartDate(formatted);
        setEndDate(null);
      } else if (isSameDay(day, parsedStart)) {
        // User tapped the same date -> single day range
        setEndDate(formatted);
      } else {
        // Valid end date
        setEndDate(formatted);
      }
    }
  };

  const handleQuickPreset = (preset: 'today' | 'yesterday' | 'last7' | 'thisMonth' | 'lastMonth') => {
    const today = new Date();
    const todayStr = format(today, 'yyyy-MM-dd');

    switch (preset) {
      case 'today':
        setStartDate(todayStr);
        setEndDate(todayStr);
        setCurrentMonth(today);
        break;
      case 'yesterday': {
        const yest = subDays(today, 1);
        const yestStr = format(yest, 'yyyy-MM-dd');
        setStartDate(yestStr);
        setEndDate(yestStr);
        setCurrentMonth(yest);
        break;
      }
      case 'last7': {
        const start = subDays(today, 6);
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(todayStr);
        setCurrentMonth(today);
        break;
      }
      case 'thisMonth': {
        const start = startOfMonth(today);
        const end = endOfMonth(today);
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
        setCurrentMonth(today);
        break;
      }
      case 'lastMonth': {
        const prevMonth = subMonths(today, 1);
        const start = startOfMonth(prevMonth);
        const end = endOfMonth(prevMonth);
        setStartDate(format(start, 'yyyy-MM-dd'));
        setEndDate(format(end, 'yyyy-MM-dd'));
        setCurrentMonth(prevMonth);
        break;
      }
    }
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const handleApply = () => {
    onApply({
      startDate,
      endDate: endDate || startDate, // if only startDate chosen, treat as single day or end=start
    });
    onClose();
  };

  const isSelectedStart = (day: Date) => startDate && isSameDay(day, parseISO(startDate));
  const isSelectedEnd = (day: Date) => endDate && isSameDay(day, parseISO(endDate));
  const isInRange = (day: Date) => {
    if (!startDate || !endDate) return false;
    const s = parseISO(startDate);
    const e = parseISO(endDate);
    return isWithinInterval(day, { start: s, end: e });
  };
  const isToday = (day: Date) => isSameDay(day, new Date());

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View
        style={[
          styles.modalContainer,
          {
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: theme.radius.lg,
            borderTopRightRadius: theme.radius.lg,
          },
        ]}
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
            <CalendarIcon size={20} color={theme.colors.primary} />
            <Text variant="h2">Select Date Range</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated }]}
          >
            <X size={18} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* Selected Range Display Banner */}
        <View
          style={[
            styles.rangeBanner,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={{ flex: 1 }}>
            <Text variant="caption" muted>From</Text>
            <Text variant="label" style={{ color: startDate ? theme.colors.text : theme.colors.textMuted }}>
              {startDate ? format(parseISO(startDate), 'MMM dd, yyyy') : 'Select start'}
            </Text>
          </View>
          <View style={[styles.rangeDivider, { backgroundColor: theme.colors.border }]} />
          <View style={{ flex: 1, paddingLeft: theme.spacing.md }}>
            <Text variant="caption" muted>To</Text>
            <Text variant="label" style={{ color: endDate || startDate ? theme.colors.text : theme.colors.textMuted }}>
              {endDate ? format(parseISO(endDate), 'MMM dd, yyyy') : startDate ? format(parseISO(startDate), 'MMM dd, yyyy') : 'Select end'}
            </Text>
          </View>
        </View>

        {/* Quick presets */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsContainer}>
          <Pressable
            style={[styles.presetChip, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            onPress={() => handleQuickPreset('today')}
          >
            <Text variant="caption" style={{ fontWeight: '600' }}>Today</Text>
          </Pressable>
          <Pressable
            style={[styles.presetChip, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            onPress={() => handleQuickPreset('yesterday')}
          >
            <Text variant="caption" style={{ fontWeight: '600' }}>Yesterday</Text>
          </Pressable>
          <Pressable
            style={[styles.presetChip, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            onPress={() => handleQuickPreset('last7')}
          >
            <Text variant="caption" style={{ fontWeight: '600' }}>Last 7 Days</Text>
          </Pressable>
          <Pressable
            style={[styles.presetChip, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            onPress={() => handleQuickPreset('thisMonth')}
          >
            <Text variant="caption" style={{ fontWeight: '600' }}>This Month</Text>
          </Pressable>
          <Pressable
            style={[styles.presetChip, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
            onPress={() => handleQuickPreset('lastMonth')}
          >
            <Text variant="caption" style={{ fontWeight: '600' }}>Last Month</Text>
          </Pressable>
        </ScrollView>

        {/* Month Navigator */}
        <View style={styles.monthNav}>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentMonth((m) => subMonths(m, 1))}
            style={[styles.navBtn, { backgroundColor: theme.colors.surfaceElevated }]}
          >
            <ChevronLeft size={20} color={theme.colors.text} />
          </Pressable>
          <Text variant="h3" style={{ fontWeight: '700' }}>
            {format(currentMonth, 'MMMM yyyy')}
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => setCurrentMonth((m) => addMonths(m, 1))}
            style={[styles.navBtn, { backgroundColor: theme.colors.surfaceElevated }]}
          >
            <ChevronRight size={20} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* Days of Week Header */}
        <View style={styles.weekdaysRow}>
          {WEEKDAYS.map((wd) => (
            <View key={wd} style={styles.weekdayCell}>
              <Text variant="caption" muted style={{ fontWeight: '700' }}>
                {wd}
              </Text>
            </View>
          ))}
        </View>

        {/* Days Grid */}
        <View style={styles.daysGrid}>
          {daysInGrid.map((day, idx) => {
            const isCurrentMonth = isSameMonth(day, currentMonth);
            const isStart = isSelectedStart(day);
            const isEnd = isSelectedEnd(day);
            const inRange = isInRange(day);
            const today = isToday(day);

            let bgColor = 'transparent';
            let textColor = isCurrentMonth ? theme.colors.text : theme.colors.textMuted;
            let borderRadius = 20;

            if (isStart || isEnd) {
              bgColor = theme.colors.primary;
              textColor = theme.isDark ? '#06201D' : '#FFFFFF';
            } else if (inRange) {
              bgColor = theme.isDark ? 'rgba(45, 212, 191, 0.2)' : 'rgba(15, 159, 142, 0.15)';
              textColor = theme.colors.primary;
              borderRadius = 8;
            }

            return (
              <Pressable
                key={idx}
                onPress={() => handleDatePress(day)}
                style={[
                  styles.dayCell,
                  {
                    backgroundColor: bgColor,
                    borderRadius,
                    borderWidth: today && !isStart && !isEnd ? 1 : 0,
                    borderColor: theme.colors.primary,
                  },
                ]}
              >
                <Text
                  style={{
                    color: textColor,
                    fontWeight: isStart || isEnd || today ? '700' : '400',
                    fontSize: 14,
                  }}
                >
                  {format(day, 'd')}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* Actions */}
        <View style={styles.footerActions}>
          <Button
            title="Reset"
            variant="secondary"
            onPress={handleClear}
            style={{ flex: 1 }}
          />
          <Button
            title="Apply Range"
            onPress={handleApply}
            style={{ flex: 2 }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  modalContainer: {
    padding: 20,
    gap: 14,
    maxHeight: '90%',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
  rangeDivider: {
    width: 1,
    height: 28,
  },
  presetsContainer: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  navBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  weekdaysRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  weekdayCell: {
    width: 40,
    alignItems: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 2,
  },
  dayCell: {
    width: 42,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 2,
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
