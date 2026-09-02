/**
 * EdgeFocusOverlay — Vignette de bordes para el "modo enfoque" (Fase 9.C)
 *
 * Dos franjas SVG (izq/der) con gradiente (oscuro en el borde → transparente al
 * centro) que aparecen cuando hay enfoque activo (`useFocusStore`). Señala que el
 * swipe está bloqueado y la atención está en la pantalla actual.
 *
 * Performance: SVG estático (gradiente lineal), solo se anima la OPACIDAD con
 * Reanimated → no re-blurea el mesh de fondo. `pointerEvents="none"` para no
 * interceptar toques.
 */
import React, { useEffect } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming, Easing } from 'react-native-reanimated';
import Svg, { Defs, LinearGradient, Stop, Rect } from 'react-native-svg';
import { useFocusStore, selectSwipeLocked } from '../stores/useFocusStore';
import { useTheme } from '../hooks/useTheme';

export const EdgeFocusOverlay: React.FC = () => {
  const { width, height } = useWindowDimensions();
  const { isDark } = useTheme();
  const locked = useFocusStore(selectSwipeLocked);

  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.set(withTiming(locked ? 1 : 0, { duration: 320, easing: Easing.out(Easing.quad) }));
  }, [locked, opacity]);

  const style = useAnimatedStyle(() => ({ opacity: opacity.get() }));

  // Ancho de cada franja: ~10% del ancho, acotado.
  const stripW = Math.max(44, Math.min(96, width * 0.1));

  // Color del borde — oscuro para dar profundidad; sutil en light.
  const edge = isDark ? 'rgba(0,0,0,0.40)' : 'rgba(0,0,0,0.20)';

  return (
    <Animated.View style={[StyleSheet.absoluteFill, style]} pointerEvents="none">
      {/* Borde izquierdo */}
      <Svg width={stripW} height={height} style={styles.left}>
        <Defs>
          <LinearGradient id="edgeL" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%"   stopColor={edge} stopOpacity={1} />
            <Stop offset="55%"  stopColor={edge} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={edge} stopOpacity={0} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={stripW} height={height} fill="url(#edgeL)" />
      </Svg>

      {/* Borde derecho (gradiente espejado) */}
      <Svg width={stripW} height={height} style={styles.right}>
        <Defs>
          <LinearGradient id="edgeR" x1="0" y1="0" x2="1" y2="0">
            <Stop offset="0%"   stopColor={edge} stopOpacity={0} />
            <Stop offset="45%"  stopColor={edge} stopOpacity={0.35} />
            <Stop offset="100%" stopColor={edge} stopOpacity={1} />
          </LinearGradient>
        </Defs>
        <Rect x={0} y={0} width={stripW} height={height} fill="url(#edgeR)" />
      </Svg>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  left:  { position: 'absolute', left: 0, top: 0 },
  right: { position: 'absolute', right: 0, top: 0 },
});
