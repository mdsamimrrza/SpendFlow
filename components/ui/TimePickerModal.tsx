import React, { useState, useEffect } from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Clock, X } from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';
import { formatTimeForInput } from '@/utils/format';

interface TimePickerModalProps {
  visible: boolean;
  onClose: () => void;
  onSelect: (formattedTime: string) => void;
  initialTime?: string | null;
}

const HOURS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const MINUTES = ['00', '05', '10', '15', '20', '25', '30', '35', '40', '45', '50', '55'];

export function TimePickerModal({
  visible,
  onClose,
  onSelect,
  initialTime,
}: TimePickerModalProps) {
  const theme = useTheme();

  const [hour, setHour] = useState<number>(12);
  const [minute, setMinute] = useState<string>('00');
  const [period, setPeriod] = useState<'AM' | 'PM'>('PM');

  // Initialize or parse initial time when modal opens
  useEffect(() => {
    if (visible) {
      if (initialTime?.trim()) {
        const match = initialTime.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
        if (match) {
          setHour(Number(match[1]));
          setMinute(match[2].padStart(2, '0'));
          setPeriod(match[3].toUpperCase() as 'AM' | 'PM');
          return;
        }
      }
      // Default to current time
      const now = new Date();
      const h24 = now.getHours();
      const m = now.getMinutes();
      setHour(h24 % 12 || 12);
      setMinute(String(Math.round(m / 5) * 5 % 60).padStart(2, '0'));
      setPeriod(h24 >= 12 ? 'PM' : 'AM');
    }
  }, [visible, initialTime]);

  const handleSetNow = () => {
    const now = new Date();
    const h24 = now.getHours();
    const m = now.getMinutes();
    setHour(h24 % 12 || 12);
    setMinute(String(m).padStart(2, '0'));
    setPeriod(h24 >= 12 ? 'PM' : 'AM');
  };

  const handleApply = () => {
    const formatted = `${hour}:${minute} ${period}`;
    onSelect(formatted);
    onClose();
  };

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
            <Clock size={20} color={theme.colors.primary} />
            <Text variant="h2">Select Time</Text>
          </View>
          <Pressable
            accessibilityRole="button"
            onPress={onClose}
            style={[styles.closeBtn, { backgroundColor: theme.colors.surfaceElevated }]}
          >
            <X size={18} color={theme.colors.text} />
          </Pressable>
        </View>

        {/* Selected Time Display Banner & AM/PM Toggle */}
        <View
          style={[
            styles.timeBanner,
            {
              backgroundColor: theme.colors.surfaceElevated,
              borderColor: theme.colors.border,
            },
          ]}
        >
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4 }}>
            <Text style={{ fontSize: 36, fontWeight: '800', color: theme.colors.primary }}>
              {hour}
            </Text>
            <Text style={{ fontSize: 32, fontWeight: '700', color: theme.colors.textMuted }}>
              :
            </Text>
            <Text style={{ fontSize: 36, fontWeight: '800', color: theme.colors.primary }}>
              {minute}
            </Text>
          </View>

          {/* AM / PM Segmented Control */}
          <View style={[styles.amPmContainer, { borderColor: theme.colors.border }]}>
            <Pressable
              onPress={() => setPeriod('AM')}
              style={[
                styles.amPmBtn,
                period === 'AM' && { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                variant="label"
                style={{
                  color: period === 'AM' ? '#FFFFFF' : theme.colors.textMuted,
                  fontWeight: '700',
                }}
              >
                AM
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setPeriod('PM')}
              style={[
                styles.amPmBtn,
                period === 'PM' && { backgroundColor: theme.colors.primary },
              ]}
            >
              <Text
                variant="label"
                style={{
                  color: period === 'PM' ? '#FFFFFF' : theme.colors.textMuted,
                  fontWeight: '700',
                }}
              >
                PM
              </Text>
            </Pressable>
          </View>
        </View>

        {/* Quick Now Action */}
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Pressable onPress={handleSetNow} hitSlop={8}>
            <Text variant="caption" style={{ color: theme.colors.primary, fontWeight: '700' }}>
              ⚡ Set to Current Time (Now)
            </Text>
          </Pressable>
        </View>

        {/* Hours Selector */}
        <View style={{ gap: 8 }}>
          <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase' }}>
            Hour
          </Text>
          <View style={styles.grid}>
            {HOURS.map((h) => {
              const isSelected = hour === h;
              return (
                <Pressable
                  key={h}
                  onPress={() => setHour(h)}
                  style={[
                    styles.gridItem,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceElevated,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    variant="label"
                    style={{
                      color: isSelected ? '#FFFFFF' : theme.colors.text,
                      fontWeight: isSelected ? '800' : '600',
                    }}
                  >
                    {h}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Minutes Selector */}
        <View style={{ gap: 8 }}>
          <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase' }}>
            Minute
          </Text>
          <View style={styles.grid}>
            {MINUTES.map((m) => {
              const isSelected = minute === m;
              return (
                <Pressable
                  key={m}
                  onPress={() => setMinute(m)}
                  style={[
                    styles.gridItem,
                    {
                      backgroundColor: isSelected ? theme.colors.primary : theme.colors.surfaceElevated,
                      borderColor: isSelected ? theme.colors.primary : theme.colors.border,
                    },
                  ]}
                >
                  <Text
                    variant="label"
                    style={{
                      color: isSelected ? '#FFFFFF' : theme.colors.text,
                      fontWeight: isSelected ? '800' : '600',
                    }}
                  >
                    {m}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </View>

        {/* Footer Actions */}
        <View style={styles.footerActions}>
          <Button
            title="Cancel"
            variant="secondary"
            onPress={onClose}
            style={{ flex: 1 }}
          />
          <Button
            title="Set Time"
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
    gap: 16,
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
  timeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderRadius: 16,
    borderWidth: 1,
  },
  amPmContainer: {
    flexDirection: 'row',
    borderRadius: 12,
    borderWidth: 1,
    overflow: 'hidden',
  },
  amPmBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  gridItem: {
    width: '14.5%',
    minWidth: 44,
    height: 40,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerActions: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 8,
  },
});
