import React, { useState, useEffect } from 'react';
import {
  KeyboardTypeOptions,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';
import { Clock } from 'lucide-react-native';
import { Text } from '@/components/ui/Text';
import { useTheme } from '@/hooks/useTheme';

interface TimeInputProps {
  label?: string;
  value?: string | null; // e.g. "11:30 AM" or "9:00 PM"
  onChangeTime: (formatted: string) => void;
  onOpenModal?: () => void;
  error?: string;
}

function autoFormatTimeDigits(rawText: string, prevText = ''): string {
  const isDeleting = rawText.length < prevText.length;

  if (isDeleting) {
    // If deleting the colon directly (e.g. from "01:" to "01" or "9:" to "9")
    if (prevText.endsWith(':') && !rawText.includes(':')) {
      const d = rawText.replace(/\D/g, '');
      return d.length > 1 ? d.slice(0, 1) : '';
    }

    const clean = rawText.replace(/\D/g, '').slice(0, 4);
    if (clean.length <= 2) {
      return clean;
    }
    return `${clean.slice(0, 2)}:${clean.slice(2)}`;
  }

  // Typing forward: strip non-digits and cap at 4 digits
  const digits = rawText.replace(/\D/g, '').slice(0, 4);
  if (!digits) return '';

  if (digits.length === 1) {
    return digits;
  }

  // If first digit is 2-9 (e.g. 9 for 9:00, 8 for 8:30)
  const firstDigit = Number(digits[0]);
  if (firstDigit > 1) {
    const hour = digits[0];
    const minute = digits.slice(1);
    if (minute.length > 0) {
      if (minute.length === 2 && Number(minute) > 59) {
        return `${hour}:59`;
      }
      return `${hour}:${minute}`;
    }
    return `${hour}:`;
  }

  // If first digit is 0 or 1 (e.g. 01, 09, 11, 12)
  if (digits.length === 2) {
    const hourNum = Number(digits);
    if (hourNum > 12) {
      return `1:${digits[1]}`;
    }
    return `${digits}:`;
  }

  if (digits.length > 2) {
    let hourPart = digits.slice(0, 2);
    let minPart = digits.slice(2);
    const hourNum = Number(hourPart);
    if (hourNum > 12) {
      hourPart = digits[0];
      minPart = digits.slice(1);
    }
    if (minPart.length === 2 && Number(minPart) > 59) {
      minPart = '59';
    }
    return `${hourPart}:${minPart}`;
  }

  return digits;
}

export function TimeInput({
  label = 'Time',
  value,
  onChangeTime,
  onOpenModal,
  error,
}: TimeInputProps) {
  const theme = useTheme();

  const [digitsOnly, setDigitsOnly] = useState<string>(() => {
    if (!value) return '';
    const match = value.match(/^(\d{1,2}:\d{2})/);
    return match ? match[1] : '';
  });

  const [period, setPeriod] = useState<'AM' | 'PM'>(() => {
    if (!value) return 'PM';
    return value.toUpperCase().includes('AM') ? 'AM' : 'PM';
  });

  // Keep in sync when parent value changes externally
  useEffect(() => {
    if (value) {
      const match = value.match(/^(\d{1,2}:\d{2})/);
      if (match && match[1] !== digitsOnly) {
        setDigitsOnly(match[1]);
      }
      const newPeriod = value.toUpperCase().includes('AM') ? 'AM' : 'PM';
      if (newPeriod !== period) {
        setPeriod(newPeriod);
      }
    }
  }, [value]);

  const handleTextChange = (text: string) => {
    const formatted = autoFormatTimeDigits(text, digitsOnly);
    setDigitsOnly(formatted);

    // Only emit complete time with minutes to parent if user has entered minutes
    if (formatted.includes(':')) {
      const parts = formatted.split(':');
      if (parts[1] && parts[1].length === 2) {
        onChangeTime(`${parts[0]}:${parts[1]} ${period}`);
        return;
      }
    }

    if (!formatted) {
      onChangeTime('');
    }
  };

  const handlePeriodChange = (nextPeriod: 'AM' | 'PM') => {
    setPeriod(nextPeriod);
    if (digitsOnly && digitsOnly.includes(':')) {
      const parts = digitsOnly.split(':');
      const h = parts[0] || '12';
      const m = parts[1] ? parts[1].padEnd(2, '0') : '00';
      onChangeTime(`${h}:${m} ${nextPeriod}`);
    } else {
      onChangeTime(digitsOnly ? `${digitsOnly} ${nextPeriod}` : `12:00 ${nextPeriod}`);
    }
  };


  return (
    <View style={styles.container}>
      {label ? <Text variant="label">{label}</Text> : null}
      <View
        style={[
          styles.inputRow,
          {
            backgroundColor: theme.colors.input,
            borderColor: error ? theme.colors.danger : theme.colors.border,
          },
        ]}
      >
        {/* Digits Input */}
        <TextInput
          value={digitsOnly}
          onChangeText={handleTextChange}
          placeholder="11:30"
          placeholderTextColor={theme.colors.textMuted}
          keyboardType="number-pad"
          maxLength={5} // e.g. "12:59"
          style={[
            styles.textInput,
            {
              color: theme.colors.text,
            },
          ]}
        />

        {/* AM / PM Segmented Toggle Buttons */}
        <View style={[styles.amPmPill, { backgroundColor: theme.colors.surfaceElevated, borderColor: theme.colors.border }]}>
          <Pressable
            onPress={() => handlePeriodChange('AM')}
            style={[
              styles.amPmSegment,
              period === 'AM' && { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text
              style={[
                styles.amPmText,
                { color: period === 'AM' ? (theme.isDark ? '#06201D' : '#FFFFFF') : theme.colors.textMuted },
              ]}
            >
              AM
            </Text>
          </Pressable>
          <Pressable
            onPress={() => handlePeriodChange('PM')}
            style={[
              styles.amPmSegment,
              period === 'PM' && { backgroundColor: theme.colors.primary },
            ]}
          >
            <Text
              style={[
                styles.amPmText,
                { color: period === 'PM' ? (theme.isDark ? '#06201D' : '#FFFFFF') : theme.colors.textMuted },
              ]}
            >
              PM
            </Text>
          </Pressable>
        </View>

        {/* Optional Clock Icon to open Modal */}
        {onOpenModal ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Open clock"
            onPress={onOpenModal}
            hitSlop={8}
            style={styles.clockIconBtn}
          >
            <Clock size={18} color={theme.colors.primary} />
          </Pressable>
        ) : null}
      </View>
      {error ? (
        <Text variant="caption" style={{ color: theme.colors.danger }}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: 6,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    minHeight: 52,
    gap: 8,
  },
  textInput: {
    flex: 1,
    fontSize: 16,
    fontWeight: '600',
    paddingVertical: 10,
  },
  amPmPill: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    overflow: 'hidden',
    height: 34,
  },
  amPmSegment: {
    paddingHorizontal: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  amPmText: {
    fontSize: 12,
    fontWeight: '700',
  },
  clockIconBtn: {
    padding: 4,
  },
});
