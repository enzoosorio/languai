/**
 * ElasticSVG — membrana líquida en el borde de pantalla
 *
 * Dibuja un path Quadratic Bezier que deforma el borde lateral mientras
 * el usuario arrastra.  El punto de control (pullX, touchY) sigue el dedo;
 * cuando el gesto termina, pullX hace spring back a 0 y la membrana
 * colapsa de vuelta al borde.
 *
 * Spec: crafting/ELASTIC_UI.md
 *   side='left'  →  M 0 0 Q pullX touchY 0 height
 *   side='right' →  M W 0 Q W−pullX touchY W height
 */
import React from 'react';
import { useWindowDimensions } from 'react-native';
import Animated, { useAnimatedProps } from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import Svg, { Path } from 'react-native-svg';

// AnimatedPath — path SVG con props manejados por Reanimated en el UI thread
const AnimatedPath = Animated.createAnimatedComponent(Path);

interface ElasticSVGProps {
  side:    'left' | 'right';
  /** Cuánto dp se ha estirado la membrana en la dirección perpendicular */
  pullX:   SharedValue<number>;
  /** Posición Y del dedo — controla dónde se acumula la deformación */
  touchY:  SharedValue<number>;
  isDark:  boolean;
}

export function ElasticSVG({ side, pullX, touchY, isDark }: ElasticSVGProps) {
  const { width, height } = useWindowDimensions();

  const fillColor   = isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)';
  const strokeColor = isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';

  // ── Fill: triángulo bezier que "empuja" desde el borde ───────────────────────
  const fillProps = useAnimatedProps(() => {
    const x = Math.max(0, pullX.get());
    const y = touchY.get();
    const d = side === 'left'
      ? `M 0 0 Q ${x} ${y} 0 ${height} Z`
      : `M ${width} 0 Q ${width - x} ${y} ${width} ${height} Z`;
    return { d };
  });

  // ── Stroke: sólo la curva (sin las líneas del borde) — edge glow visual ──────
  const strokeProps = useAnimatedProps(() => {
    const x = Math.max(0, pullX.get());
    const y = touchY.get();
    const d = side === 'left'
      ? `M 0 0 Q ${x} ${y} 0 ${height}`
      : `M ${width} 0 Q ${width - x} ${y} ${width} ${height}`;
    return { d };
  });

  return (
    <Svg
      width={width}
      height={height}
      style={{ position: 'absolute', top: 0, left: 0 }}
      pointerEvents="none"
    >
      {/* Glass fill — area deformada */}
      <AnimatedPath
        animatedProps={fillProps}
        fill={fillColor}
      />
      {/* Edge glow — línea del borde deformado */}
      <AnimatedPath
        animatedProps={strokeProps}
        stroke={strokeColor}
        strokeWidth={1.5}
        fill="none"
      />
    </Svg>
  );
}
