import React, { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Image, StyleSheet, View } from 'react-native';
import { Text } from './Text';

interface AnimatedSplashScreenProps {
  visible: boolean;
  onFinish?: () => void;
}

export function AnimatedSplashScreen({ visible, onFinish }: AnimatedSplashScreenProps) {
  const [hidden, setHidden] = useState(false);
  const fadeAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.65)).current;
  const logoOpacity = useRef(new Animated.Value(0)).current;
  const textOpacity = useRef(new Animated.Value(0)).current;
  const textTranslateY = useRef(new Animated.Value(16)).current;

  useEffect(() => {
    // Entrance sequence (Logo spring scale -> Punchline slide & fade in)
    Animated.sequence([
      Animated.parallel([
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 750,
          easing: Easing.out(Easing.back(1.6)),
          useNativeDriver: true,
        }),
        Animated.timing(logoOpacity, {
          toValue: 1,
          duration: 550,
          useNativeDriver: true,
        }),
      ]),
      Animated.parallel([
        Animated.timing(textOpacity, {
          toValue: 1,
          duration: 450,
          useNativeDriver: true,
        }),
        Animated.timing(textTranslateY, {
          toValue: 0,
          duration: 450,
          easing: Easing.out(Easing.back(1.2)),
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  }, [logoOpacity, scaleAnim, textOpacity, textTranslateY]);

  useEffect(() => {
    // Exit fade out animation when loading finishes
    if (!visible) {
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
  }, [fadeAnim, onFinish, visible]);

  if (hidden) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
        },
      ]}
      pointerEvents={visible ? 'auto' : 'none'}
    >
      <View style={styles.centerContent}>
        {/* Animated Icon Card */}
        <Animated.View
          style={[
            styles.iconWrapper,
            {
              transform: [{ scale: scaleAnim }],
              opacity: logoOpacity,
            },
          ]}
        >
          <Image
            source={require('../../assets/icon.png')}
            style={styles.logoImage}
            resizeMode="cover"
          />
        </Animated.View>

        {/* Animated Title & Punchline */}
        <Animated.View
          style={[
            styles.textWrapper,
            {
              opacity: textOpacity,
              transform: [{ translateY: textTranslateY }],
            },
          ]}
        >
          <Text variant="display" style={styles.brandTitle}>
            SpendFlow
          </Text>
          <View style={styles.punchlineBadge}>
            <Text variant="caption" style={styles.brandPunchline}>
              See Where Your Money Flows
            </Text>
          </View>
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0B0F19',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 9999,
  },
  centerContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 22,
  },
  iconWrapper: {
    width: 114,
    height: 114,
    borderRadius: 28,
    overflow: 'hidden',
    shadowColor: '#818CF8',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.45,
    shadowRadius: 18,
    elevation: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(129, 140, 248, 0.35)',
  },
  logoImage: {
    width: '100%',
    height: '100%',
  },
  textWrapper: {
    alignItems: 'center',
    gap: 8,
  },
  brandTitle: {
    fontSize: 34,
    fontWeight: '800',
    color: '#F8FAFC',
    letterSpacing: 0.5,
  },
  punchlineBadge: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(129, 140, 248, 0.12)',
    borderWidth: 1,
    borderColor: 'rgba(129, 140, 248, 0.25)',
  },
  brandPunchline: {
    fontSize: 13,
    fontWeight: '700',
    color: '#A5B4FC',
    letterSpacing: 0.4,
  },
});
