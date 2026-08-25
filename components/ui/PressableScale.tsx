import React, { useRef } from 'react';
import {
  Animated,
  Pressable,
  PressableProps,
  StyleProp,
  ViewStyle,
} from 'react-native';
import * as Haptics from 'expo-haptics';

interface PressableScaleProps extends PressableProps {
  activeScale?: number;
  haptic?: boolean;
  containerStyle?: StyleProp<ViewStyle>;
  style?: StyleProp<ViewStyle> | ((state: { pressed: boolean }) => StyleProp<ViewStyle>);
  children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}

export function PressableScale({
  activeScale = 0.92,
  haptic = true,
  containerStyle,
  style,
  children,
  onPressIn,
  onPressOut,
  disabled,
  ...props
}: PressableScaleProps) {
  const scaleAnim = useRef(new Animated.Value(1)).current;

  function handlePressIn(e: any) {
    if (disabled) return;
    if (haptic) {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => undefined);
    }
    Animated.spring(scaleAnim, {
      toValue: activeScale,
      friction: 6,
      tension: 120,
      useNativeDriver: true,
    }).start();
    onPressIn?.(e);
  }

  function handlePressOut(e: any) {
    if (disabled) return;
    Animated.spring(scaleAnim, {
      toValue: 1,
      friction: 4,
      tension: 80,
      useNativeDriver: true,
    }).start();
    onPressOut?.(e);
  }

  return (
    <Animated.View style={[{ transform: [{ scale: scaleAnim }] }, containerStyle]}>
      <Pressable
        disabled={disabled}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        style={style}
        {...props}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
