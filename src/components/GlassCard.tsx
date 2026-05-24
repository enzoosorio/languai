/**
 * GlassCard — Componente glass universal
 * Soporta 3 tiers: 'ghost' | 'soft' | 'strong'
 * Ver: crafting/DESIGN_SYSTEM.md § 4
 */
import React from 'react';
import { View, ViewProps, StyleSheet } from 'react-native';
import { BlurView } from 'expo-blur';
import { useTheme } from '../hooks/useTheme';
import { glass, radius } from '../theme';

interface GlassCardProps extends ViewProps {
  /** Tier de glass. Default: 'soft' */
  tier?: 'ghost' | 'soft' | 'strong';
  /** Radio de borde. Default: radius.card (32) */
  borderRadius?: number;
  /** Sin padding interno (para contenedores que gestionan su propio padding) */
  noPadding?: boolean;
  /** Ocultar borde glass */
  noBorder?: boolean;
}

export const GlassCard: React.FC<GlassCardProps> = ({
  children,
  style,
  tier = 'soft',
  borderRadius: br = radius.card,
  noPadding = false,
  noBorder = false,
  ...props
}) => {
  const { isDark } = useTheme();
  const config = glass[tier];

  // En dark mode el blur de BlurView necesita más intensidad para ser visible
  // ghost=8, soft=20, strong=40 son los valores calibrados para iOS
  const blurIntensity = isDark
    ? { ghost: 8, soft: 20, strong: 40 }[tier]
    : { ghost: 6, soft: 16, strong: 32 }[tier];

  return (
    <View
      style={[
        styles.container,
        {
          borderRadius: br,
          borderWidth: noBorder ? 0 : StyleSheet.hairlineWidth * 2,
          borderColor: config.border,
          backgroundColor: config.fill,
        },
        style,
      ]}
      {...props}
    >
      <BlurView
        intensity={blurIntensity}
        tint={isDark ? 'dark' : 'light'}
        style={[StyleSheet.absoluteFill, { borderRadius: br }]}
        pointerEvents="none"
      />
      <View style={[noPadding ? null : styles.content]}>
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
});
