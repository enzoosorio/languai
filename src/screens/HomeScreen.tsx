import React, { useEffect, useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Pressable,
  Linking,
  Animated,
  Easing,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../hooks/useTheme';

interface Props {
  onNavigateRoleplay: () => void;
  onNavigateSRS: () => void;
  onToggleTheme: () => void;
}

export const HomeScreen: React.FC<Props> = ({
  onNavigateRoleplay,
  onNavigateSRS,
  onToggleTheme,
}) => {
  const { isDark, colors } = useTheme();

  const mountOpacity = useRef(new Animated.Value(0)).current;
  const mountTranslateY = useRef(new Animated.Value(24)).current;
  const breathScale = useRef(new Animated.Value(1)).current;
  const sonarScale = useRef(new Animated.Value(0.6)).current;
  const sonarOpacity = useRef(new Animated.Value(0.5)).current;
  const micPressScale = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    // Mount fade-in
    Animated.parallel([
      Animated.timing(mountOpacity, {
        toValue: 1,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(mountTranslateY, {
        toValue: 0,
        duration: 700,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();

    // Breathing mic
    Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, {
          toValue: 1.08,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(breathScale, {
          toValue: 1.0,
          duration: 900,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ]),
    ).start();

    // Sonar ring scale
    Animated.loop(
      Animated.timing(sonarScale, {
        toValue: 2.2,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ).start();

    // Sonar ring opacity
    Animated.loop(
      Animated.sequence([
        Animated.timing(sonarOpacity, {
          toValue: 0.4,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(sonarOpacity, {
          toValue: 0,
          duration: 1900,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }),
      ]),
    ).start();
  }, []);

  const handleMicPressIn = () => {
    Animated.spring(micPressScale, {
      toValue: 0.91,
      useNativeDriver: true,
      speed: 20,
      bounciness: 4,
    }).start();
  };

  const handleMicPressOut = () => {
    Animated.spring(micPressScale, {
      toValue: 1.0,
      useNativeDriver: true,
      speed: 20,
      bounciness: 8,
    }).start();
  };

  const micScale = Animated.multiply(breathScale, micPressScale);

  return (
    <Animated.View
      style={[
        styles.container,
        { backgroundColor: colors.background },
        { opacity: mountOpacity, transform: [{ translateY: mountTranslateY }] },
      ]}
    >
      {/* Header */}
      <View style={styles.header}>
        <View style={[styles.streakPill, { backgroundColor: colors.surface }]}>
          <Text style={styles.streakText}>🔥 3</Text>
        </View>

        <TouchableOpacity
          style={[styles.langPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={onToggleTheme}
        >
          <Text style={[styles.langText, { color: colors.text }]}>EN</Text>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} style={{ marginLeft: 3 }} />
        </TouchableOpacity>
      </View>

      {/* Center */}
      <View style={styles.center}>
        {/* Sonar ring */}
        <Animated.View
          pointerEvents="none"
          style={[
            styles.sonarRing,
            { borderColor: colors.primary },
            { transform: [{ scale: sonarScale }], opacity: sonarOpacity },
          ]}
        />

        {/* Mic button */}
        <Animated.View style={{ transform: [{ scale: micScale }] }}>
          <Pressable
            onPressIn={handleMicPressIn}
            onPressOut={handleMicPressOut}
            style={[styles.micButton, { backgroundColor: colors.primary }]}
          >
            <Ionicons name="mic" size={42} color="#fff" />
          </Pressable>
        </Animated.View>

        <Text style={[styles.hint, { color: colors.textMuted }]}>Tap to speak</Text>
      </View>

      {/* Edge fallback buttons */}
      <TouchableOpacity
        style={[styles.edgeBtn, styles.edgeBtnLeft, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={onNavigateRoleplay}
        activeOpacity={0.75}
      >
        <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
      </TouchableOpacity>

      <TouchableOpacity
        style={[styles.edgeBtn, styles.edgeBtnRight, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={onNavigateSRS}
        activeOpacity={0.75}
      >
        <Ionicons name="library-outline" size={22} color={colors.text} />
      </TouchableOpacity>

      {/* YouTube pill */}
      <TouchableOpacity
        style={[styles.ytPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
        onPress={() => Linking.openURL('https://www.youtube.com')}
        activeOpacity={0.8}
      >
        <Ionicons name="logo-youtube" size={16} color="#FF0000" />
        <Text style={[styles.ytText, { color: colors.textMuted }]}>Watch & learn</Text>
      </TouchableOpacity>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  header: {
    position: 'absolute',
    top: 20,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  streakPill: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
  },
  streakText: {
    fontSize: 14,
    fontWeight: '600',
  },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  langText: {
    fontSize: 14,
    fontWeight: '600',
  },
  center: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  sonarRing: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
  },
  micButton: {
    width: 100,
    height: 100,
    borderRadius: 50,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3B82F6',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.45,
    shadowRadius: 16,
    elevation: 12,
  },
  hint: {
    marginTop: 20,
    fontSize: 14,
    letterSpacing: 0.3,
  },
  edgeBtn: {
    position: 'absolute',
    top: '50%',
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    marginTop: -24,
  },
  edgeBtnLeft: {
    left: 16,
  },
  edgeBtnRight: {
    right: 16,
  },
  ytPill: {
    position: 'absolute',
    bottom: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 24,
    borderWidth: 1,
  },
  ytText: {
    fontSize: 13,
    fontWeight: '500',
  },
});
