/**
 * srsSession.ts — Trazabilidad de mini-sesiones de repaso SRS (Fase 9.B.2)
 *
 * El botón "Start" delimita una sentada → `srs_sessions` (agrupador liviano).
 * Cada card calificada → una fila en `srs_reviews` (log de eventos append-only).
 * Los contadores/flags a nivel sesión NO se guardan: se derivan (vista srs_session_stats).
 */
import { supabase } from '../lib/supabase';
import type { Json } from '../types/database';
import type { SrsGrade, SrsState } from '../lib/srs';

// Las tablas srs_sessions / srs_reviews aún no están en los tipos generados
// (database.ts es stub + migración 006 recién creada). Handle sin tipar hasta
// regenerar tipos (`supabase gen types`). Ver caveat del plan.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

/** Crea una mini-sesión de repaso. Devuelve su id, o null si falla. */
export async function startSrsSession(userId: string): Promise<string | null> {
  try {
    const { data, error } = await sb
      .from('srs_sessions')
      .insert({ user_id: userId })
      .select('id')
      .single();
    if (error) {
      console.warn('[srsSession] start error:', error.message);
      return null;
    }
    return data?.id ?? null;
  } catch (err) {
    console.warn('[srsSession] start exception:', err);
    return null;
  }
}

export interface ReviewRecord {
  srsSessionId:  string;
  trackedItemId: string;
  grade:         SrsGrade;
  usedTts:       boolean;
  usedHistory:   boolean;
  stateBefore:   SrsState | null;
  stateAfter:    SrsState;
}

/** Loguea un repaso de card. Fire-and-forget desde la UI (no bloquea el flujo). */
export async function recordReview(r: ReviewRecord): Promise<void> {
  try {
    const { error } = await sb.from('srs_reviews').insert({
      srs_session_id:   r.srsSessionId,
      tracked_item_id:  r.trackedItemId,
      grade:            r.grade,
      used_tts:         r.usedTts,
      used_history:     r.usedHistory,
      srs_state_before: (r.stateBefore ?? null) as unknown as Json,
      srs_state_after:  r.stateAfter as unknown as Json,
    });
    if (error) console.warn('[srsSession] recordReview error:', error.message);
  } catch (err) {
    console.warn('[srsSession] recordReview exception:', err);
  }
}

/** Cierra la mini-sesión (set ended_at). Idempotente y no-fatal. */
export async function endSrsSession(srsSessionId: string): Promise<void> {
  try {
    const { error } = await sb
      .from('srs_sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', srsSessionId);
    if (error) console.warn('[srsSession] end error:', error.message);
  } catch (err) {
    console.warn('[srsSession] end exception:', err);
  }
}
