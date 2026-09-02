/**
 * srsContext.ts — Flashback de contexto para cards del SRS (Fase 9.B.3)
 *
 * Resuelve "¿en qué momento dije esta frase?" para un tracked_item y permite
 * traer una ventana paginada de la conversación alrededor de ese turno.
 *
 * Los turnos están normalizados (una fila por turno en `session_turns`, indexados
 * por `(session_id, idx)`), así que cada ventana es un index range scan barato,
 * independiente del largo total de la conversación.
 */
import { supabase } from '../lib/supabase';

export interface ContextTurn {
  id:      string;
  idx:     number;
  speaker: 'user' | 'ai';
  text:    string;
}

export interface SessionMeta {
  summary:    string | null;
  tags:       string[];
  started_at: string;
}

export interface TargetTurn {
  sessionId: string;
  idx:       number;                    // idx del turno donde se dijo la frase
  span:      [number, number] | null;   // offset del span dentro del texto del turno
}

/** Item mínimo que necesita la resolución (subset de tracked_items). */
export interface FlashbackItem {
  id:                  string;
  text:                string;
  last_seen_session:   string | null;
  first_seen_session:  string | null;
}

/**
 * Localiza el turno donde se usó la frase del item.
 *   1. Primario: la anotación de feedback más reciente linkeada al item → turn_id + span.
 *   2. Fallback (items legacy sin anotación): busca el substring `item.text` en los
 *      turnos del usuario de su última/primera sesión (indexOf, igual que generate-feedback).
 */
export async function resolveTargetTurn(item: FlashbackItem): Promise<TargetTurn | null> {
  // ── 1) Primario: feedback_annotations linkeada ────────────────────────────
  try {
    const { data: ann } = await supabase
      .from('feedback_annotations')
      .select('turn_id, span_start, span_end')
      .eq('tracked_item_id', item.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (ann?.turn_id) {
      const { data: turn } = await supabase
        .from('session_turns')
        .select('session_id, idx')
        .eq('id', ann.turn_id)
        .maybeSingle();

      if (turn) {
        return {
          sessionId: turn.session_id,
          idx:       turn.idx,
          span:      typeof ann.span_start === 'number' && typeof ann.span_end === 'number'
                       ? [ann.span_start, ann.span_end]
                       : null,
        };
      }
    }
  } catch (err) {
    console.warn('[srsContext] annotation lookup failed:', err);
  }

  // ── 2) Fallback: indexOf sobre los turnos del usuario ─────────────────────
  const sessionId = item.last_seen_session ?? item.first_seen_session;
  if (!sessionId || !item.text) return null;

  try {
    const { data: turns } = await supabase
      .from('session_turns')
      .select('idx, speaker, text')
      .eq('session_id', sessionId)
      .eq('speaker', 'user')
      .order('idx', { ascending: true });

    const needle = item.text.toLowerCase();
    for (const t of turns ?? []) {
      const at = (t.text as string).toLowerCase().indexOf(needle);
      if (at !== -1) {
        return { sessionId, idx: t.idx, span: [at, at + item.text.length] };
      }
    }
  } catch (err) {
    console.warn('[srsContext] fallback lookup failed:', err);
  }

  return null;
}

/** Metadata de la sesión (síntesis + tags + fecha) para el header del flashback. */
export async function fetchSessionMeta(sessionId: string): Promise<SessionMeta | null> {
  const { data } = await supabase
    .from('sessions')
    .select('summary, tags, started_at')
    .eq('id', sessionId)
    .maybeSingle();
  if (!data) return null;
  return {
    summary:    data.summary ?? null,
    tags:       (data.tags as string[]) ?? [],
    started_at: data.started_at,
  };
}

/** Mayor `idx` de la conversación (para clampear la paginación). */
export async function fetchMaxIdx(sessionId: string): Promise<number> {
  const { data } = await supabase
    .from('session_turns')
    .select('idx')
    .eq('session_id', sessionId)
    .order('idx', { ascending: false })
    .limit(1)
    .maybeSingle();
  return data?.idx ?? 0;
}

/**
 * Ventana de turnos `idx ∈ [lo, hi]` (inclusive), ordenada. Index range scan.
 * Trae solo lo pedido — nunca toda la conversación.
 */
export async function fetchTurnWindow(
  sessionId: string,
  lo: number,
  hi: number,
): Promise<ContextTurn[]> {
  if (hi < lo) return [];
  const { data } = await supabase
    .from('session_turns')
    .select('id, idx, speaker, text')
    .eq('session_id', sessionId)
    .gte('idx', lo)
    .lte('idx', hi)
    .order('idx', { ascending: true });
  return (data ?? []) as ContextTurn[];
}

/** Ventana base centrada en el turno objetivo: [N-2, N+3] clampeada a [0, maxIdx]. */
export function baseWindow(targetIdx: number, maxIdx: number): { lo: number; hi: number } {
  return {
    lo: Math.max(0, targetIdx - 2),
    hi: Math.min(maxIdx, targetIdx + 3),
  };
}
