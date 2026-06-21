/**
 * SessionClosingScreen — Task 3.7.7
 *
 * Full-screen modal shown while feedback is being generated.
 * Current behaviour (mock): después de 8 s muestra "View partial summary".
 * Fase 5 lo reemplazará con la llamada real a generate-feedback + FeedbackScreen.
 */
import React, { useEffect, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';

interface Props {
  visible:  boolean;
  onClose:  () => void;
}

const TIMEOUT_MS = 8_000;

export function SessionClosingScreen({ visible, onClose }: Props) {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();

  const [showFallback, setShowFallback] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Skeleton pulse animation
  const pulse = useRef(new Animated.Value(0.4)).current;

  useEffect(() => {
    if (!visible) {
      setShowFallback(false);
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    // Start 8s timeout — after it, show "View partial summary" fallback
    timerRef.current = setTimeout(() => setShowFallback(true), TIMEOUT_MS);

    // Loop skeleton pulse
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 800, useNativeDriver: true }),
      ]),
    ).start();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [visible]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={() => {/* prevent back-button dismiss */}}
    >
      <BlurView
        intensity={isDark ? 60 : 50}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
      />

      {/* Glass card */}
      <View
        style={[
          styles.card,
          {
            backgroundColor: isDark
              ? 'rgba(255,255,255,0.06)'
              : 'rgba(0,0,0,0.05)',
            borderColor: isDark
              ? 'rgba(255,255,255,0.12)'
              : 'rgba(0,0,0,0.10)',
            marginTop: insets.top + 40,
            marginBottom: insets.bottom + 40,
          },
        ]}
      >
        {/* Header */}
        <ActivityIndicator
          size="large"
          color={colors.accent}
          style={{ marginBottom: 16 }}
        />
        <Text style={[styles.title, { color: colors.text }]}>
          Wrapping up your conversation…
        </Text>
        <Text style={[styles.subtitle, { color: colors.textMuted }]}>
          Generating your feedback summary
        </Text>

        {/* Skeleton boxes */}
        <View style={styles.skeletons}>
          {[72, 100, 88].map((w, i) => (
            <Animated.View
              key={i}
              style={[
                styles.skeletonLine,
                {
                  width: `${w}%`,
                  backgroundColor: isDark
                    ? 'rgba(255,255,255,0.10)'
                    : 'rgba(0,0,0,0.08)',
                  opacity: pulse,
                },
              ]}
            />
          ))}
        </View>

        {/* Fallback button — appears after 8 s */}
        {showFallback && (
          <TouchableOpacity
            style={[
              styles.fallbackBtn,
              {
                borderColor: colors.accent,
                backgroundColor: colors.accent + '18',
              },
            ]}
            onPress={onClose}
          >
            <Text style={[styles.fallbackText, { color: colors.accent }]}>
              View partial summary
            </Text>
          </TouchableOpacity>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    marginHorizontal: 24,
    borderRadius: 24,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
    paddingVertical: 40,
  },
  title: {
    fontFamily: 'BricolageGrotesque_400Regular',
    fontSize: 20,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    fontFamily: 'BricolageGrotesque_300Light',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 32,
  },
  skeletons: {
    width: '100%',
    gap: 10,
    alignItems: 'flex-start',
  },
  skeletonLine: {
    height: 14,
    borderRadius: 7,
  },
  fallbackBtn: {
    marginTop: 36,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 99,
    borderWidth: 1,
  },
  fallbackText: {
    fontFamily: 'DarkerGrotesque_600SemiBold',
    fontSize: 15,
  },
});
