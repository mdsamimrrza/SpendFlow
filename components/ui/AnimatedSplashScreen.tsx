import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, useColorScheme, View } from 'react-native';
import { useLanguage } from '@/hooks/useLanguage';
import { useTheme } from '@/hooks/useTheme';
import { Text } from './Text';

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish?: () => void;
}

/**
 * STYLE 6 (THEME-ADAPTIVE): Diamond Cyber Matrix + Dynamic Letter-Tracking + Cascading Punchline
 * Dynamically adapts color palette to Light Mode vs Dark Mode based on system / user preference.
 */
export function AnimatedSplashScreen({ visible, onFinish }: AnimatedSplashScreenProps) {
  const { t } = useLanguage();
  const systemScheme = useColorScheme();
  
  // Try using useTheme if available, fallback gracefully to systemScheme
  let isDark = systemScheme === 'dark';
  try {
    const themeContext = useTheme();
    if (themeContext) {
      isDark = themeContext.isDark;
    }
  } catch {
    // Fallback to system colorScheme if mounted outside ThemeProvider
    isDark = systemScheme === 'dark';
  }

  const fullPunchline = t('splash_punchline');
  const words = useMemo(() => fullPunchline.split(' ').filter(Boolean), [fullPunchline]);

  const [hidden, setHidden] = useState(false);
  const [canDismiss, setCanDismiss] = useState(false);

  const fadeAnim = useRef(new Animated.Value(1)).current;

  // Diamond Frame & Outer Orbit Ring
  const frameRotate = useRef(new Animated.Value(45)).current;
  const frameScale = useRef(new Animated.Value(0.2)).current;
  const frameOpacity = useRef(new Animated.Value(0)).current;
  const outerRingRotate = useRef(new Animated.Value(0)).current;

  // Icon Pop & Flare Sweep
  const iconScale = useRef(new Animated.Value(0.4)).current;
  const iconOpacity = useRef(new Animated.Value(0)).current;
  const flareTranslateX = useRef(new Animated.Value(-150)).current;
  const haloGlow = useRef(new Animated.Value(0.2)).current;

  // Title Letter-Spacing Tracking
  const titleOpacity = useRef(new Animated.Value(0)).current;
  const titleTranslateY = useRef(new Animated.Value(18)).current;
  const titleLetterSpacing = useRef(new Animated.Value(6)).current;

  // Punchline Badge
  const badgeOpacity = useRef(new Animated.Value(0)).current;
  const badgeScale = useRef(new Animated.Value(0.85)).current;
  const sparklePulse = useRef(new Animated.Value(0.2)).current;

  // Individual Animated values for each word in the punchline
  const wordAnims = useRef(
    words.map(() => ({
      opacity: new Animated.Value(0),
      translateY: new Animated.Value(12),
      scale: new Animated.Value(0.65),
    })),
  ).current;

  useEffect(() => {
    // 1. Diamond Frame Unfurl & Outer Ring Counter-Rotation
    Animated.parallel([
      Animated.timing(frameOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
      Animated.spring(frameScale, { toValue: 1, friction: 6.5, tension: 40, useNativeDriver: true }),
      Animated.spring(frameRotate, { toValue: 0, friction: 6.5, tension: 40, useNativeDriver: true }),

      Animated.timing(iconOpacity, { toValue: 1, duration: 500, delay: 170, useNativeDriver: true }),
      Animated.spring(iconScale, { toValue: 1, friction: 6.5, tension: 50, delay: 170, useNativeDriver: true }),
      Animated.timing(haloGlow, { toValue: 0.85, duration: 1000, useNativeDriver: true }),
    ]).start();

    // 2. Counter-rotating outer ring loop
    Animated.loop(
      Animated.timing(outerRingRotate, {
        toValue: 1,
        duration: 12000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    ).start();

    // 3. Diagonal Flare Sweep across Icon
    Animated.sequence([
      Animated.delay(500),
      Animated.timing(flareTranslateX, {
        toValue: 160,
        duration: 700,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // 4. Title & Dynamic Letter-Tracking Expansion
    Animated.sequence([
      Animated.delay(500),
      Animated.parallel([
        Animated.timing(titleOpacity, { toValue: 1, duration: 550, useNativeDriver: true }),
        Animated.spring(titleTranslateY, { toValue: 0, friction: 6.5, tension: 55, useNativeDriver: true }),
        Animated.timing(titleLetterSpacing, { toValue: 1, duration: 700, easing: Easing.out(Easing.cubic), useNativeDriver: false }),
      ]),
    ]).start();

    // 5. Punchline Capsule Pop & Cascading Word Wave
    const wordAnimations = wordAnims.map((anim) =>
      Animated.parallel([
        Animated.timing(anim.opacity, { toValue: 1, duration: 330, useNativeDriver: true }),
        Animated.spring(anim.translateY, { toValue: 0, friction: 5.5, tension: 60, useNativeDriver: true }),
        Animated.spring(anim.scale, { toValue: 1, friction: 5.5, tension: 60, useNativeDriver: true }),
      ]),
    );

    const punchlineTimer = setTimeout(() => {
      Animated.parallel([
        Animated.timing(badgeOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
        Animated.spring(badgeScale, { toValue: 1, friction: 6.5, tension: 55, useNativeDriver: true }),
      ]).start();

      Animated.stagger(120, wordAnimations).start(() => {
        // Hold completed presentation for clean, comfortable reading
        setTimeout(() => {
          setCanDismiss(true);
        }, 800);
      });
    }, 700);

    // Glowing corner brackets pulse loop
    Animated.loop(
      Animated.sequence([
        Animated.timing(sparklePulse, { toValue: 1, duration: 1000, useNativeDriver: true }),
        Animated.timing(sparklePulse, { toValue: 0.25, duration: 1000, useNativeDriver: true }),
      ]),
    ).start();

    return () => clearTimeout(punchlineTimer);
  }, [
    badgeOpacity,
    badgeScale,
    flareTranslateX,
    frameOpacity,
    frameRotate,
    frameScale,
    haloGlow,
    iconOpacity,
    iconScale,
    outerRingRotate,
    sparklePulse,
    titleLetterSpacing,
    titleOpacity,
    titleTranslateY,
    wordAnims,
  ]);

  useEffect(() => {
    // Exit fade out animation when initial loading finishes AND all punchline word animations completed
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

  const frameSpin = frameRotate.interpolate({
    inputRange: [0, 45],
    outputRange: ['0deg', '45deg'],
  });

  const outerSpin = outerRingRotate.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  // Dynamic Theme Colors
  const bgColor = isDark ? '#06090F' : '#F8FAFC';
  const titleColor = isDark ? '#F8FAFC' : '#0F172A';
  const haloColor = isDark ? '#6366F1' : '#A5B4FC';
  const orbitRingColor = isDark ? 'rgba(129, 140, 248, 0.25)' : 'rgba(99, 102, 241, 0.2)';
  const diamondBorderColor = isDark ? '#818CF8' : '#6366F1';
  const diamondBgColor = isDark ? 'rgba(99, 102, 241, 0.1)' : 'rgba(99, 102, 241, 0.05)';
  const bracketColor = isDark ? '#A5B4FC' : '#6366F1';
  const iconBorderColor = isDark ? 'rgba(165, 180, 252, 0.55)' : 'rgba(99, 102, 241, 0.35)';
  const iconBgColor = isDark ? '#1E1B4B' : '#EEF2FF';
  const badgeBgColor = isDark ? 'rgba(99, 102, 241, 0.14)' : 'rgba(99, 102, 241, 0.08)';
  const badgeBorderColor = isDark ? 'rgba(129, 140, 248, 0.35)' : 'rgba(99, 102, 241, 0.25)';
  const wordColor = isDark ? '#E0E7FF' : '#334155';
  const highlightWordColor = isDark ? '#818CF8' : '#4F46E5';

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
        {/* Geometric Diamond Frame Stage */}
        <View style={styles.stage}>
          {/* Ambient Glowing Halo */}
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

          {/* Rotating Diamond Glow Frame */}
          <Animated.View
            style={[
              styles.diamondFrame,
              {
                borderColor: diamondBorderColor,
                backgroundColor: diamondBgColor,
                opacity: frameOpacity,
                transform: [{ scale: frameScale }, { rotate: frameSpin }],
              },
            ]}
          />

          {/* 4 Floating Neon Sparkle Particles */}
          <Animated.View style={[styles.sparkleDot, { top: 6, left: 24, backgroundColor: bracketColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.sparkleDot, { top: 6, right: 24, backgroundColor: bracketColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.sparkleDot, { bottom: 6, left: 24, backgroundColor: bracketColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.sparkleDot, { bottom: 6, right: 24, backgroundColor: bracketColor, opacity: sparklePulse }]} />

          {/* Corner Cyber Brackets */}
          <Animated.View style={[styles.cornerBracket, styles.bracketTopLeft, { borderColor: bracketColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.cornerBracket, styles.bracketTopRight, { borderColor: bracketColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.cornerBracket, styles.bracketBottomLeft, { borderColor: bracketColor, opacity: sparklePulse }]} />
          <Animated.View style={[styles.cornerBracket, styles.bracketBottomRight, { borderColor: bracketColor, opacity: sparklePulse }]} />

          {/* Center App Icon with Light Flare Sweep */}
          <Animated.View
            style={[
              styles.iconWrapper,
              {
                borderColor: iconBorderColor,
                backgroundColor: iconBgColor,
                opacity: iconOpacity,
                transform: [{ scale: iconScale }],
              },
            ]}
          >
            <Image
              source={isDark ? require('../../assets/icon.png') : require('../../assets/icon-light.png')}
              style={styles.logoImage}
              resizeMode="cover"
            />

            {/* Shimmer Light Flare Beam */}
            <Animated.View
              style={[
                styles.shimmerFlare,
                {
                  transform: [{ translateX: flareTranslateX }],
                },
              ]}
            />
          </Animated.View>
        </View>

        {/* Brand Title with Dynamic Letter-Tracking */}
        <View style={styles.textStack}>
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
                },
              ]}
            >
              {t('splash_title')}
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
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  stage: {
    width: 190,
    height: 190,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  ambientHalo: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 45,
  },
  outerOrbitRing: {
    position: 'absolute',
    width: 176,
    height: 176,
    borderRadius: 88,
    borderWidth: 1.2,
    borderStyle: 'dashed',
  },
  diamondFrame: {
    position: 'absolute',
    width: 144,
    height: 144,
    borderRadius: 26,
    borderWidth: 1.8,
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 24,
  },
  sparkleDot: {
    position: 'absolute',
    width: 6,
    height: 6,
    borderRadius: 3,
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
  },
  cornerBracket: {
    position: 'absolute',
    width: 15,
    height: 15,
  },
  bracketTopLeft: {
    top: 8,
    left: 8,
    borderTopWidth: 2,
    borderLeftWidth: 2,
  },
  bracketTopRight: {
    top: 8,
    right: 8,
    borderTopWidth: 2,
    borderRightWidth: 2,
  },
  bracketBottomLeft: {
    bottom: 8,
    left: 8,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
  },
  bracketBottomRight: {
    bottom: 8,
    right: 8,
    borderBottomWidth: 2,
    borderRightWidth: 2,
  },
  iconWrapper: {
    width: 116,
    height: 116,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#6366F1',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.65,
    shadowRadius: 24,
    elevation: 18,
    borderWidth: 1.5,
    position: 'relative',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  shimmerFlare: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.35)',
    transform: [{ skewX: '-25deg' }],
  },
  textStack: {
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 36,
    fontWeight: '900',
    textAlign: 'center',
  },
  punchlineBadge: {
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 22,
    borderWidth: 1.2,
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
  },
  wordsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
  },
  brandWord: {
    fontSize: 14,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
});
