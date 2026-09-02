/**
 * MeshBackground — Fondo ambiental GPU-compuesto (expo-mesh-gradient).
 *
 * Reemplaza a BackgroundBlob (eliminaba la costura rectangular del blur SVG) y a
 * las membranas ElasticSVG (ahora el fondo entero se inclina hacia el swipe).
 *
 * Montado UNA vez a nivel de App, detrás de toda la UI. Lee `swipeX`/`touchY`
 * (shared values normalizados que escribe HorizontalNav durante el gesto) para
 * deformar los vértices del mesh siguiendo el drag.
 *
 * Ver: crafting/DESIGN_SYSTEM.md § 6
 */
import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useSharedValue,
  useAnimatedProps,
  useReducedMotion,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import type { SharedValue } from 'react-native-reanimated';
import { MeshGradientView } from 'expo-mesh-gradient';
import { useTheme } from '../hooks/useTheme';
import { meshGradient } from '../theme';

const AnimatedMesh = Animated.createAnimatedComponent(MeshGradientView);

interface MeshBackgroundProps {
  /** Posición horizontal del swipe, normalizada ~[-1, 1] (translationX / width). */
  swipeX: SharedValue<number>;
  /** Posición vertical del dedo, normalizada [0, 1] (absoluteY / height). */
  touchY: SharedValue<number>;
}

export function MeshBackground({ swipeX, touchY }: MeshBackgroundProps) {
  const { isDark } = useTheme();
  const reduceMotion = useReducedMotion();

  // Drift ambiental — reloj lineal 0→1 que no revierte; en el worklet se convierte
  // en una órbita (sin/cos) para un movimiento orgánico y perceptible. Congelado
  // con reduce-motion (UI.A.20).
  const clock = useSharedValue(0);
  useEffect(() => {
    if (reduceMotion) {
      clock.set(0); // estático
      return;
    }
    clock.set(
      withRepeat(
        withTiming(1, {
          duration: meshGradient.driftDurationMs,
          easing: Easing.linear,
        }),
        -1,
        false,
      ),
    );
  }, [clock, reduceMotion]);

  // Construye los 9 puntos del mesh en el UI thread: grid base + órbita ambiental
  // + lean por swipe. El lean usa swipeX/touchY para inclinar centro y mid-edges
  // hacia el drag; como onEnd del carousel hace withSpring(0), vuelve a 0 solo.
  const animatedProps = useAnimatedProps(() => {
    const sx = swipeX.get();                       // ~[-1, 1]
    const ty = touchY.get();                       // [0, 1]

    // Órbita ambiental — x e y con frecuencias distintas → no se siente robótico.
    const t = clock.get() * 2 * Math.PI;
    const ambX = Math.sin(t)        * meshGradient.driftAmplitude;
    const ambY = Math.cos(t * 0.8)  * meshGradient.driftAmplitude;

    const lean = Math.max(-1, Math.min(1, sx)) * meshGradient.swipeLeanMax;
    // El dedo desplaza verticalmente el peso del lean (sutil).
    const leanY = (ty - 0.5) * meshGradient.swipeLeanMax * 0.5;

    // Clamp del offset del centro para que nunca cruce los mid-edges (evita que
    // el mesh se "pliegue" en un swipe fuerte combinado con el extremo de la órbita).
    const ax = Math.max(-0.42, Math.min(0.42, lean  + ambX));
    const ay = Math.max(-0.42, Math.min(0.42, leanY + ambY));

    const points: number[][] = [
      [0, 0],               [0.5 + ax * 0.5, 0],   [1, 0],
      [0, 0.5 + ay * 0.5],  [0.5 + ax, 0.5 + ay],  [1, 0.5 + ay * 0.5],
      [0, 1],               [0.5 + ax * 0.5, 1],   [1, 1],
    ];
    return { points };
  });

  const palette = isDark ? meshGradient.dark : meshGradient.light;

  return (
    <AnimatedMesh
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      columns={meshGradient.columns}
      rows={meshGradient.rows}
      colors={palette}
      smoothsColors
      animatedProps={animatedProps}
    />
  );
}
