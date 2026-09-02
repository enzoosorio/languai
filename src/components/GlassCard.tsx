/**
 * GlassCard — Componente glass universal (contenedor con children)
 * Tiers: 'ghost' | 'soft' | 'medium' | 'strong' | 'frost'
 * Lee blur/fill/border desde resolveGlass() — fuente única de verdad (UI.A.10).
 * Ver: crafting/DESIGN_SYSTEM.md § 4
 */
import React from 'react';
import { View, ViewProps, StyleSheet, Platform } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import { resolveGlass, glassElevation, radius, type GlassTier } from '../theme';

interface GlassCardProps extends ViewProps {
  /** Tier de glass. Default: 'soft' */
  tier?: GlassTier;
  /** Radio de borde. Default: radius.card (32) */
  borderRadius?: number;
  /** Sin padding interno (para contenedores que gestionan su propio padding) */
  noPadding?: boolean;
  /** Ocultar borde glass */
  noBorder?: boolean;
  /** "el efecto" liquid glass — drop shadow + highlight superior 3D (UI.A.11) */
  elevated?: boolean;
}

// En Android <12 expo-blur cae a fill sólido; dimezisBlurView habilita blur real.
// Si el blur no rinde, el fill del tier es el que sostiene la legibilidad (UI.A.14).
const ANDROID_BLUR_METHOD = Platform.OS === 'android' ? 'dimezisBlurView' : undefined;

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  tier = 'soft',
  borderRadius: br = radius.card,
  noPadding = false,
  noBorder = false,
  elevated = false,
  ...props
}) => {
  const { isDark } = useTheme();
  const g    = resolveGlass(tier, isDark);
  const elev = isDark ? glassElevation.dark : glassElevation.light;

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius: br,
          borderWidth: noBorder ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: g.border,
          backgroundColor: g.fill,
        },
        elevated && {
          shadowColor:   elev.shadowColor,
          shadowOffset:  elev.shadowOffset,
          shadowOpacity: elev.shadowOpacity,
          shadowRadius:  elev.shadowRadius,
          elevation:     elev.elevation,
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={g.blur}
        tint={isDark ? 'dark' : 'light'}
        experimentalBlurMethod={ANDROID_BLUR_METHOD}
        style={[StyleSheet.absoluteFill, { borderRadius: br }]}
        pointerEvents="none"
      />
      {/* Highlight superior — simula el inset blanco del liquid glass de Figma */}
      {elevated && (
        <View
          style={[
            styles.topHighlight,
            { borderRadius: br, borderColor: elev.topHighlight },
          ]}
          pointerEvents="none"
        />
      )}
      <View style={noPadding ? null : styles.content}>
        {children}
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
  },
  content: {
    flex: 1,
    padding: 20,
  },
  // Borde claro solo arriba: RN no permite border-side de color distinto sin
  // romper overflow:hidden, así que usamos un borde completo tenue + top fuerte.
  topHighlight: {
    ...StyleSheet.absoluteFillObject,
    borderTopWidth: StyleSheet.hairlineWidth * 2,
  },
});
