/**
 * HorizontalNav — reemplaza PagerView con navegación elástica nativa
 *
 * Tres pantallas montadas side-by-side [Roleplay | Home | SRS].
 * El track se mueve con translateX; las membranas ElasticSVG deforman
 * los bordes mientras el dedo arrastra.
 *
 * Física:
 *  - Spring snap (damping 25, stiffness 250)
 *  - Rubber-band 15% en los extremos
 *  - Umbral de commit: 38% de ancho o velocidad > 800 dp/s
 *  - Hápticos: light al iniciar, medium al pasar el umbral
 *
 * Spec: crafting/ELASTIC_UI.md
 */
import React, {
  forwardRef,
  useImperativeHandle,
  Children,
} from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { ElasticSVG } from './ElasticSVG';

// ── Tipos ──────────────────────────────────────────────────────────────────────
export interface HorizontalNavRef {
  goToPage: (index: number) => void;
}

interface HorizontalNavProps {
  children: React.ReactNode;
  /** Página inicial (0-based). Default: 1 (Home) */
  initialPage?: number;
}

// ── Constantes ─────────────────────────────────────────────────────────────────
const SPRING_CONFIG = { damping: 25, stiffness: 250, mass: 1.0 };
const SNAP_THRESHOLD      = 0.38;   // 38% de ancho para commit
const VELOCITY_THRESHOLD  = 800;    // dp/s
const RUBBER_BAND_FACTOR  = 0.15;   // amortiguación en los bordes
const ACTIVE_OFFSET_X     = 15;     // px antes de activar el pan gesture

// ── Hápticos (JS thread — llamados con runOnJS) ────────────────────────────────
function hapticLight()  { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);  }
function hapticMedium() { Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium); }

// ── Componente ─────────────────────────────────────────────────────────────────
export const HorizontalNav = forwardRef<HorizontalNavRef, HorizontalNavProps>(
  function HorizontalNav({ children, initialPage = 1 }, ref) {
    const { width, height } = useWindowDimensions();
    const { isDark } = useTheme();

    const pages     = Children.toArray(children);
    // Número de páginas como primitivo — los worklets de Gesture Handler
    // capturan variables del closure; arrays de React elements NO son
    // serializables al UI thread y causarían "Exception in HostFunction".
    const pageCount = pages.length;   // ← número puro, seguro en worklets

    // ── Shared values ──────────────────────────────────────────────────────────
    const currentPage = useSharedValue(initialPage);
    const baseOffset  = useSharedValue(-(initialPage * width));   // offset del snap actual
    const offsetX     = useSharedValue(-(initialPage * width));   // offset animado del track
    const translationX = useSharedValue(0);                       // delta desde baseOffset
    const touchY       = useSharedValue(height * 0.5);            // Y del dedo para el bezier
    const pastThreshold = useSharedValue(false);

    // Cuánto estirar cada membrana (siempre ≥ 0)
    const leftPullX  = useDerivedValue(() => Math.max(0,  translationX.get()));
    const rightPullX = useDerivedValue(() => Math.max(0, -translationX.get()));

    // ── Gesto pan ──────────────────────────────────────────────────────────────
    const gesture = Gesture.Pan()
      .activeOffsetX([-ACTIVE_OFFSET_X, ACTIVE_OFFSET_X])
      .onBegin((e) => {
        'worklet';
        touchY.set(e.absoluteY);
        pastThreshold.set(false);
      })
      .onStart(() => {
        'worklet';
        runOnJS(hapticLight)();
      })
      .onUpdate((e) => {
        'worklet';
        const raw       = baseOffset.get() + e.translationX;
        const maxBound  = 0;
        const minBound  = -((pageCount - 1) * width);

        // Rubber-band en los extremos
        let clamped: number;
        if (raw > maxBound) {
          clamped = maxBound + (raw - maxBound) * RUBBER_BAND_FACTOR;
        } else if (raw < minBound) {
          clamped = minBound + (raw - minBound) * RUBBER_BAND_FACTOR;
        } else {
          clamped = raw;
        }

        offsetX.set(clamped);
        translationX.set(clamped - baseOffset.get());
        touchY.set(e.absoluteY);

        // Háptico al cruzar el umbral de commit
        if (Math.abs(clamped - baseOffset.get()) > width * SNAP_THRESHOLD && !pastThreshold.get()) {
          pastThreshold.set(true);
          runOnJS(hapticMedium)();
        }
      })
      .onEnd((e) => {
        'worklet';
        const cp    = currentPage.get();
        const delta = offsetX.get() - baseOffset.get();
        let targetPage = cp;

        if (e.velocityX < -VELOCITY_THRESHOLD || delta < -(width * SNAP_THRESHOLD)) {
          targetPage = Math.min(pageCount - 1, cp + 1);
        } else if (e.velocityX > VELOCITY_THRESHOLD || delta > width * SNAP_THRESHOLD) {
          targetPage = Math.max(0, cp - 1);
        }

        const targetOffset = -(targetPage * width);
        currentPage.set(targetPage);
        baseOffset.set(targetOffset);

        offsetX.set(withSpring(targetOffset, { ...SPRING_CONFIG, velocity: e.velocityX }));
        translationX.set(withSpring(0, SPRING_CONFIG));
      });

    // ── Estilo animado del track ───────────────────────────────────────────────
    const trackStyle = useAnimatedStyle(() => ({
      transform: [{ translateX: offsetX.get() }],
    }));

    // ── API imperativa para navegación programática ────────────────────────────
    useImperativeHandle(ref, () => ({
      goToPage: (index: number) => {
        const targetOffset = -(index * width);
        currentPage.set(index);
        baseOffset.set(targetOffset);
        offsetX.set(withSpring(targetOffset, SPRING_CONFIG));
        translationX.set(withSpring(0, SPRING_CONFIG));
      },
    }));

    // ── Render ─────────────────────────────────────────────────────────────────
    return (
      <GestureDetector gesture={gesture}>
        <View style={styles.container}>

          {/* Track — las N pantallas montadas en fila */}
          <Animated.View
            style={[
              { width: width * pages.length, height: '100%', flexDirection: 'row' },
              trackStyle,
            ]}
          >
            {pages.map((child, i) => (
              <View key={i} style={{ width, height: '100%' }}>
                {child}
                {/* Membranas elásticas — dentro de cada página, se mueven con ella */}
                <View pointerEvents="none" style={StyleSheet.absoluteFill}>
                  <ElasticSVG side="left"  pullX={leftPullX}  touchY={touchY} isDark={isDark} />
                  <ElasticSVG side="right" pullX={rightPullX} touchY={touchY} isDark={isDark} />
                </View>
              </View>
            ))}
          </Animated.View>

        </View>
      </GestureDetector>
    );
  },
);

const styles = StyleSheet.create({
  container: {
    flex:             1,
    overflow:         'hidden',
    backgroundColor:  'transparent',
  },
});
