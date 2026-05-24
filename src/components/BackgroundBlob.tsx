/**
 * BackgroundBlob — Orb ambiental animado
 * Color: rgba(233,235,214, 0.30) dark / rgba(233,235,214, 0.80) light
 * Animación: Reanimated v4 — breathe loop + XY drift + SVG Gaussian blur
 * Ver: crafting/DESIGN_SYSTEM.md § 6
 */
import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import Svg, { Path, Defs, Filter, FeGaussianBlur } from 'react-native-svg';
import { useTheme } from '../hooks/useTheme';
import { blob as blobConfig } from '../theme';

// Forma orgánica cerrada — squircle suave
const BLOB_PATH =
  'M 200,40 ' +
  'C 290,30 370,90 385,175 ' +
  'C 400,260 355,340 270,360 ' +
  'C 210,375 145,365 95,335 ' +
  'C 40,302 10,240 20,170 ' +
  'C 30,95 110,50 200,40 Z';

interface BackgroundBlobProps {
  /** Sobreescribe el color del blob (por defecto usa theme) */
  color?: string;
  /** Posición vertical (0 = top, 1 = bottom). Default: 0.55 */
  yPosition?: number;
}

export function BackgroundBlob({ color, yPosition = 0.55 }: BackgroundBlobProps) {
  const { width, height } = useWindowDimensions();
  const { colors } = useTheme();
  const blobColor = color ?? colors.blob;

  // ── Shared values ────────────────────────────────────────────────────────────
  const breathe = useSharedValue(0);
  const driftX  = useSharedValue(0);
  const driftY  = useSharedValue(0);

  useEffect(() => {
    // Breathe: scale 1.0 → blobConfig.scaleTo → 1.0, loop
    breathe.set(withRepeat(
      withSequence(
        withTiming(1, { duration: blobConfig.durationMs, easing: Easing.inOut(Easing.sin) }),
        withTiming(0, { duration: blobConfig.durationMs, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    ));

    // X drift — wanders ±20 dp over asymmetric intervals (~43 s full cycle)
    driftX.set(withRepeat(
      withSequence(
        withTiming( 18, { duration:  7200, easing: Easing.inOut(Easing.quad) }),
        withTiming(-14, { duration:  9400, easing: Easing.inOut(Easing.quad) }),
        withTiming(  5, { duration:  8100, easing: Easing.inOut(Easing.quad) }),
        withTiming(-20, { duration: 10500, easing: Easing.inOut(Easing.quad) }),
        withTiming(  0, { duration:  7800, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    ));

    // Y drift — independent timing (~47 s full cycle)
    driftY.set(withRepeat(
      withSequence(
        withTiming(-16, { duration:  9000, easing: Easing.inOut(Easing.quad) }),
        withTiming( 12, { duration: 11000, easing: Easing.inOut(Easing.quad) }),
        withTiming( -8, { duration:  8500, easing: Easing.inOut(Easing.quad) }),
        withTiming( 20, { duration: 10200, easing: Easing.inOut(Easing.quad) }),
        withTiming(  0, { duration:  9000, easing: Easing.inOut(Easing.quad) }),
      ),
      -1,
      false,
    ));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const blobSize   = width * blobConfig.sizeFactor;
  const blobHeight = blobSize * 0.9;
  const top        = height * yPosition - blobHeight / 2;
  const left       = (width - blobSize) / 2;

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: driftX.get() },
      { translateY: driftY.get() },
      { scale: 1 + breathe.get() * (blobConfig.scaleTo - 1) },
    ],
    opacity: 0.85 + breathe.get() * 0.15,
  }));

  return (
    <Animated.View
      style={[
        styles.container,
        { width: blobSize, height: blobHeight, top, left },
        animStyle,
      ]}
      pointerEvents="none"
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 400 360"
        preserveAspectRatio="xMidYMid meet"
      >
        <Defs>
          {/* Halo blur — simula el glow ambiental de Figma */}
          <Filter id="blob-blur" x="-25%" y="-25%" width="150%" height="150%">
            <FeGaussianBlur stdDeviation="20" />
          </Filter>
        </Defs>
        <Path d={BLOB_PATH} fill={blobColor} filter="url(#blob-blur)" />
      </Svg>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    zIndex:   -1,
  },
});
