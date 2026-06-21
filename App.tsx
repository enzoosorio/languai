import React, { useRef, useEffect, useState } from 'react';
import { StyleSheet, StatusBar, ActivityIndicator, Alert } from 'react-native';
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
import { SessionClosingScreen } from './src/screens/SessionClosingScreen';
import { FeedbackScreen } from './src/screens/FeedbackScreen';

// Onboarding placeholder hasta que se construya Chunk B
import { OnboardingScreen } from './src/screens/OnboardingScreen';

// Zustand store (para endSession en handleSessionClosing)
import { useSessionStore } from './src/stores/useSessionStore';

// ── Contenido interno de la app ────────────────────────────────────────────────
// Separado de App para que SafeAreaProvider sea el raíz absoluto.
// Sin SafeAreaProvider, useSafeAreaInsets() devuelve 0 en todas las pantallas
// → Dynamic Island / botones de navegación del sistema se superponen a la UI.
function AppContent() {
  const navRef = useRef<HorizontalNavRef>(null);
  const { isDark, colors } = useTheme();
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  // Focus level del Home — controla el lock de swipe y la opacidad de las membranas
  const [focusLevel, setFocusLevel] = useState<0 | 1 | 2>(0);

  // SessionClosingScreen — overlay spinner mientras se genera el feedback
  const [isClosing, setIsClosing] = useState(false);
  // FeedbackScreen — reemplaza HorizontalNav cuando el feedback está listo
  const [feedbackSessionId, setFeedbackSessionId] = useState<string | null>(null);
  // ¿El feedback falló? (5.3 — error UI básico)
  const [feedbackFailed, setFeedbackFailed] = useState(false);

  /**
   * Llamado por HomeScreen cuando la sesión termina normalmente.
   * Flujo: capturar session_id → endSession() → spinner → generate-feedback →
   *        si done: FeedbackScreen | si failed o muy corta: volver al Home.
   */
  const handleSessionClosing = async () => {
    // Capturar ANTES de que endSession() limpie el store
    const sessionId  = useSessionStore.getState().sessionId;
    const turnIndex  = useSessionStore.getState().turnIndex;

    await useSessionStore.getState().endSession();

    // Menos de 6 turnos (3 intercambios) → demasiado corto para feedback
    if (!sessionId || turnIndex < 6) return;

    setIsClosing(true);
    try {
      const { data, error } = await supabase.functions.invoke('generate-feedback', {
        body: { session_id: sessionId },
      });

      setIsClosing(false);

      if (error || !data || data.feedback_status === 'failed') {
        // 5.3 — mostrar aviso y volver al home
        setFeedbackFailed(true);
        return;
      }

      setFeedbackSessionId(sessionId);
    } catch (err) {
      console.warn('[App] generate-feedback error:', err);
      setIsClosing(false);
    }
  };

  // 5.3 — Mostrar alert cuando el feedback falla
  useEffect(() => {
    if (!feedbackFailed) return;
    Alert.alert(
      'Feedback not available',
      "We couldn't generate your session feedback. Your conversation was saved.",
      [{ text: 'OK', onPress: () => setFeedbackFailed(false) }],
    );
  }, [feedbackFailed]);

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
  } else if (feedbackSessionId) {
    // ── Feedback screen — reemplaza toda la UI de navegación ──────────────
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />
        <FeedbackScreen
          sessionId={feedbackSessionId}
          onClose={() => {
            setFeedbackSessionId(null);
            setFocusLevel(0);
          }}
        />
      </>
    );
  } else {
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <BackgroundBlob />

        {/* HorizontalNav — 3 páginas [Roleplay | Home | SRS], arranca en Home (1) */}
        <HorizontalNav ref={navRef} initialPage={1} focusLevel={focusLevel}>
          <RoleplayScreen onNavigateHome={() => goToPage(1)} />
          <HomeScreen
            onNavigateRoleplay={() => goToPage(0)}
            onNavigateSRS={() => goToPage(2)}
            onToggleTheme={toggleTheme}
            onFocusChange={setFocusLevel}
            onSessionClosing={handleSessionClosing}
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

        {/* SessionClosingScreen — overlay full-screen, se monta sobre todo */}
        <SessionClosingScreen
          visible={isClosing}
          onClose={() => setIsClosing(false)}
        />
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
