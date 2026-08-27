import React from 'react';
import { Platform, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/components/ui/Text';

interface SpendFlowSealLogoProps {
  size?: number;
  isDark?: boolean;
  showPedestal?: boolean;
  showAura?: boolean;
}

export function SpendFlowSealLogo({
  size = 60,
  isDark = false,
  showPedestal = true,
  showAura = true,
}: SpendFlowSealLogoProps) {
  const goldColor = '#A8791F';
  const sealBg = isDark ? '#141B26' : '#FAFAF8';

  const innerSize = Math.round(size * 0.82);
  const fontSize = Math.round(size * 0.46);
  const pedestalWidth = Math.round(size * 1.08);
  const pedestalHeight = Math.max(12, Math.round(size * 0.22));

  const auraSize = Math.round(size * 1.75);
  const dotSize = Math.max(4, Math.round(size * 0.07));
  const containerHeight = showAura ? auraSize : size + (showPedestal ? pedestalHeight : 0);

  return (
    <View
      style={[
        styles.container,
        {
          width: showAura ? auraSize : size,
          height: containerHeight,
        },
      ]}
    >
      {/* ── Optional Outer Dashed Alignment Orbit & Aura Disk ── */}
      {showAura ? (
        <View
          style={{
            position: 'absolute',
            width: auraSize,
            height: auraSize,
            borderRadius: auraSize / 2,
            borderWidth: 1.2,
            borderStyle: 'dashed',
            borderColor: isDark ? 'rgba(168, 121, 31, 0.4)' : 'rgba(168, 121, 31, 0.3)',
            backgroundColor: isDark ? 'rgba(255, 255, 255, 0.02)' : 'rgba(168, 121, 31, 0.05)',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {/* North Dot */}
          <View
            style={{
              position: 'absolute',
              top: -dotSize / 2,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: goldColor,
            }}
          />
          {/* South Dot */}
          <View
            style={{
              position: 'absolute',
              bottom: -dotSize / 2,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: goldColor,
            }}
          />
          {/* West Dot */}
          <View
            style={{
              position: 'absolute',
              left: -dotSize / 2,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: goldColor,
            }}
          />
          {/* East Dot */}
          <View
            style={{
              position: 'absolute',
              right: -dotSize / 2,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: goldColor,
            }}
          />
        </View>
      ) : null}

      {/* ── Main Gold Medallion Outer Coin Circle + Pedestal Stack ── */}
      <View style={{ alignItems: 'center', justifyContent: 'center' }}>
        <View
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: Math.max(2.5, size * 0.04),
            borderColor: goldColor,
            backgroundColor: sealBg,
            alignItems: 'center',
            justifyContent: 'center',
            shadowColor: goldColor,
            shadowOffset: { width: 0, height: 3 },
            shadowOpacity: isDark ? 0.35 : 0.2,
            shadowRadius: 6,
            elevation: 4,
          }}
        >
          {/* Inner Concentric Thin Ring */}
          <View
            style={{
              width: innerSize,
              height: innerSize,
              borderRadius: innerSize / 2,
              borderWidth: 1.2,
              borderColor: goldColor,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize,
                fontWeight: '900',
                color: goldColor,
                fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                marginTop: -2,
              }}
            >
              S
            </Text>
          </View>
        </View>

        {/* Twin Curved Golden Pedestal Arcs */}
        {showPedestal ? (
          <Svg
            width={pedestalWidth}
            height={pedestalHeight}
            viewBox="0 0 72 16"
            style={{ marginTop: 3 }}
          >
            <Path
              d="M 6 4 Q 36 14 66 4"
              fill="none"
              stroke={goldColor}
              strokeWidth="2.5"
              strokeLinecap="round"
            />
            <Path
              d="M 16 11 Q 36 17 56 11"
              fill="none"
              stroke={goldColor}
              strokeWidth="1.5"
              strokeLinecap="round"
              opacity={0.7}
            />
          </Svg>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
});
