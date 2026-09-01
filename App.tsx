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
import { BUILD_TAG } from './src/lib/buildInfo';
import { MeshBackground } from './src/components/MeshBackground';
import { HorizontalNav, HorizontalNavRef } from './src/components/HorizontalNav';
import { EdgeFocusOverlay } from './src/components/EdgeFocusOverlay';

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

// Shared values para la reacción del fondo mesh al swipe (escritos por HorizontalNav)
import { useSharedValue } from 'react-native-reanimated';

/** Techo duro para generate-feedback - sin esto SessionClosingScreen puede colgarse. */
const FEEDBACK_TIMEOUT_MS = 45000;
/** Techo para la carga de las 9 fuentes; pasado esto arrancamos con las del sistema. */
const FONTS_TIMEOUT_MS = 8000;

type FeedbackError = 'generic' | 'too_short' | 'processing';

const FEEDBACK_ALERTS: Record<FeedbackError, { title: string; body: string }> = {
  generic: {
    title: 'Feedback not available',
    body:  "We couldn't generate your session feedback. Your conversation was saved.",
  },
  too_short: {
    title: 'Session too short',
    body:  'We need a couple more exchanges to give you useful feedback. Your conversation was saved.',
  },
  processing: {
    title: 'Feedback still running',
    body:  'Your feedback is still being generated. Try again in a moment.',
  },
};

