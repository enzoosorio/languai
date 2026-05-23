import React, { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';

// Organic blob — closed path, same command count so both endpoints close cleanly.
const BLOB_PATH =
  'M 200,40 ' +
  'C 290,30 370,90 385,175 ' +
  'C 400,260 355,340 270,360 ' +
  'C 210,375 145,365 95,335 ' +
  'C 40,302 10,240 20,170 ' +
  'C 30,95 110,50 200,40 Z';

interface BackgroundBlobProps {
  color?: string;
}

export function BackgroundBlob({ color }: BackgroundBlobProps) {
  const { width } = useWindowDimensions();
  const { colors } = useTheme();
  const blobColor = color ?? colors.blob;

  const breathe = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathe, {
          toValue: 1,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathe, {
          toValue: 0,
          duration: 8000,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, []);

  const scale = breathe.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const opacity = breathe.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] });

  const blobSize = width * 0.92;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          width: blobSize,
          height: blobSize * 0.9,
          left: (width - blobSize) / 2,
          bottom: -blobSize * 0.18,
          transform: [{ scale }],
          opacity,
        },
      ]}
      pointerEvents="none"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 360"
        preserveAspectRatio="xMidYMid meet"
      >
        <Path d={BLOB_PATH} fill={blobColor} />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex: -1,
  },
});
