/**
 * FeedbackScreen — Fase 5 (5.5 · 5.6 · 5.7 · 5.8)
 *
 * Pantalla completa de feedback post-sesión.
 * Reemplaza HorizontalNav mientras está visible (no es modal).
 * Muestra turnos como burbujas de chat con spans anotados a color.
 * Tap en span → tooltip con explanation + suggestion + rechazo.
 */
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Easing,
  Alert,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Ionicons } from '@expo/vector-icons';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { supabase } from '../lib/supabase';

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Annotation {
  id:             string;
  span_start:     number;
  span_end:       number;
  severity:       'error' | 'warning' | 'improvement';
  category:       string;
  explanation:    string;
  suggestion:     string;
  tracked_item_id: string | null;
}

interface Turn {
  id:          string;
  idx:         number;
  speaker:     'user' | 'ai';
  text:        string;
  annotations: Annotation[];
}

interface SessionInfo {
  id:          string;
  type:        string;
  language:    string;
  level:       string;
  scenario:    string | null;
  summary:     string | null;
  tags:        string[];
  started_at:  string;
  ended_at:    string | null;
}

interface Props {
  sessionId: string;
  onClose:   () => void;
}

// ── Helpers de color ──────────────────────────────────────────────────────────
function severityColors(severity: Annotation['severity'], isDark: boolean) {
  switch (severity) {
    case 'error':
      return {
        bg:        isDark ? 'rgba(180,60,50,0.25)'  : 'rgba(180,60,50,0.12)',
        underline: isDark ? 'rgba(180,60,50,0.90)'  : 'rgba(160,40,30,0.80)',
        badge:     '#B43C32',
      };
    case 'warning':
      return {
        bg:        isDark ? 'rgba(201,162,39,0.25)' : 'rgba(201,162,39,0.15)',
        underline: '#C9A227',
        badge:     '#C9A227',
      };
    case 'improvement':
      return {
        bg:        isDark ? 'rgba(74,122,211,0.25)' : 'rgba(74,122,211,0.12)',
        underline: 'rgba(74,122,211,0.85)',
        badge:     '#4A7AD3',
      };
  }
}

// ── SeverityDot ───────────────────────────────────────────────────────────────
// Bolita SVG con gradiente radial — reemplaza los emojis 🔴🟡🔵 para tono y
// forma consistentes entre iOS y Android.
const DOT_GRADIENT: Record<Annotation['severity'], { light: string; dark: string }> = {
  error:       { light: '#E86A5E', dark: '#B43C32' },
  warning:     { light: '#E8CC6A', dark: '#C9A227' },
  improvement: { light: '#7FA6E8', dark: '#4A7AD3' },
};

const SeverityDot: React.FC<{ severity: Annotation['severity']; size?: number }> = ({
  severity, size = 12,
}) => {
  const { light, dark } = DOT_GRADIENT[severity];
  const gid = `dot-${severity}`;
  const r = size / 2;
  return (
    <Svg width={size} height={size} viewBox="0 0 12 12">
      <Defs>
        <RadialGradient id={gid} cx="38%" cy="32%" r="75%">
          <Stop offset="0%"   stopColor={light} stopOpacity={1} />
          <Stop offset="100%" stopColor={dark}  stopOpacity={1} />
        </RadialGradient>
      </Defs>
      <Circle cx={r} cy={r} r={r} fill={`url(#${gid})`} />
    </Svg>
  );
};

// ── AnnotatedText ─────────────────────────────────────────────────────────────
// Renderiza texto con spans anotados inline usando Text anidados.
// React Native soporta onPress en Text anidados.
interface AnnotatedTextProps {
  text:        string;
  annotations: Annotation[];
  isDark:      boolean;
  baseStyle:   object;
  onPress:     (ann: Annotation) => void;
}

