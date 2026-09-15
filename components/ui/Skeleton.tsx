import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, View, ViewStyle } from 'react-native';
import { useTheme } from '@/hooks/useTheme';

/**
 * Loading placeholder with a sweeping shimmer highlight, so first-load
 * screens read as "intentionally loading" instead of blank.
 */
export function Skeleton({
  height = 80,
  width,
  radius,
  style,
}: {
  height?: number;
  width?: number | `${number}%`;
  radius?: number;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const [containerWidth, setContainerWidth] = useState(0);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (containerWidth <= 0) return;
    const loop = Animated.loop(
      Animated.timing(sweep, {
        toValue: 1,
        duration: 1100,
        easing: Easing.inOut(Easing.quad),
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [containerWidth, sweep]);

  const SWEEP_WIDTH = containerWidth * 0.6;

  return (
    <View
      onLayout={(e) => setContainerWidth(e.nativeEvent.layout.width)}
      style={[
        {
          height,
          width: width ?? '100%',
          borderRadius: radius ?? theme.radius.md,
          backgroundColor: theme.colors.surfaceElevated,
          overflow: 'hidden',
          marginBottom: theme.spacing.md,
        },
        style,
      ]}
    >
      {containerWidth > 0 ? (
        <Animated.View
          pointerEvents="none"
          style={{
            position: 'absolute',
            top: 0,
            bottom: 0,
            width: SWEEP_WIDTH,
            transform: [
              {
                translateX: sweep.interpolate({
                  inputRange: [0, 1],
                  outputRange: [-SWEEP_WIDTH, containerWidth],
                }),
              },
            ],
            backgroundColor: theme.isDark ? 'rgba(255,255,255,0.07)' : 'rgba(255,255,255,0.55)',
          }}
        />
      ) : null}
    </View>
  );
}
