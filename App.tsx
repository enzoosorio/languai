import React, { useRef, useEffect } from 'react';
import { StyleSheet, StatusBar, ActivityIndicator } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useFonts } from 'expo-font';
import {
  DarkerGrotesque_400Regular,
  DarkerGrotesque_500Medium,
  DarkerGrotesque_600SemiBold,
  DarkerGrotesque_700Bold,
} from '@expo-google-fonts/darker-grotesque';
import { SafeAreaView, SafeAreaProvider } from 'react-native-safe-area-context';
import {
  PlusJakartaSans_200ExtraLight,
  PlusJakartaSans_400Regular,
  PlusJakartaSans_600SemiBold,
} from '@expo-google-fonts/plus-jakarta-sans';
// Bricolage Grotesque — body text canónico (DESIGN_SYSTEM.md § 3)
import {
  BricolageGrotesque_300Light,
  BricolageGrotesque_400Regular,
} from '@expo-google-fonts/bricolage-grotesque';

import { useTheme } from './src/hooks/useTheme';
import { useThemeStore } from './src/stores/themeStore';
import { useUserStore } from './src/stores/useUserStore';
import { supabase } from './src/lib/supabase';
import { BackgroundBlob } from './src/components/BackgroundBlob';
import { HorizontalNav, HorizontalNavRef } from './src/components/HorizontalNav';

import { LoginScreen } from './src/screens/LoginScreen';
import { HomeScreen } from './src/screens/HomeScreen';
import { RoleplayScreen } from './src/screens/RoleplayScreen';
import { SRSScreen } from './src/screens/SRSScreen';

// Onboarding placeholder hasta que se construya Chunk B
import { OnboardingScreen } from './src/screens/OnboardingScreen';

// ── Contenido interno de la app ────────────────────────────────────────────────
// Separado de App para que SafeAreaProvider sea el raíz absoluto.
// Sin SafeAreaProvider, useSafeAreaInsets() devuelve 0 en todas las pantallas
// → Dynamic Island / botones de navegación del sistema se superponen a la UI.
function AppContent() {
  const navRef = useRef<HorizontalNavRef>(null);
  const { isDark, colors } = useTheme();
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  const { user, settings, isLoading, setUser, setLoading, clearUser, loadSettings } =
    useUserStore();

  const [fontsLoaded] = useFonts({
    // Darker Grotesque — nav, captions
    DarkerGrotesque_400Regular,
    DarkerGrotesque_500Medium,
    DarkerGrotesque_600SemiBold,
    DarkerGrotesque_700Bold,
    // Plus Jakarta Sans — display, logo
    PlusJakartaSans_200ExtraLight,
    PlusJakartaSans_400Regular,
    PlusJakartaSans_600SemiBold,
    // Bricolage Grotesque — body, fine (DESIGN_SYSTEM.md § 3)
    BricolageGrotesque_300Light,
    BricolageGrotesque_400Regular,
  });

  useEffect(() => {
    // Restaurar sesión al montar
    supabase.auth.getSession().then(async ({ data: { session } }) => {
      if (session?.user) {
        setUser(session.user);
        await loadSettings();
      }
      setLoading(false);
    });

    // Escuchar cambios de auth (login / logout / token refresh)
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
    navRef.current?.goToPage(pageIndex);
  };

  const isReady = fontsLoaded && !isLoading;

  // ── Contenido condicional en un solo return ─────────────────────────────────
  let inner: React.ReactNode;

  if (!isReady) {
    inner = <ActivityIndicator color={colors.accent} style={StyleSheet.absoluteFill} />;
  } else if (!user) {
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />
        <LoginScreen />
      </>
    );
  } else if (!settings?.onboarding_completed) {
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />
        <OnboardingScreen />
      </>
    );
  } else {
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />

        {/* HorizontalNav — 3 páginas [Roleplay | Home | SRS], arranca en Home (1) */}
        <HorizontalNav ref={navRef} initialPage={1}>
          <RoleplayScreen onNavigateHome={() => goToPage(1)} />
          <HomeScreen
            onNavigateRoleplay={() => goToPage(0)}
            onNavigateSRS={() => goToPage(2)}
            onToggleTheme={toggleTheme}
          />
          <SRSScreen onNavigateHome={() => goToPage(1)} />
        </HorizontalNav>
      </>
    );
  }

  return (
    <GestureHandlerRootView style={styles.rootView}>
      <SafeAreaView style={[styles.safeArea, { backgroundColor: colors.background }]}>
        {inner}
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

// ── Raíz de la app ─────────────────────────────────────────────────────────────
// SafeAreaProvider DEBE envolver todo para que useSafeAreaInsets() funcione.
export default function App() {
  return (
    <SafeAreaProvider>
      <AppContent />
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  rootView: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
});
