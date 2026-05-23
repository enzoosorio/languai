import React, { useRef, useEffect } from 'react';
import { StyleSheet, View, StatusBar, ActivityIndicator } from 'react-native';
import PagerView from 'react-native-pager-view';
import { useFonts } from 'expo-font';
import {
  DarkerGrotesque_400Regular,
  DarkerGrotesque_500Medium,
  DarkerGrotesque_600SemiBold,
  DarkerGrotesque_700Bold,
} from '@expo-google-fonts/darker-grotesque';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  PlusJakartaSans_200ExtraLight,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
} from '@expo-google-fonts/plus-jakarta-sans';

import { useTheme } from './src/hooks/useTheme';
import { useThemeStore } from './src/stores/themeStore';
import { useUserStore } from './src/stores/useUserStore';
import { supabase } from './src/lib/supabase';
import { BackgroundBlob } from './src/components/BackgroundBlob';

import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RoleplayScreen } from './src/screens/RoleplayScreen';
import { SRSScreen } from './src/screens/SRSScreen';

// Onboarding placeholder until Chunk B is built
import { OnboardingScreen } from './src/screens/OnboardingScreen';

export default function App() {
  const pagerRef = useRef<PagerView>(null);
  const { isDark, colors } = useTheme();
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const { user, settings, isLoading, setUser, setLoading, clearUser, loadSettings } =
    useUserStore();

  const [fontsLoaded] = useFonts({
    DarkerGrotesque_400Regular,
    DarkerGrotesque_500Medium,
    DarkerGrotesque_600SemiBold,
    DarkerGrotesque_700Bold,
    PlusJakartaSans_200ExtraLight,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
  });

  useEffect(() => {
    // Restore session on mount
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await loadSettings();
      }
      setLoading(false);
    });

    // Listen for auth state changes (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        if (session?.user) {
          setUser(session.user);
          await loadSettings();
        } else {
          clearUser();
        }
      }
    );

    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToPage = (pageIndex: number) => {
    pagerRef.current?.setPage(pageIndex);
  };

  const isReady = fontsLoaded && !isLoading;

  if (!isReady) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <ActivityIndicator color={colors.accent} style={StyleSheet.absoluteFill} />
      </SafeAreaView>
    );
  }

  if (!user) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />
        <LoginScreen />
      </SafeAreaView>
    );
  }

  if (!settings?.onboarding_completed) {
    return (
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />
        <OnboardingScreen />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
      <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
      <BackgroundBlob />

      <PagerView style={styles.pagerView} initialPage={1} ref={pagerRef}>
        <View key="0" style={styles.page}>
          <RoleplayScreen onNavigateHome={() => goToPage(1)} />
        </View>
        <View key="1" style={styles.page}>
          <HomeScreen
            onNavigateRoleplay={() => goToPage(0)}
            onNavigateSRS={() => goToPage(2)}
            onToggleTheme={toggleTheme}
          />
        </View>
        <View key="2" style={styles.page}>
          <SRSScreen onNavigateHome={() => goToPage(1)} />
        </View>
      </PagerView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  pagerView: {
    flex: 1,
  },
  page: {
    flex: 1,
  },
});
