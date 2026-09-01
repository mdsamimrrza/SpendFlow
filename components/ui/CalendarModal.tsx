import React, { useState, useMemo, useRef } from 'react';
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
  isBefore,
  parseISO,
  isValid,
  subDays,
  setMonth,
  setYear,
  getMonth,
  getYear,
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
   /** 'single' — picks one date (hides From/To banner and range presets).
   *  'range'  — default, full range-picker behaviour. */
  mode?: 'single' | 'range';
}

const WEEKDAYS = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

// Year range: 2000 → current year + 1
const CURRENT_YEAR = new Date().getFullYear();
const YEARS = Array.from({ length: CURRENT_YEAR - 2000 + 2 }, (_, i) => 2000 + i);

export function CalendarModal({
  visible,
  onClose,
  onApply,
  initialRange,
  mode = 'range',
}: CalendarModalProps) {
  const isSingle = mode === 'single';
  const theme = useTheme();

  // 'calendar' — normal day grid  |  'monthYear' — month+year jump picker
  const [view, setView] = useState<'calendar' | 'monthYear'>('calendar');

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

  // Year being browsed inside the month/year picker (independent of currentMonth
  // so the user can scroll years without affecting the calendar yet)
  const [pickerYear, setPickerYear] = useState<number>(getYear(currentMonth));

  const yearScrollRef = useRef<ScrollView>(null);

  // Sync state when modal (re)opens
  React.useEffect(() => {
    if (visible) {
      setStartDate(initialRange?.startDate ?? null);
      setEndDate(initialRange?.endDate ?? null);
      setView('calendar');
      if (initialRange?.startDate) {
        const parsed = parseISO(initialRange.startDate);
        if (isValid(parsed)) {
          setCurrentMonth(parsed);
          setPickerYear(getYear(parsed));
        }
      } else {
        const now = new Date();
        setCurrentMonth(now);
        setPickerYear(getYear(now));
      }
    }
  }, [visible, initialRange]);

  // Scroll the year list to the selected year each time the picker opens
  React.useEffect(() => {
    if (view === 'monthYear') {
      const idx = YEARS.indexOf(pickerYear);
      if (idx >= 0 && yearScrollRef.current) {
        // Each year row is ~44px tall; scroll so it sits near top with a bit of padding
        setTimeout(() => {
          yearScrollRef.current?.scrollTo({ y: Math.max(0, idx * 44 - 44), animated: false });
        }, 50);
      }
    }
  }, [view, pickerYear]);

  const daysInGrid = useMemo(() => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDateGrid = startOfWeek(monthStart);
    const endDateGrid = endOfWeek(monthEnd);
    return eachDayOfInterval({ start: startDateGrid, end: endDateGrid });
  }, [currentMonth]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDatePress = (day: Date) => {
    const formatted = format(day, 'yyyy-MM-dd');

    if (isSingle) {
      setStartDate(formatted);
      setEndDate(formatted);
      onApply({ startDate: formatted, endDate: formatted });
      onClose();
      return;
    }

    if (!startDate || (startDate && endDate)) {
      setStartDate(formatted);
      setEndDate(null);
    } else if (startDate && !endDate) {
      const parsedStart = parseISO(startDate);
      if (isBefore(day, parsedStart)) {
        setStartDate(formatted);
        setEndDate(null);
      } else if (isSameDay(day, parsedStart)) {
        setEndDate(formatted);
      } else {
        setEndDate(formatted);
      }
    }
  };

  const handleMonthYearSelect = (monthIndex: number, year: number) => {
    const next = setYear(setMonth(currentMonth, monthIndex), year);
    setCurrentMonth(next);
    setView('calendar');
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
        setStartDate(format(startOfMonth(today), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(today), 'yyyy-MM-dd'));
        setCurrentMonth(today);
        break;
      }
      case 'lastMonth': {
        const prev = subMonths(today, 1);
        setStartDate(format(startOfMonth(prev), 'yyyy-MM-dd'));
        setEndDate(format(endOfMonth(prev), 'yyyy-MM-dd'));
        setCurrentMonth(today);
        break;
      }
    }
  };

  const handleClear = () => {
    setStartDate(null);
    setEndDate(null);
  };

  const handleApply = () => {
    onApply({ startDate, endDate: endDate || startDate });
    onClose();
  };

  // ── Day grid helpers ───────────────────────────────────────────────────────

  const isSelectedStart = (day: Date) => !!(startDate && isSameDay(day, parseISO(startDate)));
  const isSelectedEnd   = (day: Date) => !!(endDate && isSameDay(day, parseISO(endDate)));
  const isInRange = (day: Date) => {
    if (!startDate || !endDate) return false;
    return isWithinInterval(day, { start: parseISO(startDate), end: parseISO(endDate) });
  };
  const isToday = (day: Date) => isSameDay(day, new Date());

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose} />
      <View
        style={[
          styles.modalContainer,
          {
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
          },
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          bounces={false}
          contentContainerStyle={{ gap: 10 }}
          scrollEnabled={view === 'calendar'}
        >
          {/* ── Header ── */}
          <View style={styles.header}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spacing.sm }}>
              <CalendarIcon size={20} color={theme.colors.primary} />
              <Text variant="h2" style={{ fontSize: 18, fontWeight: '800' }}>
                {isSingle ? 'Select Date' : 'Select Date Range'}
              </Text>
            </View>
            <Pressable
              accessibilityRole="button"
              onPress={onClose}
              hitSlop={10}
              style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated }]}
            >
              <X size={18} color={theme.colors.text} />
            </Pressable>
          </View>

          {/* ── Date / Range Banner ── */}
          {isSingle ? (
            <View
              style={[
                styles.rangeBanner,
                { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border, justifyContent: 'center' },
              ]}
            >
              <Text variant="label" style={{ fontWeight: '700', color: startDate ? theme.colors.text : theme.colors.textMuted, textAlign: 'center' }}>
                {startDate ? format(parseISO(startDate), 'EEEE, MMM dd, yyyy') : 'Tap a date to select'}
              </Text>
            </View>
          ) : (
            <View style={[styles.rangeBanner, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
              <View style={{ flex: 1 }}>
                <Text variant="caption" muted style={{ fontSize: 11 }}>From</Text>
                <Text variant="label" style={{ fontWeight: '700', color: startDate ? theme.colors.text : theme.colors.textMuted }}>
                  {startDate ? format(parseISO(startDate), 'MMM dd, yyyy') : 'Select start'}
                </Text>
              </View>
              <View style={[styles.rangeDivider, { backgroundColor: theme.colors.border }]} />
              <View style={{ flex: 1, paddingLeft: theme.spacing.md }}>
                <Text variant="caption" muted style={{ fontSize: 11 }}>To</Text>
                <Text variant="label" style={{ fontWeight: '700', color: endDate || startDate ? theme.colors.text : theme.colors.textMuted }}>
                  {endDate
                    ? format(parseISO(endDate), 'MMM dd, yyyy')
                    : startDate
                    ? format(parseISO(startDate), 'MMM dd, yyyy')
                    : 'Select end'}
                </Text>
              </View>
            </View>
          )}

          {/* ── Quick Presets (range mode only) ── */}
          {!isSingle && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.presetsContainer}>
              {(['today', 'yesterday', 'last7', 'thisMonth', 'lastMonth'] as const).map((p) => (
                <Pressable
                  key={p}
                  style={[styles.presetChip, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}
                  onPress={() => handleQuickPreset(p)}
                >
                  <Text style={{ fontWeight: '700', fontSize: 12, color: theme.colors.text }}>
                    {p === 'today' ? 'Today' : p === 'yesterday' ? 'Yesterday' : p === 'last7' ? 'Last 7 Days' : p === 'thisMonth' ? 'This Month' : 'Last Month'}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              MONTH NAVIGATOR — tapping the label opens the year+month picker
          ══════════════════════════════════════════════════════════════════ */}
          <View style={styles.monthNav}>
            {view === 'calendar' ? (
              <>
                {/* ← prev month */}
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCurrentMonth((m) => subMonths(m, 1))}
                  style={[styles.navBtn, { backgroundColor: theme.colors.surfaceElevated }]}
                >
                  <ChevronLeft size={18} color={theme.colors.text} />
                </Pressable>

                {/* Tappable month+year label → opens jump picker */}
                <Pressable
                  onPress={() => {
                    setPickerYear(getYear(currentMonth));
                    setView('monthYear');
                  }}
                  hitSlop={6}
                  style={[
                    styles.monthYearLabel,
                    { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border },
                  ]}
                >
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 15, color: theme.colors.primary }}>
                    {format(currentMonth, 'MMMM yyyy')}
                  </Text>
                  <ChevronRight size={13} color={theme.colors.primary} style={{ transform: [{ rotate: '90deg' }] }} />
                </Pressable>

                {/* → next month */}
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setCurrentMonth((m) => addMonths(m, 1))}
                  style={[styles.navBtn, { backgroundColor: theme.colors.surfaceElevated }]}
                >
                  <ChevronRight size={18} color={theme.colors.text} />
                </Pressable>
              </>
            ) : (
              /* Back button shown when inside the month/year picker */
              <>
                <Pressable
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => setView('calendar')}
                  style={[styles.navBtn, { backgroundColor: theme.colors.surfaceElevated }]}
                >
                  <ChevronLeft size={18} color={theme.colors.text} />
                </Pressable>
                <Text variant="h3" style={{ fontWeight: '800', fontSize: 15 }}>
                  Pick Month & Year
                </Text>
                {/* spacer to keep title centred */}
                <View style={{ width: 32 }} />
              </>
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════════
              MONTH + YEAR JUMP PICKER
          ══════════════════════════════════════════════════════════════════ */}
          {view === 'monthYear' && (
            <View style={[styles.pickerContainer, { borderColor: theme.colors.border }]}>
              {/* Left column: year list */}
              <ScrollView
                ref={yearScrollRef}
                style={[styles.yearList, { borderRightColor: theme.colors.border }]}
                showsVerticalScrollIndicator={false}
                nestedScrollEnabled
              >
                {YEARS.map((yr) => {
                  const isSelected = yr === pickerYear;
                  return (
                    <Pressable
                      key={yr}
                      onPress={() => setPickerYear(yr)}
                      style={[
                        styles.yearRow,
                        {
                          backgroundColor: isSelected
                            ? theme.isDark ? 'rgba(99,102,241,0.18)' : 'rgba(79,70,229,0.1)'
                            : 'transparent',
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 14,
                          fontWeight: isSelected ? '800' : '500',
                          color: isSelected ? theme.colors.primary : theme.colors.text,
                          textAlign: 'center',
                        }}
                      >
                        {yr}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>

              {/* Right column: 4×3 month grid */}
              <View style={styles.monthGrid}>
                {MONTH_NAMES.map((name, idx) => {
                  const isCurrentlyViewing =
                    getMonth(currentMonth) === idx && getYear(currentMonth) === pickerYear;
                  return (
                    <Pressable
                      key={name}
                      onPress={() => handleMonthYearSelect(idx, pickerYear)}
                      style={[
                        styles.monthCell,
                        {
                          backgroundColor: isCurrentlyViewing
                            ? theme.colors.primary
                            : theme.isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.04)',
                          borderColor: isCurrentlyViewing ? theme.colors.primary : theme.colors.border,
                        },
                      ]}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: isCurrentlyViewing ? '800' : '600',
                          color: isCurrentlyViewing ? '#FFFFFF' : theme.colors.text,
                        }}
                      >
                        {name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════════
              DAY GRID (only shown in calendar view)
          ══════════════════════════════════════════════════════════════════ */}
          {view === 'calendar' && (
            <>
              {/* Days of Week header */}
              <View style={styles.weekdaysRow}>
                {WEEKDAYS.map((wd) => (
                  <View key={wd} style={styles.weekdayCell}>
                    <Text variant="caption" muted style={{ fontWeight: '700', fontSize: 11 }}>
                      {wd}
                    </Text>
                  </View>
                ))}
              </View>

              {/* Days */}
              <View style={styles.daysGrid}>
                {daysInGrid.map((day, idx) => {
                  const isCurrentMonth = isSameMonth(day, currentMonth);
                  const isStart = isSelectedStart(day);
                  const isEnd   = isSelectedEnd(day);
                  const inRange = isInRange(day);
                  const today   = isToday(day);

                  let bgColor = 'transparent';
                  let textColor = isCurrentMonth ? theme.colors.text : theme.colors.textMuted;
                  let borderRadius = 18;

                  if (isStart || isEnd) {
                    bgColor = theme.colors.primary;
                    textColor = '#FFFFFF';
                  } else if (inRange) {
                    bgColor = theme.isDark ? 'rgba(45,212,191,0.2)' : 'rgba(15,159,142,0.15)';
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
                          borderWidth: today && !isStart && !isEnd ? 1.5 : 0,
                          borderColor: theme.colors.primary,
                        },
                      ]}
                    >
                      <Text style={{ color: textColor, fontWeight: isStart || isEnd || today ? '800' : '500', fontSize: 13 }}>
                        {format(day, 'd')}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </>
          )}

          {/* ── Footer Actions (range mode + calendar view only) ── */}
          {/* NOTE: rendered below ScrollView to never be cut off */}
        </ScrollView>

        {!isSingle && view === 'calendar' && (
          <View style={[styles.footerActions, { paddingTop: 8 }]}>
            <Button title="Reset"       variant="secondary" onPress={handleClear}  style={{ flex: 1 }} />
            <Button title="Apply Range"                     onPress={handleApply}  style={{ flex: 2 }} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  modalContainer: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 36,
    maxHeight: '88%',
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
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  rangeDivider: {
    width: 1,
    height: 24,
  },
  presetsContainer: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  presetChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 14,
    borderWidth: 1,
  },
  monthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  navBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthYearLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
  },
  // ── Month+Year picker ──────────────────────────────────────────────────────
  pickerContainer: {
    flexDirection: 'row',
    height: 220,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  yearList: {
    width: 76,
    borderRightWidth: 1,
  },
  yearRow: {
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  monthGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 6,
    gap: 6,
    alignContent: 'flex-start',
  },
  monthCell: {
    width: '30%',
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  // ── Day grid ──────────────────────────────────────────────────────────────
  weekdaysRow: {
    flexDirection: 'row',
    paddingVertical: 2,
  },
  weekdayCell: {
    flex: 1,
    alignItems: 'center',
  },
  daysGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  dayCell: {
    width: '14.2857%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    paddingBottom: 10,
  },
});
