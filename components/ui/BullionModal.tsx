import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
} from 'react-native';
import {
  Calculator,
  ChevronRight,
  Flame,
  RefreshCw,
  Scale,
  Sparkles,
  TrendingUp,
  X,
  Zap,
} from 'lucide-react-native';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Text } from '@/components/ui/Text';
import { useBullionRates } from '@/hooks/useBullionRates';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { formatMoney } from '@/utils/format';

interface BullionModalProps {
  visible: boolean;
  onClose: () => void;
}

type BullionUnit = '10g' | 'tola' | '1g' | '1kg';
type CalcMetal = '24k' | '22k' | 'silver';

export function BullionModal({ visible, onClose }: BullionModalProps) {
  const theme = useTheme();
  const { t } = useLanguage();
  const { prices, rawRates, loading, currency, refreshBullionRates } = useBullionRates();

  const [unit, setUnit] = useState<BullionUnit>('10g');
  const [calcMetal, setCalcMetal] = useState<CalcMetal>('24k');
  const [calcWeight, setCalcWeight] = useState('10');

  if (!visible) return null;

  // Compute custom valuation calculator
  const weightNum = parseFloat(calcWeight) || 0;
  let calculatedValue = 0;
  if (prices && weightNum > 0) {
    if (calcMetal === '24k') {
      calculatedValue = prices.gold24kPerGram * weightNum;
    } else if (calcMetal === '22k') {
      calculatedValue = prices.gold22kPerGram * weightNum;
    } else {
      calculatedValue = prices.silverPerGram * weightNum;
    }
  }

  // Display rates based on active unit
  const gold24kDisplay = prices
    ? unit === '10g'
      ? prices.gold24kPer10g
      : unit === 'tola'
      ? prices.gold24kPerTola
      : unit === '1g'
      ? prices.gold24kPerGram
      : prices.gold24kPer10g
    : 0;

  const gold22kDisplay = prices
    ? unit === '10g'
      ? prices.gold22kPer10g
      : unit === 'tola'
      ? prices.gold22kPerTola
      : unit === '1g'
      ? prices.gold22kPerGram
      : prices.gold22kPer10g
    : 0;

  const silverDisplay = prices
    ? unit === '10g'
      ? prices.silverPer10g
      : unit === 'tola'
      ? prices.silverPerTola
      : unit === '1g'
      ? prices.silverPerGram
      : prices.silverPer1kg
    : 0;

  const unitLabel =
    unit === '10g'
      ? 'per 10 Grams'
      : unit === 'tola'
      ? 'per 1 Tola (11.66g)'
      : unit === '1g'
      ? 'per 1 Gram'
      : 'per 1 Kilogram';

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          justifyContent: 'flex-end',
        }}
      >
        <View
          style={{
            maxHeight: '92%',
            backgroundColor: theme.colors.surface,
            borderTopLeftRadius: 28,
            borderTopRightRadius: 28,
            borderWidth: 1,
            borderColor: theme.colors.border,
            overflow: 'hidden',
          }}
        >
          {/* Top Grab Header */}
          <View
            style={{
              paddingHorizontal: theme.spacing.lg,
              paddingTop: theme.spacing.md,
              paddingBottom: theme.spacing.sm,
              borderBottomWidth: 1,
              borderBottomColor: theme.colors.border,
              backgroundColor: theme.colors.surfaceElevated,
            }}
          >
            {/* Grab Handle */}
            <View
              style={{
                width: 38,
                height: 4,
                borderRadius: 2,
                backgroundColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)',
                alignSelf: 'center',
                marginBottom: 10,
              }}
            />

            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View
                  style={{
                    width: 38,
                    height: 38,
                    borderRadius: 12,
                    backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 1,
                    borderColor: theme.isDark ? 'rgba(245, 158, 11, 0.35)' : '#FDE68A',
                  }}
                >
                  <Text style={{ fontSize: 20 }}>🪙</Text>
                </View>
                <View>
                  <Text variant="h3" style={{ fontWeight: '800', fontSize: 17 }}>
                    Gold & Silver Rates
                  </Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#10B981' }} />
                    <Text variant="caption" muted style={{ fontSize: 11 }}>
                      Live Global Spot Benchmark · {currency}
                    </Text>
                  </View>
                </View>
              </View>

              <Pressable
                onPress={onClose}
                hitSlop={8}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: theme.colors.surface,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                }}
              >
                <X size={16} color={theme.colors.text} />
              </Pressable>
            </View>
          </View>

          {/* Scrollable Body */}
          <ScrollView
            contentContainerStyle={{
              padding: theme.spacing.lg,
              gap: theme.spacing.md,
              paddingBottom: theme.spacing.xl + 20,
            }}
            showsVerticalScrollIndicator
          >
            {/* ── 1. REFRESH STATUS & UNIT SWITCHER ── */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: theme.colors.surfaceElevated,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: theme.radius.md,
                borderWidth: 1,
                borderColor: theme.colors.border,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <TrendingUp size={14} color={theme.colors.primary} />
                <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                  Spot: Gold ${Math.round(rawRates?.goldUsdPerOz || 0)}/oz · Silver ${Math.round(rawRates?.silverUsdPerOz || 0)}/oz
                </Text>
              </View>

              <Pressable
                onPress={refreshBullionRates}
                disabled={loading}
                hitSlop={8}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: theme.radius.full,
                  backgroundColor: theme.isDark ? 'rgba(99, 102, 241, 0.2)' : 'rgba(79, 70, 229, 0.1)',
                }}
              >
                {loading ? (
                  <ActivityIndicator size="small" color={theme.colors.primary} />
                ) : (
                  <RefreshCw size={12} color={theme.colors.primary} />
                )}
                <Text style={{ fontSize: 11, fontWeight: '700', color: theme.colors.primary }}>
                  {loading ? 'Refreshing...' : 'Refresh'}
                </Text>
              </Pressable>
            </View>

            {/* ── UNIT SWITCHER PILLS ── */}
            <View style={{ gap: 6 }}>
              <Text variant="caption" muted style={{ fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8, fontSize: 10 }}>
                Select Measurement Unit
              </Text>
              <View style={{ flexDirection: 'row', gap: 6, flexWrap: 'wrap' }}>
                {(
                  [
                    { key: '10g', label: '10 Grams' },
                    { key: 'tola', label: '1 Tola (11.66g)' },
                    { key: '1g', label: '1 Gram' },
                    { key: '1kg', label: '1 Kilogram' },
                  ] as { key: BullionUnit; label: string }[]
                ).map((u) => {
                  const isActive = unit === u.key;
                  return (
                    <Pressable
                      key={u.key}
                      onPress={() => setUnit(u.key)}
                      style={{
                        paddingHorizontal: 12,
                        paddingVertical: 6,
                        borderRadius: theme.radius.full,
                        backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: isActive ? theme.colors.primary : theme.colors.border,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? '800' : '600',
                          color: isActive ? '#FFFFFF' : theme.colors.text,
                        }}
                      >
                        {u.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            </View>

            {/* ── 2. PRICE CARDS ── */}
            <View style={{ gap: 10 }}>
              {/* Gold 24K Card */}
              <View
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: theme.isDark ? '#1C1917' : '#FFFDF5',
                  borderWidth: 1.5,
                  borderColor: theme.isDark ? '#D97706' : '#F59E0B',
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: '#F59E0B',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🥇</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>
                        Gold 24K (99.9% Pure)
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11 }}>
                        Fine Bullion Benchmark · {unitLabel}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.isDark ? 'rgba(245, 158, 11, 0.2)' : '#FEF3C7',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#D97706' }}>
                      24 KARAT
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: theme.isDark ? '#FCD34D' : '#B45309' }}>
                    {formatMoney(gold24kDisplay, currency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    {formatMoney(prices?.gold24kPerGram || 0, currency)}/g
                  </Text>
                </View>
              </View>

              {/* Gold 22K Card */}
              <View
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: theme.isDark ? '#1C1917' : '#FFFDF5',
                  borderWidth: 1.5,
                  borderColor: theme.isDark ? 'rgba(217, 119, 6, 0.4)' : '#FDE68A',
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: '#EA580C',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>👑</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>
                        Gold 22K (Jewelry Standard)
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11 }}>
                        Hallmark 916 Standard · {unitLabel}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.isDark ? 'rgba(234, 88, 12, 0.2)' : '#FFEDD5',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: '#EA580C' }}>
                      916 HALLMARK
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: theme.isDark ? '#FB923C' : '#C2410C' }}>
                    {formatMoney(gold22kDisplay, currency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    {formatMoney(prices?.gold22kPerGram || 0, currency)}/g
                  </Text>
                </View>
              </View>

              {/* Silver 999 Card */}
              <View
                style={{
                  padding: 16,
                  borderRadius: 18,
                  backgroundColor: theme.isDark ? '#0F172A' : '#F8FAFC',
                  borderWidth: 1.5,
                  borderColor: theme.isDark ? '#64748B' : '#CBD5E1',
                  gap: 8,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <View
                      style={{
                        width: 32,
                        height: 32,
                        borderRadius: 8,
                        backgroundColor: '#64748B',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Text style={{ fontSize: 16 }}>🥈</Text>
                    </View>
                    <View>
                      <Text style={{ fontSize: 15, fontWeight: '800', color: theme.colors.text }}>
                        Silver 999 (Fine Pure)
                      </Text>
                      <Text variant="caption" muted style={{ fontSize: 11 }}>
                        Spot Benchmark · {unitLabel}
                      </Text>
                    </View>
                  </View>

                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 6,
                      backgroundColor: theme.isDark ? 'rgba(148, 163, 184, 0.2)' : '#E2E8F0',
                    }}
                  >
                    <Text style={{ fontSize: 10, fontWeight: '800', color: theme.isDark ? '#CBD5E1' : '#475569' }}>
                      999 PURE
                    </Text>
                  </View>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginTop: 4 }}>
                  <Text style={{ fontSize: 26, fontWeight: '900', color: theme.isDark ? '#E2E8F0' : '#334155' }}>
                    {formatMoney(silverDisplay, currency)}
                  </Text>
                  <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                    {formatMoney(prices?.silverPer1kg || 0, currency)}/kg
                  </Text>
                </View>
              </View>
            </View>

            {/* ── 3. INTERACTIVE BULLION VALUATION CALCULATOR ── */}
            <Card style={{ gap: 12, padding: 16 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Calculator size={16} color={theme.colors.primary} />
                <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
                  Instant Metal Value Calculator
                </Text>
              </View>

              {/* Select Metal */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {(
                  [
                    { key: '24k', label: 'Gold 24K' },
                    { key: '22k', label: 'Gold 22K' },
                    { key: 'silver', label: 'Silver 999' },
                  ] as { key: CalcMetal; label: string }[]
                ).map((m) => {
                  const isActive = calcMetal === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => setCalcMetal(m.key)}
                      style={{
                        flex: 1,
                        paddingVertical: 7,
                        borderRadius: theme.radius.md,
                        backgroundColor: isActive ? theme.colors.primary : theme.colors.surfaceElevated,
                        borderWidth: 1,
                        borderColor: isActive ? theme.colors.primary : theme.colors.border,
                        alignItems: 'center',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: isActive ? '800' : '600',
                          color: isActive ? '#FFFFFF' : theme.colors.text,
                        }}
                      >
                        {m.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>

              {/* Weight Input Box */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: theme.colors.background,
                  borderRadius: theme.radius.md,
                  borderWidth: 1,
                  borderColor: theme.colors.border,
                  paddingHorizontal: 12,
                  height: 48,
                }}
              >
                <Scale size={16} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Enter weight in grams"
                  placeholderTextColor={theme.colors.textMuted}
                  keyboardType="numeric"
                  value={calcWeight}
                  onChangeText={(text) => setCalcWeight(text.replace(/[^0-9.]/g, ''))}
                  style={{
                    flex: 1,
                    fontSize: 16,
                    fontWeight: '700',
                    color: theme.colors.text,
                    paddingVertical: 0,
                  }}
                />
                <Text style={{ fontWeight: '800', color: theme.colors.textMuted, fontSize: 13 }}>
                  Grams
                </Text>
              </View>

              {/* Calculated Value Result */}
              <View
                style={{
                  padding: 12,
                  borderRadius: theme.radius.md,
                  backgroundColor: theme.isDark ? '#141E33' : theme.colors.cardHighlight,
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.3)' : theme.colors.border,
                  alignItems: 'center',
                  gap: 2,
                }}
              >
                <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
                  Estimated Total Cash Value ({weightNum}g)
                </Text>
                <Text variant="h2" style={{ fontSize: 24, fontWeight: '900', color: theme.colors.primary }}>
                  {formatMoney(calculatedValue, currency)}
                </Text>
              </View>
            </Card>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}