const AnnotatedText: React.FC<AnnotatedTextProps> = ({
  text, annotations, isDark, baseStyle, onPress,
}) => {
  if (!annotations.length) {
    return <Text style={baseStyle}>{text}</Text>;
  }

  // Ordenar anotaciones por span_start, eliminar overlaps
  const sorted = [...annotations].sort((a, b) => a.span_start - b.span_start);

  // Construir segmentos: [{start, end, ann|null}]
  const segments: Array<{ text: string; ann: Annotation | null }> = [];
  let cursor = 0;

  for (const ann of sorted) {
    const s = Math.max(ann.span_start, cursor);
    const e = Math.min(ann.span_end, text.length);
    if (s >= e) continue;

    // Texto antes del span
    if (s > cursor) {
      segments.push({ text: text.slice(cursor, s), ann: null });
    }
    // Span anotado
    segments.push({ text: text.slice(s, e), ann });
    cursor = e;
  }

  // Texto final
  if (cursor < text.length) {
    segments.push({ text: text.slice(cursor), ann: null });
  }

  return (
    <Text style={baseStyle}>
      {segments.map((seg, i) => {
        if (!seg.ann) {
          return <Text key={i}>{seg.text}</Text>;
        }
        const { bg, underline } = severityColors(seg.ann.severity, isDark);
        return (
          <Text
            key={i}
            onPress={() => onPress(seg.ann!)}
            style={{
              backgroundColor:       bg,
              textDecorationLine:    'underline',
              textDecorationColor:   underline,
              textDecorationStyle:   'solid',
            }}
          >
            {seg.text}
          </Text>
        );
      })}
    </Text>
  );
};

