import React, { useEffect, useRef } from 'react';
import { Animated, Easing, View } from 'react-native';
import { Link } from 'expo-router';
import { Plus } from 'lucide-react-native';
import { PressableScale } from '@/components/ui/PressableScale';
import { useTheme } from '@/hooks/useTheme';

export function FloatingAddButton() {
  const theme = useTheme();
  const translateY = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Gentle continuous floating sine-wave animation (up & down by 5px)
    const floatAnim = Animated.loop(
      Animated.sequence([
        Animated.timing(translateY, {
          toValue: -6,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 1800,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    );

    floatAnim.start();
    return () => floatAnim.stop();
  }, [translateY]);

  return (
    <Animated.View
      pointerEvents="box-none"
      style={{
        position: 'absolute',
        bottom: 88,
        right: 22,
        zIndex: 999,
        transform: [{ translateY }],
      }}
    >
      <Link href="/expense/add" asChild>
        <PressableScale
          activeScale={0.88}
          style={{
            width: 58,
            height: 58,
            borderRadius: 29,
            backgroundColor: theme.colors.primary,
            alignItems: 'center',
            justifyContent: 'center',
            borderWidth: 2,
            borderColor: 'rgba(255, 255, 255, 0.3)',
            shadowColor: theme.colors.primary,
            shadowOffset: { width: 0, height: 10 },
            shadowOpacity: theme.isDark ? 0.6 : 0.45,
            shadowRadius: 16,
            elevation: 12,
          }}
        >
          <Plus size={28} color="#FFFFFF" strokeWidth={2.8} />
        </PressableScale>
      </Link>
    </Animated.View>
  );
}
