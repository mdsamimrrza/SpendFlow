import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Rect, Stop, Text as SvgText } from 'react-native-svg';
import {
  Calculator,
  ChevronLeft,
  Clock,
  Globe,
  Info,
  RefreshCw,
  Scale,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react-native';
import { Card } from '@/components/ui/Card';
import { PrivacyEyeButton } from '@/components/ui/PrivacyEyeButton';
import { Text } from '@/components/ui/Text';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useBullionRates } from '@/hooks/useBullionRates';
import { useLanguage } from '@/hooks/useLanguage';
import { usePrivacy } from '@/hooks/usePrivacy';
import { useTheme } from '@/hooks/useTheme';
import { generateBullionHistoricalTrend } from '@/services/bullion';
import { formatMoney } from '@/utils/format';

type ActiveBenchmarkKey = 'gold_tola' | 'silver_tola' | 'gold_10g' | 'silver_10g';
type TrendPeriod = 1 | 3 | 6 | 12;
type TargetCountryMarket = 'NEPAL' | 'INDIA';

export default function BullionScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { language, t } = useLanguage();
  usePrivacy();
  const { width } = useWindowDimensions();

  // Determine initial country based on language or profile default
  const defaultCountry: TargetCountryMarket = language === 'ne' ? 'NEPAL' : 'INDIA';
  const [activeMarket, setActiveMarket] = useState<TargetCountryMarket>(defaultCountry);

  const activeCurrency = activeMarket === 'NEPAL' ? 'NPR' : 'INR';
  const { prices, rawRates, loading, refreshBullionRates } = useBullionRates(activeCurrency);

  // Active selected benchmark card for chart synchronisation
  const [selectedKey, setSelectedKey] = useState<ActiveBenchmarkKey>('gold_tola');
  const [trendMonths, setTrendMonths] = useState<TrendPeriod>(6);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);

  // Calculator State
  const [calcMetal, setCalcMetal] = useState<'24k' | '22k' | 'silver'>('24k');
  const [calcWeight, setCalcWeight] = useState('10');

  // Benchmark Calculations for active market (Nepal vs India)
  const benchmarks = useMemo(() => {
    const isNepal = activeMarket === 'NEPAL';
    const goldLabel = t('bullion_hallmark_gold') || 'HALLMARK GOLD';
    const silverLabel = t('bullion_silver') || 'SILVER';
    const tolaLabel = t('bullion_per_tola') || '1 TOLA';
    const gram10Label = t('bullion_per_10g') || '10 GRAM';

    if (!prices) {
      return {
        gold_tola: { label: goldLabel, unit: tolaLabel, price: 0, change: -100, pct: -0.03, metal: 'gold' as const },
        silver_tola: { label: silverLabel, unit: tolaLabel, price: 0, change: 75, pct: 1.53, metal: 'silver' as const },
        gold_10g: { label: goldLabel, unit: gram10Label, price: 0, change: -85, pct: -0.03, metal: 'gold' as const },
        silver_10g: { label: silverLabel, unit: gram10Label, price: 0, change: 64.5, pct: 1.54, metal: 'silver' as const },
      };
    }

    return {
      gold_tola: {
        label: goldLabel,
        unit: tolaLabel,
        price: prices.gold24kPerTola,
        change: isNepal ? -100 : -78,
        pct: -0.03,
        metal: 'gold' as const,
      },
      silver_tola: {
        label: silverLabel,
        unit: tolaLabel,
        price: prices.silverPerTola,
        change: isNepal ? 75 : 55,
        pct: 1.53,
        metal: 'silver' as const,
      },
      gold_10g: {
        label: goldLabel,
        unit: gram10Label,
        price: prices.gold24kPer10g,
        change: isNepal ? -85 : -65,
        pct: -0.03,
        metal: 'gold' as const,
      },
      silver_10g: {
        label: silverLabel,
        unit: gram10Label,
        price: prices.silverPer10g,
        change: isNepal ? 64.5 : 47,
        pct: 1.54,
        metal: 'silver' as const,
      },
    };
  }, [prices, activeMarket, t]);

  const activeBenchmark = benchmarks[selectedKey];
  const isGold = activeBenchmark.metal === 'gold';
  const chartAccentColor = isGold ? '#D97706' : '#475569';
  const chartGradColor = isGold ? '#F59E0B' : '#64748B';

  // ── HISTORICAL TREND DATA FOR SELECTED BENCHMARK ──
  const historyPoints = useMemo(() => {
    if (!activeBenchmark.price) return [];
    return generateBullionHistoricalTrend(activeBenchmark.price, trendMonths, activeBenchmark.metal);
  }, [activeBenchmark.price, trendMonths, activeBenchmark.metal]);

  const { minPrice, maxPrice } = useMemo(() => {
    if (historyPoints.length === 0) {
      return { minPrice: 0, maxPrice: 0 };
    }
    const pricesList = historyPoints.map((p) => p.price);
    const min = Math.min(...pricesList);
    const max = Math.max(...pricesList);
    return {
      minPrice: min,
      maxPrice: max,
    };
  }, [historyPoints]);

  // Chart Geometry
  const chartWidth = Math.max(Math.min(width - 64, 720), 280);
  const chartHeight = 190;
  const padLeft = 46;
  const padRight = 10;
  const padTop = 20;
  const padBottom = 26;
  const drawW = chartWidth - padLeft - padRight;
  const drawH = chartHeight - padTop - padBottom;

  // Grid steps (5 horizontal dashed lines)
  const yAxisTicks = useMemo(() => {
    if (minPrice === 0 && maxPrice === 0) return [];
    const ticks: { price: number; y: number }[] = [];
    const steps = 4;
    const range = Math.max(maxPrice - minPrice, 1);
    for (let i = 0; i <= steps; i++) {
      const p = minPrice + (range * i) / steps;
      const y = chartHeight - padBottom - (i / steps) * drawH;
      ticks.push({ price: Math.round(p), y });
    }
    return ticks;
  }, [minPrice, maxPrice, drawH, chartHeight, padBottom]);

  const chartCoords = useMemo(() => {
    if (historyPoints.length === 0) return [];
    const stepX = drawW / Math.max(historyPoints.length - 1, 1);
    const range = Math.max(maxPrice - minPrice, 1);
    return historyPoints.map((p, i) => {
      const normalizedY = (p.price - minPrice) / range;
      const x = padLeft + i * stepX;
      const y = chartHeight - padBottom - normalizedY * drawH;
      return { x, y, point: p, index: i };
    });
  }, [historyPoints, drawW, drawH, minPrice, maxPrice, chartHeight, padLeft, padBottom]);

  const { linePath, areaPath } = useMemo(() => {
    if (chartCoords.length === 0) return { linePath: '', areaPath: '' };
    let d = `M ${chartCoords[0].x},${chartCoords[0].y}`;
    for (let i = 0; i < chartCoords.length - 1; i++) {
      const p0 = chartCoords[i === 0 ? 0 : i - 1];
      const p1 = chartCoords[i];
      const p2 = chartCoords[i + 1];
      const p3 = chartCoords[i + 2] || p2;
      const tension = 4.5;
      const cp1x = p1.x + (p2.x - p0.x) / tension;
      const cp1y = p1.y + (p2.y - p0.y) / tension;
      const cp2x = p2.x - (p3.x - p1.x) / tension;
      const cp2y = p2.y - (p3.y - p1.y) / tension;
      d += ` C ${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    const area = `${d} L ${chartCoords[chartCoords.length - 1].x},${chartHeight - padBottom} L ${chartCoords[0].x},${chartHeight - padBottom} Z`;
    return { linePath: d, areaPath: area };
  }, [chartCoords, chartHeight, padBottom]);

  const selectedPoint = selectedIndex !== null ? chartCoords[selectedIndex] : null;

  // Custom Calculator Computation
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

  // Format updated market session label
  const updatedReadable = useMemo(() => {
    if (prices?.fixingLabel) {
      const closedSuffix = prices.isMarketClosed ? ' · Closed Today' : '';
      return `${prices.fixingLabel}${closedSuffix}`;
    }
    if (!rawRates?.updatedAt) return 'Official Market Benchmark';
    try {
      const d = new Date(rawRates.updatedAt);
      return `Market Rate · ${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}`;
    } catch {
      return 'Official Market Benchmark';
    }
  }, [prices?.fixingLabel, prices?.isMarketClosed, rawRates?.updatedAt]);

  const handleBack = () => {
    if (router.canGoBack()) {
      router.back();
    } else {
      router.replace('/(tabs)/settings' as any);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: theme.colors.background }}>
      <ScrollView
        contentContainerStyle={{
          padding: theme.spacing.lg,
          gap: theme.spacing.md,
          paddingBottom: 130,
        }}
        showsVerticalScrollIndicator
      >
        {/* ── 1. TOP APP BAR ── */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable
              onPress={handleBack}
              hitSlop={8}
              style={{
                width: 38,
                height: 38,
                borderRadius: 19,
                backgroundColor: theme.colors.surface,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <ChevronLeft size={20} color={theme.colors.text} />
            </Pressable>

            <View style={{ gap: 2 }}>
              <Text variant="h1" style={{ fontWeight: '800', fontSize: 22, color: theme.colors.text, letterSpacing: -0.5 }}>
                {t('bullion_title') || 'Gold/Silver Price'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <PrivacyEyeButton />
            <ThemeToggle />
          </View>
        </View>

        {/* ── 2. COUNTRY MARKET SWITCHER (NEPAL VS INDIA) ── */}
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: theme.colors.surface,
            borderRadius: theme.radius.md,
            padding: 4,
            borderWidth: 1,
            borderColor: theme.colors.border,
            gap: 6,
          }}
        >
          <Pressable
            onPress={() => { setActiveMarket('NEPAL'); setSelectedIndex(null); }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: activeMarket === 'NEPAL' ? theme.colors.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '800', color: activeMarket === 'NEPAL' ? '#FFFFFF' : theme.colors.textMuted }}>
              🇳🇵 {t('bullion_market_nepal') || 'Nepal (NPR)'}
            </Text>
          </Pressable>

          <Pressable
            onPress={() => { setActiveMarket('INDIA'); setSelectedIndex(null); }}
            style={{
              flex: 1,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6,
              paddingVertical: 8,
              borderRadius: theme.radius.sm,
              backgroundColor: activeMarket === 'INDIA' ? theme.colors.primary : 'transparent',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '800', color: activeMarket === 'INDIA' ? '#FFFFFF' : theme.colors.textMuted }}>
              🇮🇳 {t('bullion_market_india') || 'India (INR)'}
            </Text>
          </Pressable>
        </View>

        {/* ── 3. LAST UPDATED PILL WITH REFRESH TRIGGER ── */}
        <Pressable
          onPress={refreshBullionRates}
          disabled={loading}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            paddingVertical: 7,
            paddingHorizontal: 14,
            borderRadius: theme.radius.full,
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.05)',
            borderWidth: 1,
            borderColor: theme.colors.border,
            alignSelf: 'center',
          }}
        >
          {loading ? (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          ) : (
            <Clock size={13} color={theme.colors.textMuted} />
          )}
          <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
            {loading ? 'Refreshing prices...' : updatedReadable}
          </Text>
          {!loading && <RefreshCw size={11} color={theme.colors.textMuted} style={{ marginLeft: 2 }} />}
        </Pressable>

        {/* ── 4. 2x2 BENCHMARK MARKET CARDS GRID ── */}
        <View style={{ gap: 10 }}>
          {/* Row 1: Gold / 1 Tola & Silver / 1 Tola */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Card 1: Gold 1 Tola */}
            <Pressable
              onPress={() => { setSelectedKey('gold_tola'); setSelectedIndex(null); }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 16,
                backgroundColor: selectedKey === 'gold_tola'
                  ? (theme.isDark ? 'rgba(217, 119, 6, 0.16)' : '#FFFDF5')
                  : theme.colors.surface,
                borderWidth: 2,
                borderColor: selectedKey === 'gold_tola'
                  ? (theme.isDark ? '#F59E0B' : '#D97706')
                  : theme.colors.border,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>🪙</Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '800',
                    color: selectedKey === 'gold_tola' ? (theme.isDark ? '#FCD34D' : '#B45309') : theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {benchmarks.gold_tola.label}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text }}>
                  {formatMoney(benchmarks.gold_tola.price, activeCurrency)}{' '}
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }}>/ {benchmarks.gold_tola.unit}</Text>
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: benchmarks.gold_tola.change >= 0 ? '#10B981' : '#EF4444',
                    marginTop: 2,
                  }}
                >
                  {benchmarks.gold_tola.change >= 0 ? `+${benchmarks.gold_tola.change}` : benchmarks.gold_tola.change} ({benchmarks.gold_tola.pct}%)
                </Text>
              </View>
            </Pressable>

            {/* Card 2: Silver 1 Tola */}
            <Pressable
              onPress={() => { setSelectedKey('silver_tola'); setSelectedIndex(null); }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 16,
                backgroundColor: selectedKey === 'silver_tola'
                  ? (theme.isDark ? 'rgba(100, 116, 139, 0.2)' : '#F8FAFC')
                  : theme.colors.surface,
                borderWidth: 2,
                borderColor: selectedKey === 'silver_tola'
                  ? (theme.isDark ? '#94A3B8' : '#475569')
                  : theme.colors.border,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>🥈</Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '800',
                    color: selectedKey === 'silver_tola' ? theme.colors.primary : theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {benchmarks.silver_tola.label}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text }}>
                  {formatMoney(benchmarks.silver_tola.price, activeCurrency)}{' '}
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }}>/ {benchmarks.silver_tola.unit}</Text>
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: benchmarks.silver_tola.change >= 0 ? '#10B981' : '#EF4444',
                    marginTop: 2,
                  }}
                >
                  {benchmarks.silver_tola.change >= 0 ? `+${benchmarks.silver_tola.change}` : benchmarks.silver_tola.change} (+{benchmarks.silver_tola.pct}%)
                </Text>
              </View>
            </Pressable>
          </View>

          {/* Row 2: Gold / 10 Gram & Silver / 10 Gram */}
          <View style={{ flexDirection: 'row', gap: 10 }}>
            {/* Card 3: Gold 10 Gram */}
            <Pressable
              onPress={() => { setSelectedKey('gold_10g'); setSelectedIndex(null); }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 16,
                backgroundColor: selectedKey === 'gold_10g'
                  ? (theme.isDark ? 'rgba(217, 119, 6, 0.16)' : '#FFFDF5')
                  : theme.colors.surface,
                borderWidth: 2,
                borderColor: selectedKey === 'gold_10g'
                  ? (theme.isDark ? '#F59E0B' : '#D97706')
                  : theme.colors.border,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>🪙</Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '800',
                    color: selectedKey === 'gold_10g' ? (theme.isDark ? '#FCD34D' : '#B45309') : theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {benchmarks.gold_10g.label}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text }}>
                  {formatMoney(benchmarks.gold_10g.price, activeCurrency)}{' '}
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }}>/ {benchmarks.gold_10g.unit}</Text>
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: benchmarks.gold_10g.change >= 0 ? '#10B981' : '#EF4444',
                    marginTop: 2,
                  }}
                >
                  {benchmarks.gold_10g.change >= 0 ? `+${benchmarks.gold_10g.change}` : benchmarks.gold_10g.change} ({benchmarks.gold_10g.pct}%)
                </Text>
              </View>
            </Pressable>

            {/* Card 4: Silver 10 Gram */}
            <Pressable
              onPress={() => { setSelectedKey('silver_10g'); setSelectedIndex(null); }}
              style={{
                flex: 1,
                padding: 12,
                borderRadius: 16,
                backgroundColor: selectedKey === 'silver_10g'
                  ? (theme.isDark ? 'rgba(100, 116, 139, 0.2)' : '#F8FAFC')
                  : theme.colors.surface,
                borderWidth: 2,
                borderColor: selectedKey === 'silver_10g'
                  ? (theme.isDark ? '#94A3B8' : '#475569')
                  : theme.colors.border,
                gap: 6,
              }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ fontSize: 20 }}>🥈</Text>
                <Text
                  style={{
                    fontSize: 12.5,
                    fontWeight: '800',
                    color: selectedKey === 'silver_10g' ? theme.colors.primary : theme.colors.text,
                  }}
                  numberOfLines={1}
                >
                  {benchmarks.silver_10g.label}
                </Text>
              </View>

              <View>
                <Text style={{ fontSize: 16, fontWeight: '900', color: theme.colors.text }}>
                  {formatMoney(benchmarks.silver_10g.price, activeCurrency)}{' '}
                  <Text style={{ fontSize: 11, fontWeight: '600', color: theme.colors.textMuted }}>/ {benchmarks.silver_10g.unit}</Text>
                </Text>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: benchmarks.silver_10g.change >= 0 ? '#10B981' : '#EF4444',
                    marginTop: 2,
                  }}
                >
                  {benchmarks.silver_10g.change >= 0 ? `+${benchmarks.silver_10g.change}` : benchmarks.silver_10g.change} (+{benchmarks.silver_10g.pct}%)
                </Text>
              </View>
            </Pressable>
          </View>
        </View>

        {/* ── 5. SYNCHRONIZED INTERACTIVE FINANCIAL GRAPH ── */}
        <Card style={{ gap: 12, padding: 16 }}>
          {/* Chart Header Title matching active selection */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 6 }}>
            <View style={{ gap: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '900',
                  color: isGold ? (theme.isDark ? '#FCD34D' : '#D97706') : theme.colors.text,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                }}
              >
                {activeBenchmark.label} / {activeBenchmark.unit}
              </Text>
              <Text variant="caption" muted style={{ fontSize: 11 }}>
                Live Historical Benchmark Curve
              </Text>
            </View>

            {/* Time Filter Pills (1M, 3M, 6M, 1Y) */}
            <View style={{ flexDirection: 'row', gap: 4 }}>
              {([1, 3, 6, 12] as TrendPeriod[]).map((m) => {
                const isActive = trendMonths === m;
                return (
                  <Pressable
                    key={m}
                    onPress={() => { setTrendMonths(m); setSelectedIndex(null); }}
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 3.5,
                      borderRadius: theme.radius.full,
                      backgroundColor: isActive ? chartAccentColor : theme.colors.surfaceElevated,
                      borderWidth: 1,
                      borderColor: isActive ? chartAccentColor : theme.colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 11,
                        fontWeight: isActive ? '800' : '600',
                        color: isActive ? '#FFFFFF' : theme.colors.textMuted,
                      }}
                    >
                      {m === 1 ? '1M' : m === 3 ? '3M' : m === 6 ? '6M' : '1Y'}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* SVG Financial Chart with Y-Axis & X-Axis Gridlines */}
          <View style={{ height: chartHeight, position: 'relative', width: '100%', marginTop: 6 }}>
            <Svg width="100%" height={chartHeight} viewBox={`0 0 ${chartWidth} ${chartHeight}`}>
              <Defs>
                <LinearGradient id="bullionGridGrad" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={chartGradColor} stopOpacity="0.4" />
                  <Stop offset="100%" stopColor={chartGradColor} stopOpacity="0.02" />
                </LinearGradient>
              </Defs>

              {/* Horizontal Gridlines & Y-Axis Numeric Labels */}
              {yAxisTicks.map((tVal, idx) => (
                <React.Fragment key={idx}>
                  <Line
                    x1={padLeft}
                    y1={tVal.y}
                    x2={chartWidth - padRight}
                    y2={tVal.y}
                    stroke={theme.isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)'}
                    strokeDasharray="3, 3"
                    strokeWidth={1}
                  />
                  <SvgText
                    x={padLeft - 6}
                    y={tVal.y + 3}
                    fill={theme.isDark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.45)'}
                    fontSize={9}
                    fontWeight="600"
                    textAnchor="end"
                  >
                    {tVal.price >= 100000 ? `${Math.round(tVal.price / 1000)}k` : tVal.price.toLocaleString()}
                  </SvgText>
                </React.Fragment>
              ))}

              {/* Vertical Time Step Lines */}
              {chartCoords.filter((_, i) => i % 5 === 0).map((c, idx) => (
                <Line
                  key={idx}
                  x1={c.x}
                  y1={padTop}
                  x2={c.x}
                  y2={chartHeight - padBottom}
                  stroke={theme.isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.06)'}
                  strokeDasharray="2, 4"
                  strokeWidth={1}
                />
              ))}

              {/* Gradient Fill under the Curve */}
              {areaPath ? <Path d={areaPath} fill="url(#bullionGridGrad)" /> : null}

              {/* Spline Path Curve */}
              {linePath ? (
                <Path
                  d={linePath}
                  fill="none"
                  stroke={chartAccentColor}
                  strokeWidth={2.8}
                  strokeLinecap="round"
                />
              ) : null}

              {/* Invisible Touch Hitboxes & Glowing Circle Point */}
              {chartCoords.map((c) => {
                const isSel = selectedIndex === c.index;
                const hitW = drawW / chartCoords.length;
                return (
                  <React.Fragment key={c.point.date}>
                    <Rect
                      x={c.x - hitW / 2}
                      y={padTop}
                      width={hitW}
                      height={drawH}
                      fill="transparent"
                      onPress={() => setSelectedIndex(c.index === selectedIndex ? null : c.index)}
                    />
                    {(isSel || (selectedIndex === null && c.index === chartCoords.length - 1)) && (
                      <Circle
                        cx={c.x}
                        cy={c.y}
                        r={isSel ? 6 : 4}
                        fill={isSel ? theme.colors.primary : chartAccentColor}
                        stroke={theme.colors.surface}
                        strokeWidth={2}
                      />
                    )}
                  </React.Fragment>
                );
              })}

              {/* X-Axis Date Labels at the bottom (Day Month Year) */}
              {chartCoords.filter((_, i) => i % Math.max(Math.floor(chartCoords.length / 4), 1) === 0 || i === chartCoords.length - 1).map((c, idx) => (
                <SvgText
                  key={idx}
                  x={c.x}
                  y={chartHeight - 6}
                  fill={theme.isDark ? 'rgba(255,255,255,0.5)' : 'rgba(0,0,0,0.5)'}
                  fontSize={8}
                  fontWeight="700"
                  textAnchor="middle"
                >
                  {c.point.label}
                </SvgText>
              ))}
            </Svg>

            {/* Floating Tooltip Callout with Day, Month, Year */}
            {selectedPoint && (
              <View
                style={{
                  position: 'absolute',
                  top: Math.max(selectedPoint.y - 48, 2),
                  left: Math.min(Math.max(selectedPoint.x - 65, padLeft), chartWidth - 135),
                  backgroundColor: theme.isDark ? '#0F172A' : '#1E293B',
                  paddingHorizontal: 9,
                  paddingVertical: 5,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: theme.isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.2)',
                  alignItems: 'center',
                  shadowColor: '#000000',
                  shadowOffset: { width: 0, height: 3 },
                  shadowOpacity: 0.3,
                  shadowRadius: 6,
                  elevation: 5,
                }}
              >
                <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '900' }}>
                  {formatMoney(selectedPoint.point.price, activeCurrency)}
                </Text>
                <Text style={{ color: '#94A3B8', fontSize: 9.5, fontWeight: '700' }}>
                  {selectedPoint.point.fullDate}
                </Text>
              </View>
            )}
          </View>

          {/* Period High & Low Badges */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 4 }}>
            <View
              style={{
                flex: 1,
                padding: 8,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
              }}
            >
              <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600' }}>
                Period Low
              </Text>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: theme.colors.text, marginTop: 1 }}>
                {formatMoney(minPrice, activeCurrency)}
              </Text>
            </View>

            <View
              style={{
                flex: 1,
                padding: 8,
                borderRadius: theme.radius.md,
                backgroundColor: theme.colors.surfaceElevated,
                borderWidth: 1,
                borderColor: theme.colors.border,
                alignItems: 'center',
              }}
            >
              <Text variant="caption" muted style={{ fontSize: 10, fontWeight: '600' }}>
                Period High
              </Text>
              <Text style={{ fontSize: 12.5, fontWeight: '800', color: chartAccentColor, marginTop: 1 }}>
                {formatMoney(maxPrice, activeCurrency)}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── 6. INSTANT METAL VALUATION CALCULATOR ── */}
        <Card style={{ gap: 12, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Calculator size={17} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 15 }}>
              {t('bullion_calc_title') || 'Instant Metal Valuation Calculator'}
            </Text>
          </View>

          {/* Metal Picker */}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {(
              [
                { key: '24k', label: `🥇 ${t('bullion_hallmark_gold') || 'Gold 24K'}` },
                { key: '22k', label: '👑 Gold 22K' },
                { key: 'silver', label: `🥈 ${t('bullion_silver') || 'Silver 999'}` },
              ] as { key: '24k' | '22k' | 'silver'; label: string }[]
            ).map((m) => {
              const isActive = calcMetal === m.key;
              return (
                <Pressable
                  key={m.key}
                  onPress={() => setCalcMetal(m.key)}
                  style={{
                    flex: 1,
                    paddingVertical: 8,
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
                    numberOfLines={1}
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
              borderWidth: 1.5,
              borderColor: theme.colors.primary,
              paddingHorizontal: 14,
              height: 50,
            }}
          >
            <Scale size={18} color={theme.colors.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              placeholder="Enter weight in grams (e.g. 15.5)"
              placeholderTextColor={theme.colors.textMuted}
              keyboardType="numeric"
              value={calcWeight}
              onChangeText={(text) => setCalcWeight(text.replace(/[^0-9.]/g, ''))}
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: '800',
                color: theme.colors.text,
                paddingVertical: 0,
              }}
            />
            <Text style={{ fontWeight: '800', color: theme.colors.primary, fontSize: 13 }}>
              Grams
            </Text>
          </View>

          {/* Value Result */}
          <View
            style={{
              padding: 14,
              borderRadius: theme.radius.md,
              backgroundColor: theme.isDark ? '#141E33' : theme.colors.cardHighlight,
              borderWidth: 1,
              borderColor: theme.isDark ? 'rgba(129, 140, 248, 0.3)' : theme.colors.border,
              alignItems: 'center',
              gap: 3,
            }}
          >
            <Text variant="caption" muted style={{ fontSize: 11, fontWeight: '600' }}>
              Estimated Total Cash Value ({weightNum}g)
            </Text>
            <Text variant="h1" style={{ fontSize: 26, fontWeight: '900', color: theme.colors.primary }}>
              {formatMoney(calculatedValue, activeCurrency)}
            </Text>
          </View>
        </Card>

        {/* ── 7. BULLION STANDARDS & BUYER GUIDE ── */}
        <Card style={{ gap: 10, padding: 16 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Info size={16} color={theme.colors.primary} />
            <Text variant="label" style={{ fontWeight: '800', fontSize: 14 }}>
              {t('bullion_guide_title') || 'Bullion Standards & Buyer Guide'}
            </Text>
          </View>

          <View style={{ gap: 8 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <ShieldCheck size={16} color="#10B981" style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                  24K vs 22K (Hallmark 916)
                </Text>
                <Text variant="caption" muted style={{ fontSize: 11.5, lineHeight: 16 }}>
                  24K (99.9% purity) is ideal for pure investment bars/coins. 22K (91.6% purity) is the global standard for durable jewelry.
                </Text>
              </View>
            </View>

            <View style={{ flexDirection: 'row', gap: 8 }}>
              <Scale size={16} color="#F59E0B" style={{ marginTop: 2 }} />
              <View style={{ flex: 1, gap: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: '700', color: theme.colors.text }}>
                  Tola Measurement Standard
                </Text>
                <Text variant="caption" muted style={{ fontSize: 11.5, lineHeight: 16 }}>
                  1 Tola = 11.6638 grams. 1 Troy Ounce = 31.1035 grams. 10 Grams = 0.85735 Tola.
                </Text>
              </View>
            </View>
          </View>
        </Card>
      </ScrollView>
    </View>
  );
}