// ── Componente principal ───────────────────────────────────────────────────────
export const FeedbackScreen: React.FC<Props> = ({ sessionId, onClose }) => {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();

  const [loading,    setLoading]    = useState(true);
  const [session,    setSession]    = useState<SessionInfo | null>(null);
  const [turns,      setTurns]      = useState<Turn[]>([]);
  const [selectedAnn, setSelectedAnn] = useState<Annotation | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  // TITULO-FEEDBACK-TRUNCATION — el título se trunca; tap lo expande en z-index
  const [titleExpanded, setTitleExpanded] = useState(false);

  // Animación de mount
  const mountOpacity = useRef(new Animated.Value(0)).current;
  const mountTransY  = useRef(new Animated.Value(20)).current;

  // ── Fetch data ────────────────────────────────────────────────────────────
  const fetchFeedback = useCallback(async () => {
    setLoading(true);
    try {
      // Sesión
      const { data: sess } = await supabase
        .from('sessions')
        .select('id, type, language, level, scenario, summary, tags, started_at, ended_at')
        .eq('id', sessionId)
        .single();
      if (sess) setSession(sess as SessionInfo);

      // Turnos + anotaciones (nested select)
      const { data: rawTurns } = await supabase
        .from('session_turns')
        .select(`
          id, idx, speaker, text,
          feedback_annotations (
            id, span_start, span_end, severity, category, explanation, suggestion, tracked_item_id
          )
        `)
        .eq('session_id', sessionId)
        .order('idx', { ascending: true });

      if (rawTurns) {
        setTurns(
          rawTurns.map((t: any) => ({
            ...t,
            annotations: (t.feedback_annotations ?? []) as Annotation[],
          })),
        );
      }
    } catch (err) {
      console.warn('[FeedbackScreen] fetch error:', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    fetchFeedback();
  }, [fetchFeedback]);

  useEffect(() => {
    if (!loading) {
      Animated.parallel([
        Animated.timing(mountOpacity, { toValue: 1, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.timing(mountTransY,  { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      ]).start();
    }
  }, [loading]);

  // ── Contadores por severidad ──────────────────────────────────────────────
  const counts = turns.reduce(
    (acc, t) => {
      for (const ann of t.annotations) {
        acc[ann.severity] = (acc[ann.severity] ?? 0) + 1;
      }
      return acc;
    },
    { error: 0, warning: 0, improvement: 0 } as Record<string, number>,
  );

  // TITULO-FEEDBACK-TRUNCATION — primera oración del summary como título
  const feedbackTitle = session?.summary ? session.summary.split('.')[0].trim() : '';

  // ── Rejection (5.7 / 5.8) ────────────────────────────────────────────────
  const handleReject = async (ann: Annotation) => {
    if (!ann.tracked_item_id) {
      setSelectedAnn(null);
      return;
    }
    setRejectingId(ann.id);
    try {
      // Leer weight y user_rejections actuales
      const { data: item } = await supabase
        .from('tracked_items')
        .select('id, weight, user_rejections')
        .eq('id', ann.tracked_item_id)
        .single();

      if (!item) return;

      const newWeight     = Math.max(0, item.weight - 1);
      const newRejections = item.user_rejections + 1;
      const shouldArchive = newWeight <= 0 && newRejections >= 2;

      await supabase
        .from('tracked_items')
        .update({
          weight:          newWeight,
          user_rejections: newRejections,
          archived:        shouldArchive,
        })
        .eq('id', item.id);

      // Actualizar UI local: remover la anotación de la lista
      setTurns((prev) =>
        prev.map((t) => ({
          ...t,
          annotations: t.annotations.filter((a) => a.id !== ann.id),
        })),
      );
      setSelectedAnn(null);
    } catch (err) {
      console.warn('[FeedbackScreen] reject error:', err);
    } finally {
      setRejectingId(null);
    }
  };

  // ── Loading ───────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <View style={[styles.loadingContainer, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        <Text style={[styles.loadingText, { color: colors.textMuted }]}>
          Loading feedback…
        </Text>
      </View>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <Animated.View
      style={[
        styles.container,
        {
          backgroundColor: colors.background,
          opacity:          mountOpacity,
          transform:        [{ translateY: mountTransY }],
        },
      ]}
    >
      {/* ── Header ──────────────────────────────────────────────────────── */}
      <View
        style={[
          styles.header,
          {
            paddingTop:      insets.top + 12,
            borderBottomColor: isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
          },
        ]}
      >
        <TouchableOpacity style={styles.backBtn} onPress={onClose} activeOpacity={0.7}>
          <Ionicons name="arrow-back" size={20} color={colors.text} />
        </TouchableOpacity>

        <View style={styles.headerCenter}>
          {/* TITULO-FEEDBACK-TRUNCATION — truncado + tap para expandir */}
          <TouchableOpacity
            activeOpacity={0.7}
            disabled={!feedbackTitle}
            onPress={() => setTitleExpanded((v) => !v)}
            style={styles.titleTouch}
          >
            <Text style={[styles.headerTitle, { color: colors.text }]} numberOfLines={1} ellipsizeMode="tail">
              {feedbackTitle || 'Conversation feedback'}
            </Text>
          </TouchableOpacity>
          {/* Counters */}
          <View style={styles.counters}>
            {counts.error > 0 && (
              <View style={styles.counterItem}>
                <SeverityDot severity="error" size={11} />
                <Text style={[styles.counter, { color: colors.textMuted }]}>{counts.error}</Text>
              </View>
            )}
            {counts.warning > 0 && (
              <View style={styles.counterItem}>
                <SeverityDot severity="warning" size={11} />
                <Text style={[styles.counter, { color: colors.textMuted }]}>{counts.warning}</Text>
              </View>
            )}
            {counts.improvement > 0 && (
              <View style={styles.counterItem}>
                <SeverityDot severity="improvement" size={11} />
                <Text style={[styles.counter, { color: colors.textMuted }]}>{counts.improvement}</Text>
              </View>
            )}
          </View>
        </View>

        {/* Spacer to balance the back button */}
        <View style={{ width: 36 }} />
      </View>

      {/* ── TITULO-FEEDBACK-TRUNCATION: píldora expandida ─────────────────── */}
      {titleExpanded && feedbackTitle.length > 0 && (
        <TouchableOpacity
          style={[styles.titleOverlay, { top: insets.top + 8 }]}
          activeOpacity={1}
          onPress={() => setTitleExpanded(false)}
        >
          <View
            style={[
              styles.titlePill,
              {
                backgroundColor: isDark ? colors.surfaceSolid : '#FAFAF7',
                borderColor:     isDark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.10)',
              },
            ]}
          >
            <Text style={[styles.titlePillText, { color: colors.text }]}>
              {feedbackTitle}
            </Text>
          </View>
        </TouchableOpacity>
      )}

      {/* ── Tags ────────────────────────────────────────────────────────── */}
      {session?.tags && session.tags.length > 0 && (
        <View style={[styles.tagsRow, { paddingHorizontal: 20, paddingTop: 10, paddingBottom: 4 }]}>
          {session.tags.map((tag) => (
            <View
              key={tag}
              style={[styles.tagChip, {
                backgroundColor: colors.accent + '22',
                borderColor:     colors.accent + '55',
              }]}
            >
              <Text style={[styles.tagText, { color: colors.accent }]}>{tag.replace(/_/g, ' ')}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Summary ─────────────────────────────────────────────────────── */}
      {session?.summary && (
        <View style={[styles.summaryBox, {
          marginHorizontal: 20,
          marginTop:        10,
          backgroundColor:  isDark ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.03)',
          borderColor:      isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)',
        }]}>
          <Text style={[styles.summaryText, { color: colors.textMuted }]}>
            {session.summary}
          </Text>
        </View>
      )}

      {/* ── Turns ───────────────────────────────────────────────────────── */}
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: insets.bottom + 40 }]}
        showsVerticalScrollIndicator={false}
      >
        {turns.map((turn) => {
          const isUser = turn.speaker === 'user';
          return (
            <View
              key={turn.id}
              style={[
                styles.bubbleRow,
                isUser ? styles.bubbleRowUser : styles.bubbleRowAI,
              ]}
            >
              <View
                style={[
                  styles.bubble,
                  {
                    overflow: 'hidden',
                    maxWidth: '82%',
                    backgroundColor: isUser
                      ? (isDark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.05)')
                      : (isDark ? 'rgba(255,255,255,0.04)' : 'rgba(0,0,0,0.02)'),
                    borderColor: isUser
                      ? (isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)')
                      : (isDark ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.04)'),
                    alignSelf: isUser ? 'flex-end' : 'flex-start',
                  },
                ]}
              >
                <BlurView
                  intensity={isDark ? 18 : 14}
                  tint={isDark ? 'dark' : 'light'}
                  style={StyleSheet.absoluteFill}
                  pointerEvents="none"
                />
                <Text style={[styles.speakerLabel, { color: colors.textMuted }]}>
                  {isUser ? 'You' : 'AI'}
                </Text>
                {isUser ? (
                  <AnnotatedText
                    text={turn.text}
                    annotations={turn.annotations}
                    isDark={isDark}
                    baseStyle={[styles.bubbleText, { color: colors.text }]}
                    onPress={setSelectedAnn}
                  />
                ) : (
                  <Text style={[styles.bubbleText, { color: colors.textMuted }]}>
                    {turn.text}
                  </Text>
                )}
              </View>
            </View>
          );
        })}

        {/* Footer CTA */}
        <TouchableOpacity
          style={[
            styles.closeBtn,
            {
              backgroundColor: colors.accent + '22',
              borderColor:     colors.accent + '55',
              marginTop:       20,
            },
          ]}
          onPress={onClose}
          activeOpacity={0.75}
        >
          <Text style={[styles.closeBtnText, { color: colors.text }]}>
            Keep practicing
          </Text>
        </TouchableOpacity>
      </ScrollView>

      {/* ── Annotation Tooltip ────────────────────────────────────────────── */}
      {selectedAnn && (
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setSelectedAnn(null)}
        >
          <TouchableOpacity
            activeOpacity={1}
            onPress={(e) => e.stopPropagation()}
            style={[
              styles.tooltipCard,
              {
                backgroundColor: isDark ? colors.surfaceSolid : '#FAFAF7',
                borderColor:     isDark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.08)',
                marginBottom:    insets.bottom + 20,
              },
            ]}
          >
            {/* Severity badge */}
            <View style={styles.tooltipHeader}>
              <View style={[styles.severityBadge, {
                backgroundColor: severityColors(selectedAnn.severity, isDark).bg,
                borderColor:     severityColors(selectedAnn.severity, isDark).underline,
              }]}>
                <SeverityDot severity={selectedAnn.severity} size={12} />
                <Text style={[styles.severityBadgeText, { color: severityColors(selectedAnn.severity, isDark).badge }]}>
                  {selectedAnn.severity} · {selectedAnn.category}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedAnn(null)} hitSlop={{ top: 12, right: 12, bottom: 12, left: 12 }}>
                <Ionicons name="close" size={18} color={colors.textMuted} />
              </TouchableOpacity>
            </View>

            {/* Explanation */}
            <Text style={[styles.tooltipExplanation, { color: colors.text }]}>
              {selectedAnn.explanation}
            </Text>

            {/* Suggestion */}
            {selectedAnn.suggestion ? (
              <View style={[styles.suggestionBox, {
                backgroundColor: isDark ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.04)',
                borderColor:     isDark ? 'rgba(255,255,255,0.10)' : 'rgba(0,0,0,0.06)',
              }]}>
                <Text style={[styles.suggestionLabel, { color: colors.textMuted }]}>Better: </Text>
                <Text style={[styles.suggestionText, { color: colors.text }]}>
                  {selectedAnn.suggestion}
                </Text>
              </View>
            ) : null}

            {/* Reject button — solo si está linkeado a un tracked_item */}
            {selectedAnn.tracked_item_id && (
              <TouchableOpacity
                style={[styles.rejectBtn, { borderColor: colors.border }]}
                onPress={() => handleReject(selectedAnn)}
                disabled={rejectingId === selectedAnn.id}
                activeOpacity={0.7}
              >
                {rejectingId === selectedAnn.id
                  ? <ActivityIndicator size="small" color={colors.textMuted} />
                  : <Text style={[styles.rejectText, { color: colors.textMuted }]}>
                      Not an error
                    </Text>
                }
              </TouchableOpacity>
            )}
          </TouchableOpacity>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    gap:            12,
  },
  loadingText: {
    fontFamily: 'BricolageGrotesque_300Light',
    fontSize:   14,
  },

  // ── Header ─────────────────────────────────────────────────────────────────
  header: {
    flexDirection:    'row',
    alignItems:       'center',
    paddingHorizontal: 16,
    paddingBottom:    12,
    borderBottomWidth: 1,
  },
  backBtn: {
    width:          36,
    height:         36,
    alignItems:     'center',
    justifyContent: 'center',
  },
  headerCenter: {
    flex:       1,
    alignItems: 'center',
  },
  titleTouch: {
    maxWidth: '100%',
  },
  headerTitle: {
    fontFamily:    'DarkerGrotesque_600SemiBold',
    fontSize:      15,
    letterSpacing: 0.2,
  },
  // TITULO-FEEDBACK-TRUNCATION — overlay + píldora
  titleOverlay: {
    position:       'absolute',
    left:           0,
    right:          0,
    bottom:         0,
    alignItems:     'center',
    paddingHorizontal: 24,
    zIndex:         50,
  },
  titlePill: {
    borderRadius:      16,
    borderWidth:       1,
    paddingHorizontal: 16,
    paddingVertical:   12,
    maxWidth:          '100%',
    // sombra para despegar la píldora del header
    shadowColor:   '#000',
    shadowOpacity: 0.25,
    shadowRadius:  12,
    shadowOffset:  { width: 0, height: 4 },
    elevation:     8,
  },
  titlePillText: {
    fontFamily:    'DarkerGrotesque_600SemiBold',
    fontSize:      16,
    letterSpacing: 0.2,
    lineHeight:    22,
    textAlign:     'center',
  },
  counters: {
    flexDirection: 'row',
    gap:           10,
    marginTop:     4,
  },
  counterItem: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           4,
  },
  counter: {
    fontSize:   12,
    fontFamily: 'DarkerGrotesque_400Regular',
  },

  // ── Tags ────────────────────────────────────────────────────────────────────
  tagsRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           6,
  },
  tagChip: {
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      99,
    borderWidth:       1,
  },
  tagText: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      11,
    letterSpacing: 0.4,
    textTransform: 'capitalize',
  },

  // ── Summary ─────────────────────────────────────────────────────────────────
  summaryBox: {
    borderRadius: 12,
    borderWidth:  1,
    padding:      12,
    marginBottom: 4,
  },
  summaryText: {
    fontFamily:  'BricolageGrotesque_300Light',
    fontSize:    13,
    lineHeight:  19,
  },

  // ── Scroll / Turns ───────────────────────────────────────────────────────────
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop:        16,
    gap:               10,
  },
  bubbleRow: {
    width: '100%',
  },
  bubbleRowUser: {
    alignItems: 'flex-end',
  },
  bubbleRowAI: {
    alignItems: 'flex-start',
  },
  bubble: {
    borderRadius: 16,
    borderWidth:  1,
    paddingHorizontal: 14,
    paddingVertical:   10,
  },
  speakerLabel: {
    fontFamily:    'DarkerGrotesque_400Regular',
    fontSize:      10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    marginBottom:  4,
  },
  bubbleText: {
    fontFamily: 'BricolageGrotesque_400Regular',
    fontSize:   15,
    lineHeight: 22,
  },

  // ── Close button ────────────────────────────────────────────────────────────
  closeBtn: {
    alignSelf:         'center',
    paddingHorizontal: 28,
    paddingVertical:   12,
    borderRadius:      99,
    borderWidth:       1,
  },
  closeBtnText: {
    fontFamily: 'DarkerGrotesque_600SemiBold',
    fontSize:   15,
  },

  // ── Tooltip ─────────────────────────────────────────────────────────────────
  tooltipOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'flex-end',
  },
  tooltipCard: {
    marginHorizontal: 16,
    borderRadius:     20,
    borderWidth:      1,
    padding:          20,
    gap:              12,
  },
  tooltipHeader: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
  },
  severityBadge: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    paddingHorizontal: 10,
    paddingVertical:   4,
    borderRadius:      8,
    borderWidth:       1,
  },
  severityBadgeText: {
    fontFamily:    'DarkerGrotesque_600SemiBold',
    fontSize:      12,
    letterSpacing: 0.3,
    textTransform: 'capitalize',
  },
  tooltipExplanation: {
    fontFamily: 'BricolageGrotesque_400Regular',
    fontSize:   15,
    lineHeight: 22,
  },
  suggestionBox: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    borderRadius:  10,
    borderWidth:   1,
    padding:       10,
  },
  suggestionLabel: {
    fontFamily: 'DarkerGrotesque_600SemiBold',
    fontSize:   14,
  },
  suggestionText: {
    fontFamily: 'BricolageGrotesque_400Regular',
    fontSize:   14,
    lineHeight: 20,
    flex:       1,
  },
  rejectBtn: {
    alignSelf:         'flex-start',
    paddingHorizontal: 14,
    paddingVertical:   8,
    borderRadius:      10,
    borderWidth:       1,
  },
  rejectText: {
    fontFamily: 'DarkerGrotesque_400Regular',
    fontSize:   13,
  },
});