/** Rechaza si la promesa no resuelve a tiempo. Evita spinners eternos. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error('timeout after ' + ms + 'ms')), ms),
    ),
  ]);
}

// ── Contenido interno de la app ────────────────────────────────────────────────
// Separado de App para que SafeAreaProvider sea el raíz absoluto.
// Sin SafeAreaProvider, useSafeAreaInsets() devuelve 0 en todas las pantallas
// → Dynamic Island / botones de navegación del sistema se superponen a la UI.
function AppContent() {
  const navRef = useRef<HorizontalNavRef>(null);
  const { isDark, colors } = useTheme();
  const toggleTheme = useThemeStore((state) => state.toggleTheme);

  // Reacción del fondo mesh al swipe — HorizontalNav los escribe, MeshBackground los lee.
  const meshSwipeX = useSharedValue(0);
  const meshTouchY = useSharedValue(0.5);

  // Focus level del Home — controla el lock de swipe y la opacidad de las membranas
  const [focusLevel, setFocusLevel] = useState<0 | 1 | 2>(0);

  // SessionClosingScreen — overlay spinner mientras se genera el feedback
  const [isClosing, setIsClosing] = useState(false);
  // FeedbackScreen — reemplaza HorizontalNav cuando el feedback está listo
  const [feedbackSessionId, setFeedbackSessionId] = useState<string | null>(null);
  // ¿El feedback falló, y por qué? (5.3 — error UI básico)
  const [feedbackError, setFeedbackError] = useState<FeedbackError | null>(null);

  /**
   * Llamado por HomeScreen cuando la sesión termina normalmente.
   * Flujo: capturar session_id → endSession() → spinner → generate-feedback →
   *        si done: FeedbackScreen | si failed o muy corta: volver al Home.
   */
  const handleSessionClosing = async () => {
    // Capturar ANTES de que endSession() limpie el store
    const sessionId = useSessionStore.getState().sessionId;

    // persistTurn es fire-and-forget: si invocamos generate-feedback antes de
    // que lleguen los inserts, la función cuenta < 4 turnos y responde
    // `too_short` por una race, no porque la sesión fuera corta de verdad.
    await useSessionStore.getState().flushTurns();
    await useSessionStore.getState().endSession();

    if (!sessionId) return;

    // El umbral lo decide la Edge Function (>= 4 turnos). Antes el cliente
    // exigía turnIndex >= 6 y abortaba en silencio — indistinguible de un bug.
    setIsClosing(true);
    try {
      const { data, error } = await withTimeout(
        supabase.functions.invoke('generate-feedback', {
          body: { session_id: sessionId },
        }),
        FEEDBACK_TIMEOUT_MS,
      );

      setIsClosing(false);

      if (error || !data) {
        console.warn('[App] generate-feedback failed:', error?.message);
        setFeedbackError('generic');
        return;
      }

      if (data.feedback_status === 'failed') {
        console.warn('[App] feedback failed, reason:', data.reason);
        setFeedbackError(data.reason === 'too_short' ? 'too_short' : 'generic');
        return;
      }

      // 'processing' = otra ejecución lo tiene tomado (o quedó atascada).
      // Abrir FeedbackScreen aquí mostraría una pantalla vacía.
      if (data.feedback_status === 'processing') {
        setFeedbackError('processing');
        return;
      }

      setFeedbackSessionId(sessionId);
    } catch (err) {
      // Antes esto solo hacía console.warn → la app volvía al Home en silencio.
      console.warn('[App] generate-feedback error:', err);
      setIsClosing(false);
      setFeedbackError('generic');
    }
  };

  // 5.3 — Mostrar alert cuando el feedback falla, con el motivo concreto
  useEffect(() => {
    if (!feedbackError) return;
    const { title, body } = FEEDBACK_ALERTS[feedbackError];
    Alert.alert(title, body, [{ text: 'OK', onPress: () => setFeedbackError(null) }]);
  }, [feedbackError]);

  const { user, settings, isLoading, setUser, setLoading, clearUser, loadSettings } =
    useUserStore();

  // El segundo elemento del tuple es el ERROR. Descartarlo (como estaba antes)
  // hace que un fallo de carga deje `fontsLoaded` en false para siempre, sin
  // log — el spinner infinito del primer arranque.
  const [fontsLoaded, fontError] = useFonts({
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

  const [fontsTimedOut, setFontsTimedOut]   = useState(false);
  const [authTimedOut, setAuthTimedOut]     = useState(false);
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    if (!fontError) return;
    console.warn('[App] font load error — using system fonts:', fontError);
  }, [fontError]);

  useEffect(() => {
    if (fontsLoaded || fontError) return;
    // Las 9 .ttf se bajan del dev server de Metro en el primer arranque; en el
    // segundo ya están en la caché de assets de Expo Go. Si una cuelga, useFonts
    // no resuelve nunca — arrancamos igual con las fuentes del sistema.
    const t = setTimeout(() => {
      console.warn('[App] font load timeout — using system fonts');
      setFontsTimedOut(true);
    }, FONTS_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    let mounted = true;

    // Marcador de bundle — distingue "el fix no funciona" de "el fix no llegó".
    console.log('[boot] LanguAI bundle:', BUILD_TAG);

    // Fallback duro: nunca quedarse en el spinner para siempre. Si getSession()
    // cuelga (lectura de SecureStore en arranque en frío), igual renderizamos.
    const safety = setTimeout(() => {
      if (mounted) {
        console.warn('[App] auth init timeout — forcing render');
        setAuthTimedOut(true);
        setLoading(false);
      }
    }, 6000);

    // Restaurar sesión al montar — try/catch/finally garantiza setLoading(false).
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (mounted && session?.user) {
          setUser(session.user);
          await loadSettings();
        }
      } catch (err) {
        console.warn('[App] auth init error:', err);
      } finally {
        if (mounted) {
          clearTimeout(safety);
          setSessionChecked(true);
          setLoading(false);
        }
      }
    })();

    // Escuchar cambios de auth (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        // INITIAL_SESSION ya lo cubre el getSession() de arriba — sin este
        // guard se disparan dos loadSettings() concurrentes en el arranque.
        if (event === 'INITIAL_SESSION') return;

        // Supabase desaconseja llamar a sus propias APIs (y sobre todo hacer
        // await) dentro de este callback: corre dentro del lock de GoTrue y
        // serializa el refresh de token detrás de una query de red sin timeout.
        setTimeout(() => {
          if (!mounted) return;
          if (session?.user) {
            setUser(session.user);
            loadSettings().catch((err) =>
              console.warn('[App] loadSettings error:', err));
          } else {
            clearUser();
          }
        }, 0);
      }
    );

    return () => {
      mounted = false;
      clearTimeout(safety);
      subscription.unsubscribe();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goToPage = (pageIndex: number) => {
    navRef.current?.goToPage(pageIndex);
  };

  // Las fuentes ya no pueden bloquear el arranque: cargadas, fallidas o
  // agotado el plazo, en los tres casos seguimos adelante.
  const fontsSettled = fontsLoaded || !!fontError || fontsTimedOut;
  const authSettled  = sessionChecked || authTimedOut;
  const isReady      = fontsSettled && authSettled && !isLoading;

  // ── Contenido condicional en un solo return ─────────────────────────────────
  let inner: React.ReactNode;

  if (!isReady) {
    inner = <ActivityIndicator color={colors.accent} style={StyleSheet.absoluteFill} />;
  } else if (!user) {
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <LoginScreen />
      </>
    );
  } else if (!settings?.onboarding_completed) {
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
        <OnboardingScreen />
      </>
    );
  } else if (feedbackSessionId) {
    // ── Feedback screen — reemplaza toda la UI de navegación ──────────────
    inner = (
      <>
        <StatusBar barStyle={isDark ? 'light-content' : 'dark-content'} />
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

        {/* HorizontalNav — 3 páginas [Roleplay | Home | SRS], arranca en Home (1) */}
        <HorizontalNav
          ref={navRef}
          initialPage={1}
          focusLevel={focusLevel}
          meshSwipeX={meshSwipeX}
          meshTouchY={meshTouchY}
        >
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
        {/* Fondo mesh — montado una vez, detrás de toda la UI */}
        <MeshBackground swipeX={meshSwipeX} touchY={meshTouchY} />

        {inner}

        {/* Vignette de bordes — modo enfoque (SRS/conversación). pointerEvents none. */}
        <EdgeFocusOverlay />

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
