/**
 * ElasticSVG — membrana líquida en el borde de cada página del carousel
 *
 * Ahora vive DENTRO del page-wrapper de HorizontalNav (no a nivel global),
 * de modo que se mueve con la propia pantalla al hacer swipe.
 *
 * Técnica: el SVG es 2× el ancho de la pantalla y se posiciona desplazado
 * para que pueda extenderse hacia afuera del borde de la página sin ser
 * clippeado por el propio SVG. El contenedor de HorizontalNav (overflow:hidden)
 * actúa como clip final en los bordes del viewport.
 *
 *   side='left'  → SVG en left: -width, el borde de la página está en SVG-local x=width
 *                  La deformación va hacia la IZQUIERDA (cx = width - pullX)
 *   side='right' → SVG en left: 0,      el borde de la página está en SVG-local x=width
 *                  La deformación va hacia la DERECHA  (cx = width + pullX)
 *
 * Path fill:   M width 0  Q cx touchY  width height  Z
 * Path stroke: M width 0  Q cx touchY  width height    (misma curva, sin Z)
 *
 * Spec: crafting/ELASTIC_UI.md
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

  // El SVG tiene 2× el ancho de la pantalla.
  // En ambos casos, SVG-local x=width coincide con el BORDE de la página:
  //   left  → SVG.left = -width  → borde izquierdo de la página en SVG x=width
  //   right → SVG.left =  0      → borde derecho de la página en SVG x=width
  const svgLeft = side === 'left' ? -width : 0;

  // ── Fill: área deformada que "jala" el borde hacia afuera ────────────────────
  const fillProps = useAnimatedProps(() => {
    const x  = Math.max(0, pullX.get());
    const y  = touchY.get();
    const cx = side === 'left' ? width - x : width + x;
    return { d: `M ${width} 0 Q ${cx} ${y} ${width} ${height} Z` };
  });

  // ── Stroke: solo la curva del borde — edge glow visual ───────────────────────
  const strokeProps = useAnimatedProps(() => {
    const x  = Math.max(0, pullX.get());
    const y  = touchY.get();
    const cx = side === 'left' ? width - x : width + x;
    return { d: `M ${width} 0 Q ${cx} ${y} ${width} ${height}` };
  });

  return (
    <Svg
      width={width * 2}
      height={height}
      style={{ position: 'absolute', top: 0, left: svgLeft }}
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
