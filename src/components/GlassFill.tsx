/**
 * GlassFill — Capas glass absolutas (blur + fill), SIN children ni borde.
 *
 * A diferencia de GlassCard (contenedor con children), GlassFill se inserta como
 * <StyleSheet.absoluteFill> dentro de un parent que ya gestiona su propio layout,
 * borde, sombra y contenido (TouchableOpacity, Reanimated.View, etc.).
 * El parent DEBE tener overflow:'hidden' + el borderRadius correspondiente.
 *
 * Reemplaza el antiguo `GlassLayers` inline de HomeScreen. Lee del mismo sistema
 * de tiers que GlassCard vía resolveGlass() — sin magic numbers de blur (UI.A.10).
 */
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { resolveGlass, type GlassTier } from '../theme';

interface GlassFillProps {
  isDark: boolean;
  /** Tier base. Default: 'frost' (header / mic / YT pill) */
  tier?: GlassTier;
  /** Override del alpha del fill. dark→blanco, light→negro (preserva canal del tier frost) */
  fillAlpha?: number;
  /** Override de la intensidad del blur */
  blurIntensity?: number;
}

// Android <12: expo-blur cae a fill sólido; dimezisBlurView habilita blur real.
const ANDROID_BLUR_METHOD = Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

export const GlassFill: React.FC<GlassFillProps> = ({
  isDark,
  tier = 'frost',
  fillAlpha,
  blurIntensity,
}) => {
  const g = resolveGlass(tier, isDark);

  const intensity = blurIntensity ?? g.blur;
  const fill = fillAlpha != null
    ? (isDark ? `rgba(255,255,255,${fillAlpha})` : `rgba(0,0,0,${fillAlpha})`)
    : g.fill;

  return (
    <>
      {/* Blur de fondo — efecto humo/glass */}
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod={ANDROID_BLUR_METHOD}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Fill semi-transparente sobre el blur (sostiene legibilidad sin blur real) */}
      <View
        style={[StyleSheet.absoluteFill, { backgroundColor: fill }]}
        pointerEvents="none"
      />
    </>
  );
};
