import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Easing,
  Platform,
  StyleSheet,
  useColorScheme,
  View,
} from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish?: () => void;
}

export function AnimatedSplashScreen({ visible, onFinish }: AnimatedSplashScreenProps) {
  const { t } = useLanguage();
  const systemScheme = useColorScheme();

  let isDark = systemScheme === 'dark';
  try {
    const themeContext = useTheme();
    if (themeContext) {
      isDark = themeContext.isDark;
    }
  } catch {
    isDark = systemScheme === 'dark';
  }

  const fullPunchline = t('splash_punchline') || 'See Where Your Money Flows';
  const words = useMemo(() => fullPunchline.split(' ').filter(Boolean), [fullPunchline]);

  const [hidden, setHidden] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Gold Seal Ring & Orbit Animations
  const sealScale = useRef(new Animated.Value(0.3)).current;
  const sealOpacity = useRef(new Animated.Value(0)).current;
  const outerRingRotate = useRef(new Animated.Value(0)).current;
  const haloGlow = useRef(new Animated.Value(0.2)).current;
  const flareTranslateX = useRef(new Animated.Value(-160)).current;

  // Title Letter-Spacing & Fade
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(20)).current;
  const titleLetterSpacing = useRef(new Animated.Value(5)).current;

  // Punchline Badge & Staggered Word Wave
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.88)).current;
  const sparklePulse = useRef(new Animated.Value(0.3)).current;

  const wordAnims = useRef(
    words.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(14),
      scale: new Animated.Value(0.7),
    })),
  ).current;

  useEffect(() => {
    // 1. Gold Seal Medallion Spring Pop & Halo Radiance
    Animated.parallel([
      Animated.timing(sealOpacity, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(sealScale, { toValue: 1, friction: 6, tension: 45, useNativeDriver: true }),
      Animated.timing(haloGlow, { toValue: 0.9, duration: 1100, useNativeDriver: true }),
    ]).start();

    // 2. Continuous rotating celestial orbit ring
    Animated.loop(
      Animated.timing(outerRingRotate, {
        toValue: 1,
        duration: 14000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // 3. Shimmer flare sweep across the golden coin
    Animated.sequence([
      Animated.delay(450),
      Animated.timing(flareTranslateX, {
        toValue: 180,
        duration: 750,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // 4. Title & Dynamic Letter-Tracking Expansion
    Animated.sequence([
      Animated.delay(450),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.spring(titleTranslateY, { toValue: 0, friction: 6.5, tension: 55, useNativeDriver: true }),
        Animated.timing(titleLetterSpacing, {
          toValue: 0.5,
          duration: 750,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: false,
        }),
      ]),
    ]).start();

    // 5. Punchline Capsule Pop & Cascading Word Wave
    const wordAnimations = wordAnims.map((anim) =>
      Animated.parallel([
        Animated.timing(anim.opacity, { toValue: 1, duration: 320, useNativeDriver: true }),
        Animated.spring(anim.translateY, { toValue: 0, friction: 5.5, tension: 60, useNativeDriver: true }),
        Animated.spring(anim.scale, { toValue: 1, friction: 5.5, tension: 60, useNativeDriver: true }),
      ]),
    );

    const punchlineTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(badgeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(badgeScale, { toValue: 1, friction: 6.5, tension: 55, useNativeDriver: true }),
      ]).start();

      Animated.stagger(110, wordAnimations).start(() => {
        setTimeout(() => {
          setCanDismiss(true);
        }, 700);
      });
    }, 650);

    // Glowing sparkle pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, { toValue: 1, duration: 1100, useNativeDriver: true }),
        Animated.timing(sparklePulse, { toValue: 0.3, duration: 1100, useNativeDriver: true }),
      ]),
    ).start();

    return () => clearTimeout(punchlineTimer);
  }, [
    badgeOpacity,
    badgeScale,
    flareTranslateX,
    haloGlow,
    outerRingRotate,
    sealOpacity,
    sealScale,
    sparklePulse,
    titleLetterSpacing,
    titleOpacity,
    titleTranslateY,
    wordAnims,
  ]);

  useEffect(() => {
    if (!visible && canDismiss) {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 450,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setHidden(true);
        if (onFinish) onFinish();
      });
    }
  }, [canDismiss, fadeAnim, onFinish, visible]);

  if (hidden) {
    return null;
  }

  const outerSpin = outerRingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Dynamic Theme Colors
  const goldColor = '#A8791F';
  const bgColor = isDark ? '#0B0F19' : '#F2EFE9';
  const sealBg = isDark ? '#141B26' : '#FAFAF8';
  const titleColor = isDark ? '#FFFFFF' : '#111827';
  const haloColor = isDark ? 'rgba(168, 121, 31, 0.25)' : 'rgba(168, 121, 31, 0.15)';
  const orbitRingColor = isDark ? 'rgba(168, 121, 31, 0.4)' : 'rgba(168, 121, 31, 0.3)';
  const badgeBgColor = isDark ? 'rgba(168, 121, 31, 0.15)' : 'rgba(168, 121, 31, 0.12)';
  const badgeBorderColor = isDark ? 'rgba(168, 121, 31, 0.35)' : 'rgba(168, 121, 31, 0.25)';
  const wordColor = isDark ? '#FFFFFF' : '#111827';
  const highlightWordColor = goldColor;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: bgColor,
          opacity: fadeAnim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.centerContent}>
        {/* ── STAGE: GOLD SEAL EMBLEM + ORBIT + SHIMMER ── */}
        <View style={styles.stage}>
          {/* Radiant Ambient Glow Halo */}
          <Animated.View
            style={[
              styles.ambientHalo,
              {
                backgroundColor: haloColor,
                opacity: haloGlow,
              },
            ]}
          />

          {/* Outer Dashed Orbit Ring */}
          <Animated.View
            style={[
              styles.outerOrbitRing,
              {
                borderColor: orbitRingColor,
                transform: [{ rotate: outerSpin }],
              },
            ]}
          />

          {/* 4 Golden Alignment Dots (North, East, South, West) */}
          <Animated.View style={[styles.alignmentDot, { top: 0, backgroundColor: goldColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.alignmentDot, { bottom: 0, backgroundColor: goldColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.alignmentDot, { left: 10, backgroundColor: goldColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.alignmentDot, { right: 10, backgroundColor: goldColor, opacity: sparklePulse }]} />

          {/* Golden 'S' Coin Seal Medallion */}
          <Animated.View
            style={[
              styles.sealWrapper,
              {
                opacity: sealOpacity,
                transform: [{ scale: sealScale }],
              },
            ]}
          >
            {/* Outer Coin Circle */}
            <View
              style={{
                width: 104,
                height: 104,
                borderRadius: 52,
                borderWidth: 3.5,
                borderColor: goldColor,
                backgroundColor: sealBg,
                alignItems: 'center',
                justifyContent: 'center',
                shadowColor: goldColor,
                shadowOffset: { width: 0, height: 8 },
                shadowOpacity: isDark ? 0.45 : 0.25,
                shadowRadius: 16,
                elevation: 12,
                overflow: 'hidden',
              }}
            >
              {/* Inner Concentric Ring */}
              <View
                style={{
                  width: 86,
                  height: 86,
                  borderRadius: 43,
                  borderWidth: 1.2,
                  borderColor: goldColor,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text
                  style={{
                    fontSize: 48,
                    lineHeight: 58,
                    fontWeight: '900',
                    color: goldColor,
                    fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                    includeFontPadding: true,
                    textAlignVertical: 'center',
                  }}
                >
                  S
                </Text>
              </View>

              {/* Shimmer Light Flare Beam Sweep */}
              <Animated.View
                style={[
                  styles.shimmerFlare,
                  {
                    transform: [{ translateX: flareTranslateX }],
                  },
                ]}
              />
            </View>

            {/* Twin Curved Pedestal Arcs */}
            <Svg width={112} height={24} viewBox="0 0 72 16" style={{ marginTop: 4 }}>
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
          </Animated.View>
        </View>

        {/* ── BRAND TITLE & PUNCHLINE STACK ── */}
        <View style={styles.textStack}>
          {/* Animated Serif Title with Letter Tracking */}
          <Animated.View
            style={{
              opacity: titleOpacity,
              transform: [{ translateY: titleTranslateY }],
            }}
          >
            <Animated.Text
              style={[
                styles.brandTitle,
                {
                  color: titleColor,
                  letterSpacing: titleLetterSpacing,
                  fontFamily: Platform.OS === 'ios' ? 'Georgia' : 'serif',
                },
              ]}
            >
              SpendFlow
            </Animated.Text>
          </Animated.View>

          {/* Animated Cascading Word-Wave Punchline Capsule */}
          <Animated.View
            style={[
              styles.punchlineBadge,
              {
                backgroundColor: badgeBgColor,
                borderColor: badgeBorderColor,
                opacity: badgeOpacity,
                transform: [{ scale: badgeScale }],
              },
            ]}
          >
            <View style={styles.wordsRow}>
              {words.map((word, idx) => {
                const isLastWord = idx === words.length - 1;
                const anim = wordAnims[idx];
                return (
                  <Animated.View
                    key={`${word}-${idx}`}
                    style={{
                      opacity: anim ? anim.opacity : 1,
                      transform: [
                        { translateY: anim ? anim.translateY : 0 },
                        { scale: anim ? anim.scale : 1 },
                      ],
                    }}
                  >
                    <Text
                      variant="caption"
                      style={[
                        styles.brandWord,
                        { color: wordColor },
                        isLastWord && { color: highlightWordColor, fontWeight: '800' },
                      ]}
                    >
                      {word}
                    </Text>
                  </Animated.View>
                );
              })}
            </View>
          </Animated.View>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...(StyleSheet.absoluteFillObject as any),
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  stage: {
    width: 210,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambientHalo: {
    position: 'absolute',
    width: 170,
    height: 170,
    borderRadius: 85,
    shadowColor: '#A8791F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.85,
    shadowRadius: 38,
  },
  outerOrbitRing: {
    position: 'absolute',
    width: 188,
    height: 188,
    borderRadius: 94,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  alignmentDot: {
    position: 'absolute',
    width: 5,
    height: 5,
    borderRadius: 2.5,
    shadowColor: '#A8791F',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  sealWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'visible',
  },
  shimmerFlare: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.4)',
    transform: [{ skewX: '-25deg' }],
  },
  textStack: {
    alignItems: 'center',
    gap: 10,
  },
  brandTitle: {
    fontSize: 38,
    fontWeight: '900',
    textAlign: 'center',
  },
  punchlineBadge: {
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    shadowColor: '#A8791F',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  wordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  brandWord: {
    fontSize: 13.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
});
