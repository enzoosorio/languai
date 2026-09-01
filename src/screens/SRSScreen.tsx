/**
 * SRSScreen — Fase 9 (9.3 · 9.4) + Fase 9.B (flashback · tracking · TTS cache)
 *
 * Repaso espaciado de `tracked_items` con SM-2 (src/lib/srs.ts).
 * Dos tabs: "Phrasal Verbs" (SRS real) y "Shadow Reading" (placeholder, Fase 9.5).
 *
 * Flujo: intro (deck overview + Start + guía) → cards. Cada card:
 *   front "You said" (text) → Reveal → "Natural form" (lemma) + 🔊 TTS (cacheado) +
 *   explicación → 4 botones Again/Hard/Good/Easy → nextReview → persiste.
 *
 * 9.B:
 *  - Flashback: botón historial → modal con la síntesis + ventana de la conversación
 *    (6 turnos base) + load-more paginado (↑/↓) + tamaño de batch configurable.
 *  - Tracking: srs_sessions (Start/End) + srs_reviews (por card, con flags TTS/historial).
 *  - TTS cache: speakCached + prefetch look-ahead (card actual + siguientes 2).
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  Animated,
  Easing,
  useWindowDimensions,
} from 'react-native';
import * as Haptics from 'expo-haptics';
import { Audio } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { GlassCard } from '../components/GlassCard';
import { supabase } from '../lib/supabase';
import { useUserStore } from '../stores/useUserStore';
import { speakCached } from '../services/tts';
import { nextReview, isDue, type SrsState, type SrsGrade } from '../lib/srs';
import type { Json } from '../types/database';
import {
  resolveTargetTurn,
  fetchSessionMeta,
  fetchMaxIdx,
  fetchTurnWindow,
  baseWindow,
  type ContextTurn,
  type SessionMeta,
} from '../services/srsContext';
import { startSrsSession, recordReview, endSrsSession } from '../services/srsSession';
import { useFocusStore } from '../stores/useFocusStore';

const DECK_CAP = 15;   // máximo de cards por sesión de repaso

interface FlashbackData {
  sessionId: string;
  meta:      SessionMeta | null;
  turns:     ContextTurn[];
  targetIdx: number;
  span:      [number, number] | null;
  maxIdx:    number;
  range:     { lo: number; hi: number };
}

// ── Tipos ───────────────────────────────────────────────────────────────────
interface TrackedItem {
  id:                  string;
  text:                string;   // forma que dijo el usuario (a corregir)
  lemma:               string;   // forma canónica / correcta
  severity:            'error' | 'warning' | 'improvement';
  category:            string;
  explanation:         string;
  weight:              number;
  srs_state:           SrsState | null;
  last_seen_session:   string | null;
  first_seen_session:  string | null;
}

interface Props {
  onNavigateHome: () => void;
}

type Tab = 'srs' | 'shadow';

const FB_BATCH_MIN = 4;
const FB_BATCH_MAX = 40;
const FB_FULL_CAP  = 60;   // ≤ esto → "Load full conversation" en una query

// ── Componente ──────────────────────────────────────────────────────────────
export const SRSScreen: React.FC<Props> = ({ onNavigateHome }) => {
  const { colors, isDark } = useTheme();
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const user = useUserStore((s) => s.user);

  const [tab,       setTab]       = useState<Tab>('srs');
  const [loading,   setLoading]   = useState(true);
  const [queue,     setQueue]     = useState<TrackedItem[]>([]);
  const [index,     setIndex]     = useState(0);
  const [revealed,  setRevealed]  = useState(false);
  const [grading,   setGrading]   = useState(false);
  const [started,   setStarted]   = useState(false);   // intro vs deck
  const [showGuide, setShowGuide] = useState(false);
  const [speaking,  setSpeaking]  = useState(false);

  // ── Tracking (Fase 9.B.2) ──────────────────────────────────────────────────
  const srsSessionIdRef = useRef<string | null>(null);
  const endedRef        = useRef(false);
  const usedTtsRef      = useRef(false);   // flags de la card ACTUAL
  const usedHistoryRef  = useRef(false);

  // ── Prefetch TTS (Fase 9.B.5) ──────────────────────────────────────────────
  const prefetchedRef = useRef<Set<string>>(new Set());

  // ── Flashback (Fase 9.B.3) ─────────────────────────────────────────────────
  const [showFlashback, setShowFlashback] = useState(false);
  const [fbLoading,     setFbLoading]     = useState(false);
  const [fbLoadingMore, setFbLoadingMore] = useState(false);
  const [fbUnavailable, setFbUnavailable] = useState(false);
  const [fbSessionId,   setFbSessionId]   = useState<string | null>(null);
  const [fbMeta,        setFbMeta]        = useState<SessionMeta | null>(null);
  const [fbTurns,       setFbTurns]       = useState<ContextTurn[]>([]);
  const [fbTargetIdx,   setFbTargetIdx]   = useState<number | null>(null);
  const [fbSpan,        setFbSpan]        = useState<[number, number] | null>(null);
  const [fbRange,       setFbRange]       = useState<{ lo: number; hi: number }>({ lo: 0, hi: 0 });
  const [fbMaxIdx,      setFbMaxIdx]      = useState(0);
  const [fbBatch,       setFbBatch]       = useState(8);

  // Animación de transición entre cards
  const cardOpacity = useRef(new Animated.Value(1)).current;
  const cardTransY  = useRef(new Animated.Value(0)).current;
  // Escala de la vista en modo enfoque — deja margen para el vignette de bordes
  const viewScale   = useRef(new Animated.Value(1)).current;

  // Audio (TTS)
  const soundRef = useRef<Audio.Sound | null>(null);
  const audioModeSetRef = useRef(false);

  // Cache de flashback por item (se limpia al cerrar la sesión de repaso)
  const fbCacheRef = useRef<Map<string, FlashbackData>>(new Map());

  // ── Cerrar la mini-sesión de tracking (idempotente) ───────────────────────
  const finishSrsSession = useCallback(() => {
    useFocusStore.getState().release('srs');     // desbloquea swipe + apaga vignette
    fbCacheRef.current.clear();                   // invalida cache de flashback
    const id = srsSessionIdRef.current;
    if (id && !endedRef.current) {
      endedRef.current = true;
      endSrsSession(id);
    }
  }, []);

  // ── Prefetch de audio: card actual + siguientes 2 ──────────────────────────
  const prefetchFrom = useCallback((items: TrackedItem[], startIdx: number) => {
    for (let i = startIdx; i <= startIdx + 2 && i < items.length; i++) {
      const lemma = items[i]?.lemma;
      if (!lemma) continue;
      const key = `en_${lemma}`;
      if (prefetchedRef.current.has(key)) continue;
      prefetchedRef.current.add(key);
      speakCached(lemma, 'en').catch(() => prefetchedRef.current.delete(key));
    }
  }, []);

  // ── Fetch del mazo (items no archivados que están due) ─────────────────────
  const fetchQueue = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data } = await supabase
        .from('tracked_items')
        .select('id, text, lemma, severity, category, explanation, weight, srs_state, last_seen_session, first_seen_session')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('weight', { ascending: false });

      const items = (data ?? []) as TrackedItem[];
      // Cap del mazo + descarte de items basura (ej. text "U" de 1 char).
      const due = items
        .filter((it) => it.text && it.text.trim().length >= 2)
        .filter((it) => isDue(it.srs_state))
        .slice(0, DECK_CAP);
      setQueue(due);
      setIndex(0);
      setRevealed(false);
      setStarted(false);   // siempre arrancamos en la intro
    } catch (err) {
      console.warn('[SRSScreen] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (tab === 'srs') fetchQueue();
  }, [tab, fetchQueue]);

  // Prefetch look-ahead cuando cambia la card
  useEffect(() => {
    if (started && tab === 'srs' && queue.length) prefetchFrom(queue, index);
  }, [index, started, tab, queue, prefetchFrom]);

  // Cierre de la mini-sesión cuando se completa el mazo
  useEffect(() => {
    if (started && queue.length > 0 && index >= queue.length) finishSrsSession();
  }, [started, index, queue.length, finishSrsSession]);

  // Escala 0.92 cuando hay enfoque (Start) → el vignette no choca con la card/tabs/botones
  useEffect(() => {
    Animated.timing(viewScale, {
      toValue:  started ? 0.92 : 1,
      duration: 280,
      easing:   Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [started, viewScale]);

  // Cleanup al desmontar: audio + cerrar sesión abierta
  useEffect(() => {
    return () => {
      soundRef.current?.unloadAsync().catch(() => {});
      finishSrsSession();
    };
  }, [finishSrsSession]);

  // ── Start: abre mini-sesión de tracking ────────────────────────────────────
  const handleStart = async () => {
    Haptics.selectionAsync();
    endedRef.current = false;
    usedTtsRef.current = false;
    usedHistoryRef.current = false;
    fbCacheRef.current.clear();
    useFocusStore.getState().acquire('srs');   // bloquea swipe + enciende vignette
    setStarted(true);
    prefetchFrom(queue, 0);
    if (user) {
      srsSessionIdRef.current = await startSrsSession(user.id);
    }
  };

  // End session explícito desde la vista de cards
  const handleEndSession = () => {
    Haptics.selectionAsync();
    finishSrsSession();
    fetchQueue();   // refresca el due list y vuelve a la intro
  };

  // ── TTS: reproducir la forma correcta (cacheada) ───────────────────────────
  const handleSpeak = async (text: string) => {
    if (speaking) return;
    setSpeaking(true);
    usedTtsRef.current = true;
    Haptics.selectionAsync();
    try {
      // Sin esto, en iOS con el switch de silencio el audio NO suena (el SRS nunca
      // graba, a diferencia de Home, así que el audio mode nunca se configuraba).
      if (!audioModeSetRef.current) {
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
        audioModeSetRef.current = true;
      }
      const uri = await speakCached(text, 'en');
      console.log('[SRSScreen] tts play uri:', uri);
      await soundRef.current?.unloadAsync().catch(() => {});
      const { sound } = await Audio.Sound.createAsync({ uri }, { shouldPlay: true });
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((st) => {
        if (st.isLoaded && st.didJustFinish) setSpeaking(false);
        if (!st.isLoaded && st.error) {
          console.warn('[SRSScreen] playback error:', st.error);
          setSpeaking(false);
        }
      });
    } catch (err) {
      console.warn('[SRSScreen] tts error:', err);
      setSpeaking(false);
    }
  };

  // ── Avanzar a la siguiente card con animación ──────────────────────────────
  const advance = useCallback(() => {
    Animated.parallel([
      Animated.timing(cardOpacity, { toValue: 0, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
      Animated.timing(cardTransY,  { toValue: -16, duration: 130, easing: Easing.in(Easing.quad), useNativeDriver: true }),
    ]).start(() => {
      setRevealed(false);
      setIndex((i) => i + 1);
      cardTransY.setValue(16);
      Animated.parallel([
        Animated.timing(cardOpacity, { toValue: 1, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(cardTransY,  { toValue: 0, duration: 200, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    });
  }, [cardOpacity, cardTransY]);

  // ── Calificar la card actual ───────────────────────────────────────────────
  const handleGrade = async (grade: SrsGrade) => {
    const item = queue[index];
    if (!item || grading) return;
    setGrading(true);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    const before = item.srs_state;
    const after  = nextReview(before, grade);

    try {
      await supabase
        .from('tracked_items')
        .update({ srs_state: after as unknown as Json })
        .eq('id', item.id);
    } catch (err) {
      console.warn('[SRSScreen] grade error:', err);
    }

    // Log del review (fire-and-forget)
    if (srsSessionIdRef.current) {
      recordReview({
        srsSessionId:  srsSessionIdRef.current,
        trackedItemId: item.id,
        grade,
        usedTts:       usedTtsRef.current,
        usedHistory:   usedHistoryRef.current,
        stateBefore:   before,
        stateAfter:    after,
      });
    }

    // Reset de flags por card
    usedTtsRef.current = false;
    usedHistoryRef.current = false;

    setGrading(false);
    advance();
  };

  const handleReveal = () => {
    Haptics.selectionAsync();
    setRevealed(true);
  };

  const handleBack = () => {
    finishSrsSession();
    onNavigateHome();
  };

  const handleTabChange = (t: Tab) => {
    if (t !== 'srs' && started) finishSrsSession();
    setTab(t);
  };

  // ── Flashback: abrir ───────────────────────────────────────────────────────
  const openFlashback = async () => {
    const item = queue[index];
    if (!item) return;
    usedHistoryRef.current = true;
    Haptics.selectionAsync();

    setShowFlashback(true);
    setFbUnavailable(false);

    // Cache hit → mostrar sin tocar la DB
    const cached = fbCacheRef.current.get(item.id);
    if (cached) {
      setFbSessionId(cached.sessionId);
      setFbMeta(cached.meta);
      setFbTurns(cached.turns);
      setFbTargetIdx(cached.targetIdx);
      setFbSpan(cached.span);
      setFbMaxIdx(cached.maxIdx);
      setFbRange(cached.range);
      setFbLoading(false);
      return;
    }

    setFbLoading(true);
    setFbTurns([]); setFbMeta(null); setFbTargetIdx(null); setFbSpan(null); setFbSessionId(null);

    try {
      const target = await resolveTargetTurn({
        id:                 item.id,
        text:               item.text,
        last_seen_session:  item.last_seen_session,
        first_seen_session: item.first_seen_session,
      });
      if (!target) { setFbUnavailable(true); return; }

      const maxIdx = await fetchMaxIdx(target.sessionId);
      const { lo, hi } = baseWindow(target.idx, maxIdx);
      const [meta, turns] = await Promise.all([
        fetchSessionMeta(target.sessionId),
        fetchTurnWindow(target.sessionId, lo, hi),
      ]);

      setFbSessionId(target.sessionId);
      setFbMaxIdx(maxIdx);
      setFbTargetIdx(target.idx);
      setFbSpan(target.span);
      setFbRange({ lo, hi });
      setFbMeta(meta);
      setFbTurns(turns);

      fbCacheRef.current.set(item.id, {
        sessionId: target.sessionId, meta, turns, targetIdx: target.idx,
        span: target.span, maxIdx, range: { lo, hi },
      });
    } catch (err) {
      console.warn('[SRSScreen] flashback error:', err);
      setFbUnavailable(true);
    } finally {
      setFbLoading(false);
    }
  };

  // ── Flashback: cargar más turnos (paginado) ────────────────────────────────
  const loadMore = async (dir: 'up' | 'down') => {
    if (!fbSessionId || fbLoadingMore) return;
    setFbLoadingMore(true);
    try {
      if (dir === 'up') {
        const newLo = Math.max(0, fbRange.lo - fbBatch);
        const batch = await fetchTurnWindow(fbSessionId, newLo, fbRange.lo - 1);
        setFbTurns((prev) => [...batch, ...prev]);
        setFbRange((r) => ({ ...r, lo: newLo }));
      } else {
        const newHi = Math.min(fbMaxIdx, fbRange.hi + fbBatch);
        const batch = await fetchTurnWindow(fbSessionId, fbRange.hi + 1, newHi);
        setFbTurns((prev) => [...prev, ...batch]);
        setFbRange((r) => ({ ...r, hi: newHi }));
      }
    } catch (err) {
      console.warn('[SRSScreen] loadMore error:', err);
    } finally {
      setFbLoadingMore(false);
    }
  };

  const loadFull = async () => {
    if (!fbSessionId || fbLoadingMore) return;
    setFbLoadingMore(true);
    try {
      const turns = await fetchTurnWindow(fbSessionId, 0, fbMaxIdx);
      setFbTurns(turns);
      setFbRange({ lo: 0, hi: fbMaxIdx });
    } finally {
      setFbLoadingMore(false);
    }
  };

  // Color de texto secundario con contraste suficiente (≥3:1) sobre glass
  const textSoft = isDark ? 'rgba(240,237,230,0.78)' : 'rgba(26,26,24,0.70)';

  // ── Tabs ───────────────────────────────────────────────────────────────────
  const renderTabs = () => (
    <View style={[styles.tabBar, { borderColor: colors.borderSubtle }]}>
      {(['srs', 'shadow'] as Tab[]).map((t) => {
        const active = tab === t;
        return (
          <TouchableOpacity
            key={t}
            style={[
              styles.tab,
              active && { backgroundColor: colors.accent + '22', borderColor: colors.accent + '55' },
            ]}
            onPress={() => handleTabChange(t)}
            activeOpacity={0.7}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[styles.tabText, { color: active ? colors.accent : colors.textMuted }]}>
              {t === 'srs' ? 'Phrasal Verbs' : 'Shadow Reading'}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );

  // ── Intro / Start screen ───────────────────────────────────────────────────
  const renderIntro = () => {
    const n = queue.length;
    return (
      <View style={styles.centerFill}>
        <Ionicons name={n > 0 ? 'albums-outline' : 'sparkles-outline'} size={52} color={colors.accent} />
        <Text style={[styles.introTitle, { color: colors.text }]}>
          {n > 0 ? 'Spaced review' : "You're all caught up"}
        </Text>
        <Text style={[styles.introSub, { color: textSoft }]}>
          {n > 0
            ? `${n} ${n === 1 ? 'card is' : 'cards are'} due. See the natural form, practice it aloud, and rate how well you know it.`
            : 'No cards due for review right now. Keep having conversations to grow your deck.'}
        </Text>

        {n > 0 && (
          <TouchableOpacity
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}
            onPress={handleStart}
            activeOpacity={0.85}
          >
            <Text style={styles.primaryBtnText}>Start review</Text>
          </TouchableOpacity>
        )}

        <TouchableOpacity style={styles.ghostBtn} onPress={() => setShowGuide(true)} activeOpacity={0.7}>
          <Ionicons name="help-circle-outline" size={16} color={colors.textMuted} />
          <Text style={[styles.ghostBtnText, { color: colors.textMuted }]}>How it works</Text>
        </TouchableOpacity>
      </View>
    );
  };

  // ── Deck (cards) ───────────────────────────────────────────────────────────
  const renderDeck = () => {
    if (index >= queue.length) {
      return (
        <View style={styles.centerFill}>
          <Ionicons name="checkmark-done-circle-outline" size={56} color={colors.accent} />
          <Text style={[styles.introTitle, { color: colors.text }]}>Session complete</Text>
          <Text style={[styles.introSub, { color: textSoft }]}>
            You reviewed {queue.length} {queue.length === 1 ? 'card' : 'cards'}. Nicely done.
          </Text>
          <TouchableOpacity
            style={[styles.outlineBtn, { borderColor: colors.border }]}
            onPress={fetchQueue}
            activeOpacity={0.7}
          >
            <Text style={[styles.outlineBtnText, { color: colors.text }]}>Back to start</Text>
          </TouchableOpacity>
        </View>
      );
    }

    const item     = queue[index];
    const sevColor = item.severity === 'error' ? colors.feedbackError
                   : item.severity === 'warning' ? colors.feedbackWarning
                   : colors.feedbackInfo;

    return (
      <View style={styles.srsBody}>
        <View style={styles.deckTopRow}>
          <Text style={[styles.progressText, { color: colors.textMuted }]}>
            {index + 1} / {queue.length}
          </Text>
          <TouchableOpacity
            style={[styles.endBtn, { borderColor: colors.borderSubtle }]}
            onPress={handleEndSession}
            activeOpacity={0.7}
            accessibilityLabel="End review session"
          >
            <Ionicons name="close" size={13} color={colors.textMuted} />
            <Text style={[styles.endBtnText, { color: colors.textMuted }]}>End session</Text>
          </TouchableOpacity>
        </View>

        <Animated.View style={[styles.cardWrap, { opacity: cardOpacity, transform: [{ translateY: cardTransY }] }]}>
          <GlassCard tier="frost" elevated noPadding style={styles.card}>
            <ScrollView contentContainerStyle={styles.cardContent} showsVerticalScrollIndicator={false}>
              {/* Header: categoría + botón flashback */}
              <View style={styles.cardHeader}>
                <View style={styles.cardHeaderLeft}>
                  <View style={[styles.sevDot, { backgroundColor: sevColor }]} />
                  <Text style={[styles.categoryText, { color: colors.textMuted }]}>{item.category}</Text>
                </View>
                <TouchableOpacity
                  onPress={openFlashback}
                  hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}
                  activeOpacity={0.7}
                  accessibilityLabel="See where you said this"
                >
                  <Ionicons name="time-outline" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {/* Tu forma (de-enfatizada) */}
              <Text style={[styles.promptLabel, { color: colors.textMuted }]}>You said</Text>
              <Text style={[styles.errorText, { color: textSoft }]}>{item.text}</Text>

              {/* Forma natural (protagonista) + audio */}
              <View style={styles.backBox}>
                <Text style={[styles.promptLabel, { color: colors.textMuted }]}>Natural form</Text>
                <View style={styles.lemmaRow}>
                  <Text style={[styles.lemmaText, { color: colors.accent }]}>{item.lemma}</Text>
                  <TouchableOpacity
                    style={[styles.speakBtn, { borderColor: colors.border, backgroundColor: colors.accent + '14' }]}
                    onPress={() => handleSpeak(item.lemma)}
                    disabled={speaking}
                    activeOpacity={0.7}
                    accessibilityLabel="Hear the natural form"
                  >
                    {speaking
                      ? <ActivityIndicator size="small" color={colors.accent} />
                      : <Ionicons name="volume-high" size={18} color={colors.accent} />}
                  </TouchableOpacity>
                </View>
                <Text style={[styles.explanationText, { color: textSoft }]}>{item.explanation}</Text>
              </View>
            </ScrollView>
          </GlassCard>
        </Animated.View>

        {/* Footer */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12 }]}>
          {!revealed ? (
            <TouchableOpacity
              style={[styles.primaryBtn, { backgroundColor: colors.accent, width: '100%' }]}
              onPress={handleReveal}
              activeOpacity={0.85}
            >
              <Text style={styles.primaryBtnText}>Rate this card</Text>
            </TouchableOpacity>
          ) : (
            <>
              <Text style={[styles.gradePrompt, { color: colors.textMuted }]}>How well do you know it?</Text>
              <View style={styles.gradeRow}>
                {([
                  { grade: 'again', label: 'Again', sub: 'Forgot',   tint: colors.feedbackError },
                  { grade: 'hard',  label: 'Hard',  sub: '1–2 days', tint: colors.feedbackWarning },
                  { grade: 'good',  label: 'Good',  sub: 'On track', tint: colors.accent },
                  { grade: 'easy',  label: 'Easy',  sub: 'Knew it',  tint: colors.success },
                ] as Array<{ grade: SrsGrade; label: string; sub: string; tint: string }>).map((g) => (
                  <TouchableOpacity
                    key={g.grade}
                    style={[styles.gradeBtn, { borderColor: g.tint + '88', backgroundColor: g.tint + '1A' }]}
                    onPress={() => handleGrade(g.grade)}
                    disabled={grading}
                    activeOpacity={0.75}
                  >
                    <View style={[styles.gradeDot, { backgroundColor: g.tint }]} />
                    <Text style={[styles.gradeLabel, { color: colors.text }]}>{g.label}</Text>
                    <Text style={[styles.gradeSub, { color: colors.textMuted }]}>{g.sub}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>
      </View>
    );
  };

  // ── Shadow Reading (placeholder Fase 9.5) ──────────────────────────────────
  const renderShadow = () => (
    <View style={styles.centerFill}>
      <Ionicons name="mic-outline" size={52} color={colors.textMuted} />
      <Text style={[styles.introTitle, { color: colors.text }]}>Shadow Reading</Text>
      <Text style={[styles.introSub, { color: textSoft }]}>Listen-and-repeat practice is coming soon.</Text>
    </View>
  );

  // ── Flashback: render del texto del turno con span resaltado ───────────────
  const renderTurnBody = (turn: ContextTurn, isTarget: boolean) => {
    if (!isTarget || !fbSpan) {
      return <Text style={[styles.fbBubbleText, { color: isTarget ? colors.text : textSoft }]}>{turn.text}</Text>;
    }
    const [s, e] = fbSpan;
    const safeS = Math.max(0, Math.min(s, turn.text.length));
    const safeE = Math.max(safeS, Math.min(e, turn.text.length));
    return (
      <Text style={[styles.fbBubbleText, { color: colors.text }]}>
        {turn.text.slice(0, safeS)}
        <Text style={{ backgroundColor: colors.accent, color: '#F0EDE6', fontFamily: 'DarkerGrotesque_700Bold' }}>
          {' '}{turn.text.slice(safeS, safeE)}{' '}
        </Text>
        {turn.text.slice(safeE)}
      </Text>
    );
  };

  const fbDate = fbMeta?.started_at
    ? new Date(fbMeta.started_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    : '';
  const canLoadUp   = fbSessionId !== null && fbRange.lo > 0;
  const canLoadDown = fbSessionId !== null && fbRange.hi < fbMaxIdx;
  const canLoadFull = (canLoadUp || canLoadDown) && fbMaxIdx + 1 <= FB_FULL_CAP;

  // ── Render principal ───────────────────────────────────────────────────────
  return (
    <View style={[styles.container, { backgroundColor: colors.background, paddingTop: insets.top + 8 }]}>
      <Animated.View style={[styles.pageScale, { transform: [{ scale: viewScale }] }]}>
        {/* Header */}
        <View style={styles.header}>
          <TouchableOpacity
            onPress={started ? undefined : handleBack}
            disabled={started}
            style={[styles.iconBtn, started && { opacity: 0.3 }]}
            activeOpacity={0.7}
            accessibilityLabel="Back to home"
            accessibilityState={{ disabled: started }}
          >
            <Ionicons name="arrow-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={[styles.screenTitle, { color: colors.text }]}>Practice</Text>
          <TouchableOpacity onPress={() => setShowGuide(true)} style={styles.iconBtn} activeOpacity={0.7} accessibilityLabel="How it works">
            <Ionicons name="help-circle-outline" size={22} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {renderTabs()}

        {tab === 'shadow'
          ? renderShadow()
          : loading
            ? <View style={styles.centerFill}><ActivityIndicator size="large" color={colors.accent} /></View>
            : started
              ? renderDeck()
              : renderIntro()}
      </Animated.View>

      {/* ── Guide modal ──────────────────────────────────────────────────── */}
      {showGuide && (
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowGuide(false)} />
          <View style={{ width: '100%' }}>
            <GlassCard tier="strong" elevated noPadding>
              <View style={styles.guideInner}>
              <View style={styles.guideHeader}>
                <Text style={[styles.guideTitle, { color: colors.text }]}>How review works</Text>
                <TouchableOpacity onPress={() => setShowGuide(false)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {[
                { icon: 'book-outline',  title: 'Study', body: 'Each card shows a mistake from your past conversations next to the natural form. Tap 🔊 to hear it and practice saying it aloud.' },
                { icon: 'time-outline',  title: 'Context', body: 'Tap the clock icon to see exactly where you said it in the original conversation.' },
                { icon: 'timer-outline', title: 'Rate',   body: 'Again / Hard / Good / Easy — based on how well you knew it. Honest ratings schedule each card at the right moment: hard ones return sooner, easy ones later.' },
              ].map((step) => (
                <View key={step.title} style={styles.guideStep}>
                  <Ionicons name={step.icon as any} size={22} color={colors.accent} style={{ marginTop: 2 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.guideStepTitle, { color: colors.text }]}>{step.title}</Text>
                    <Text style={[styles.guideStepBody, { color: textSoft }]}>{step.body}</Text>
                  </View>
                </View>
              ))}

              <TouchableOpacity
                style={[styles.primaryBtn, { backgroundColor: colors.accent, marginTop: 6 }]}
                onPress={() => setShowGuide(false)}
                activeOpacity={0.85}
              >
                <Text style={styles.primaryBtnText}>Got it</Text>
              </TouchableOpacity>
              </View>
            </GlassCard>
          </View>
        </View>
      )}

      {/* ── Flashback modal ──────────────────────────────────────────────── */}
      {showFlashback && (
        <View style={styles.overlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowFlashback(false)} />
          <View style={styles.fbWrap}>
            <GlassCard tier="strong" elevated noPadding style={styles.fbCard}>
              {/* Header */}
              <View style={[styles.fbHeader, { borderBottomColor: colors.borderSubtle }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.fbTitle, { color: colors.text }]}>Where you said this</Text>
                  {!!fbDate && <Text style={[styles.fbDate, { color: colors.textMuted }]}>{fbDate}</Text>}
                </View>
                <TouchableOpacity onPress={() => setShowFlashback(false)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                  <Ionicons name="close" size={20} color={colors.textMuted} />
                </TouchableOpacity>
              </View>

              {fbLoading ? (
                <View style={styles.fbCenter}><ActivityIndicator color={colors.accent} /></View>
              ) : fbUnavailable ? (
                <View style={styles.fbCenter}>
                  <Ionicons name="cloud-offline-outline" size={36} color={colors.textMuted} />
                  <Text style={[styles.introSub, { color: textSoft, marginTop: 8 }]}>
                    Context unavailable for this item.
                  </Text>
                </View>
              ) : (
                <ScrollView
                  style={{ maxHeight: winH * 0.6 }}
                  contentContainerStyle={styles.fbScroll}
                  showsVerticalScrollIndicator
                >
                  {/* Síntesis */}
                  {!!fbMeta?.summary && (
                    <View style={[styles.fbSummaryBox, {
                      backgroundColor: isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
                      borderColor:     colors.borderSubtle,
                    }]}>
                      <Text style={[styles.fbSummaryLabel, { color: colors.textMuted }]}>Conversation summary</Text>
                      <Text style={[styles.fbSummaryText, { color: textSoft }]}>{fbMeta.summary}</Text>
                    </View>
                  )}

                  {/* Load earlier */}
                  {canLoadUp && (
                    <TouchableOpacity
                      style={[styles.fbLoadBtn, { borderColor: colors.border }]}
                      onPress={() => loadMore('up')}
                      disabled={fbLoadingMore}
                      activeOpacity={0.7}
                    >
                      {fbLoadingMore
                        ? <ActivityIndicator size="small" color={colors.textMuted} />
                        : <Text style={[styles.fbLoadText, { color: colors.textMuted }]}>↑ Load earlier ({fbBatch})</Text>}
                    </TouchableOpacity>
                  )}

                  {/* Turnos */}
                  {fbTurns.map((turn) => {
                    const isUser   = turn.speaker === 'user';
                    const isTarget = turn.idx === fbTargetIdx;
                    return (
                      <View key={turn.id} style={[styles.fbBubbleRow, isUser ? styles.fbRowUser : styles.fbRowAI]}>
                        <View
                          style={[
                            styles.fbBubble,
                            {
                              alignSelf:       isUser ? 'flex-end' : 'flex-start',
                              backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                              borderColor:     isTarget ? colors.accent + '99' : colors.borderSubtle,
                              borderWidth:     isTarget ? 1.5 : 1,
                            },
                          ]}
                        >
                          <Text style={[styles.fbSpeaker, { color: isTarget ? colors.accent : colors.textMuted }]}>
                            {isUser ? 'You' : 'AI'}{isTarget ? ' · this moment' : ''}
                          </Text>
                          {renderTurnBody(turn, isUser && isTarget)}
                        </View>
                      </View>
                    );
                  })}

                  {/* Load later */}
                  {canLoadDown && (
                    <TouchableOpacity
                      style={[styles.fbLoadBtn, { borderColor: colors.border }]}
                      onPress={() => loadMore('down')}
                      disabled={fbLoadingMore}
                      activeOpacity={0.7}
                    >
                      {fbLoadingMore
                        ? <ActivityIndicator size="small" color={colors.textMuted} />
                        : <Text style={[styles.fbLoadText, { color: colors.textMuted }]}>↓ Load later ({fbBatch})</Text>}
                    </TouchableOpacity>
                  )}

                  {/* Controles: tamaño de batch + cargar todo */}
                  {(canLoadUp || canLoadDown) && (
                    <View style={styles.fbControls}>
                      <Text style={[styles.fbControlLabel, { color: colors.textMuted }]}>Load</Text>
                      <View style={[styles.fbStepper, { borderColor: colors.borderSubtle }]}>
                        <TouchableOpacity
                          onPress={() => setFbBatch((b) => Math.max(FB_BATCH_MIN, b - 2))}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                          <Ionicons name="remove" size={16} color={colors.text} />
                        </TouchableOpacity>
                        <Text style={[styles.fbStepperVal, { color: colors.text }]}>{fbBatch}</Text>
                        <TouchableOpacity
                          onPress={() => setFbBatch((b) => Math.min(FB_BATCH_MAX, b + 2))}
                          hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                        >
                          <Ionicons name="add" size={16} color={colors.text} />
                        </TouchableOpacity>
                      </View>
                      <Text style={[styles.fbControlLabel, { color: colors.textMuted }]}>at a time</Text>
                      {canLoadFull && (
                        <TouchableOpacity onPress={loadFull} disabled={fbLoadingMore} style={{ marginLeft: 'auto' }}>
                          <Text style={[styles.fbFullText, { color: colors.accent }]}>Load full</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </ScrollView>
              )}
            </GlassCard>
          </View>
        </View>
      )}
    </View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },
  pageScale: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
  iconBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
  screenTitle: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 20 },

  // Tabs
  tabBar: { flexDirection: 'row', gap: 8, padding: 4, borderRadius: 14, borderWidth: 1, marginBottom: 16 },
  tab: { flex: 1, paddingVertical: 9, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', alignItems: 'center' },
  tabText: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 15 },

  // Estados centrados
  centerFill: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14, paddingHorizontal: 28 },
  introTitle: { fontFamily: 'DarkerGrotesque_700Bold', fontSize: 26, marginTop: 4 },
  introSub: { fontFamily: 'BricolageGrotesque_300Light', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 8, paddingHorizontal: 12 },
  ghostBtnText: { fontFamily: 'DarkerGrotesque_500Medium', fontSize: 14 },

  // Cuerpo SRS
  srsBody: { flex: 1 },
  deckTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  progressText: { fontFamily: 'DarkerGrotesque_500Medium', fontSize: 14, letterSpacing: 0.5 },
  endBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 99, borderWidth: 1 },
  endBtnText: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 13 },
  cardWrap: { flex: 1, justifyContent: 'center' },
  card: { maxHeight: '100%' },
  cardContent: { padding: 22 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 },
  cardHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  sevDot: { width: 9, height: 9, borderRadius: 99 },
  categoryText: { fontFamily: 'DarkerGrotesque_500Medium', fontSize: 13, letterSpacing: 0.6, textTransform: 'uppercase' },
  promptLabel: { fontFamily: 'DarkerGrotesque_400Regular', fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 5 },
  frontText: { fontFamily: 'BricolageGrotesque_400Regular', fontSize: 24, lineHeight: 32 },
  errorText: { fontFamily: 'BricolageGrotesque_400Regular', fontSize: 18, lineHeight: 26, textDecorationLine: 'line-through' },
  hintText: { fontFamily: 'BricolageGrotesque_300Light', fontSize: 14, lineHeight: 20, marginTop: 18, fontStyle: 'italic' },
  backBox: { marginTop: 18, paddingTop: 18, borderTopWidth: StyleSheet.hairlineWidth * 2, borderTopColor: 'rgba(127,127,127,0.25)' },
  lemmaRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 10 },
  lemmaText: { fontFamily: 'BricolageGrotesque_400Regular', fontSize: 24, lineHeight: 32, flexShrink: 1 },
  speakBtn: { width: 38, height: 38, borderRadius: 99, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  explanationText: { fontFamily: 'BricolageGrotesque_300Light', fontSize: 15, lineHeight: 21 },

  // Footer
  footer: { paddingTop: 14 },
  primaryBtn: { paddingVertical: 15, paddingHorizontal: 32, borderRadius: 99, alignItems: 'center' },
  primaryBtnText: { fontFamily: 'DarkerGrotesque_700Bold', fontSize: 17, color: '#0C0D0B', letterSpacing: 0.3 },
  outlineBtn: { marginTop: 4, paddingHorizontal: 24, paddingVertical: 11, borderRadius: 99, borderWidth: 1 },
  outlineBtnText: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 15 },
  gradePrompt: { fontFamily: 'DarkerGrotesque_500Medium', fontSize: 14, textAlign: 'center', marginBottom: 10, letterSpacing: 0.3 },
  gradeRow: { flexDirection: 'row', gap: 8 },
  gradeBtn: { flex: 1, paddingVertical: 12, borderRadius: 14, borderWidth: 1, alignItems: 'center', gap: 4 },
  gradeDot: { width: 8, height: 8, borderRadius: 99 },
  gradeLabel: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 15 },
  gradeSub: { fontFamily: 'DarkerGrotesque_400Regular', fontSize: 11 },

  // Overlay compartido (guide + flashback)
  overlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', paddingHorizontal: 20 },

  // Guide modal
  guideInner: { padding: 22, gap: 16 },
  guideHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  guideTitle: { fontFamily: 'DarkerGrotesque_700Bold', fontSize: 22 },
  guideStep: { flexDirection: 'row', gap: 12, alignItems: 'flex-start' },
  guideStepTitle: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 16, marginBottom: 2 },
  guideStepBody: { fontFamily: 'BricolageGrotesque_300Light', fontSize: 14, lineHeight: 20 },

  // Flashback modal
  fbWrap: { width: '100%', maxHeight: '82%' },
  fbCard: { overflow: 'hidden' },
  fbHeader: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, borderBottomWidth: 1 },
  fbTitle: { fontFamily: 'DarkerGrotesque_700Bold', fontSize: 20 },
  fbDate: { fontFamily: 'DarkerGrotesque_400Regular', fontSize: 13, marginTop: 1 },
  fbCenter: { alignItems: 'center', justifyContent: 'center', paddingVertical: 48, paddingHorizontal: 24 },
  fbScroll: { padding: 16, gap: 8 },
  fbSummaryBox: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 6 },
  fbSummaryLabel: { fontFamily: 'DarkerGrotesque_400Regular', fontSize: 11, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 4 },
  fbSummaryText: { fontFamily: 'BricolageGrotesque_300Light', fontSize: 13, lineHeight: 19 },
  fbBubbleRow: { width: '100%' },
  fbRowUser: { alignItems: 'flex-end' },
  fbRowAI: { alignItems: 'flex-start' },
  fbBubble: { maxWidth: '88%', borderRadius: 14, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 9 },
  fbSpeaker: { fontFamily: 'DarkerGrotesque_400Regular', fontSize: 10, letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 },
  fbBubbleText: { fontFamily: 'BricolageGrotesque_400Regular', fontSize: 14, lineHeight: 20 },
  fbLoadBtn: { alignSelf: 'center', paddingHorizontal: 16, paddingVertical: 8, borderRadius: 99, borderWidth: 1, marginVertical: 2 },
  fbLoadText: { fontFamily: 'DarkerGrotesque_500Medium', fontSize: 13 },
  fbControls: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingTop: 8 },
  fbControlLabel: { fontFamily: 'DarkerGrotesque_400Regular', fontSize: 13 },
  fbStepper: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderRadius: 99, paddingHorizontal: 10, paddingVertical: 4 },
  fbStepperVal: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 14, minWidth: 18, textAlign: 'center' },
  fbFullText: { fontFamily: 'DarkerGrotesque_600SemiBold', fontSize: 13 },
});
