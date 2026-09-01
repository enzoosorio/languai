import { create } from 'zustand';
import { supabase } from '../lib/supabase';
import { useUserStore } from './useUserStore';

type SessionMode = 'free' | 'roleplay' | 'deep_dive';

interface SessionState {
  sessionId:    string | null;
  turnIndex:    number;
  language:     string;
  level:        string;
  mode:         SessionMode;
  isActive:     boolean;
  /** La IA llamó end_conversation con confidence ≥ 0.85 */
  endRequested: boolean;
  /** La IA llamó end_conversation con confidence 0.50–0.84 (soft close) */
  pendingClose: boolean;

  startSession:    (lang: string, level: string, mode?: SessionMode) => Promise<void>;
  persistTurn:     (speaker: 'user' | 'ai', text: string) => void;
  /**
   * Espera a que terminen los inserts de turnos en vuelo.
   * `persistTurn` es fire-and-forget para no bloquear el loop de voz, pero
   * generate-feedback lee los turnos de la DB y exige >= 4: sin este flush,
   * cerrar la sesión justo después de hablar devuelve `too_short` por una race.
   */
  flushTurns:      () => Promise<void>;
  endSession:      () => Promise<void>;
  setEndRequested: (val: boolean) => void;
  setPendingClose: (val: boolean) => void;
}

/**
 * Inserts de turnos en vuelo. Vive fuera del store porque no es estado de UI:
 * nada re-renderiza al cambiar, y así evitamos renders por cada turno.
 */
// PromiseLike, no Promise: el builder de supabase-js es un thenable, no una
// instancia real de Promise (no tiene .catch ni .finally).
let pendingTurnWrites: PromiseLike<unknown>[] = [];

export const useSessionStore = create<SessionState>((set, get) => ({
  sessionId:    null,
  turnIndex:    0,
  language:     '',
  level:        '',
  mode:         'free',
  isActive:     false,
  endRequested: false,
  pendingClose: false,

  startSession: async (lang, level, mode = 'free') => {
    const user = useUserStore.getState().user;
    if (!user) return;

    const { data, error } = await supabase
      .from('sessions')
      .insert({
        user_id: user.id,
        type: mode,
        language: lang,
        level,
        feedback_status: 'pending',
      })
      .select('id')
      .single();

    if (error || !data) {
      console.warn('startSession error:', error?.message);
      return;
    }

    set({ sessionId: data.id, turnIndex: 0, language: lang, level, mode, isActive: true });
  },

  persistTurn: (speaker, text) => {
    const { sessionId, turnIndex } = get();
    if (!sessionId) return;

    // Fire-and-forget — never blocks the voice loop, pero guardamos la promesa
    // para poder esperarla en flushTurns() antes de generar el feedback.
    const write = supabase
      .from('session_turns')
      .insert({ session_id: sessionId, idx: turnIndex, speaker, text })
      .then(({ error }) => {
        if (error) console.warn('persistTurn error:', error.message);
      });

    pendingTurnWrites.push(write);

    set({ turnIndex: turnIndex + 1 });
  },

  flushTurns: async () => {
    if (pendingTurnWrites.length === 0) return;
    const inFlight = pendingTurnWrites;
    pendingTurnWrites = [];
    // allSettled: un insert fallido no debe impedir el cierre de la sesión.
    await Promise.allSettled(inFlight);
  },

  endSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    const { error } = await supabase
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) console.warn('endSession error:', error.message);

    pendingTurnWrites = [];

    set({
      sessionId:    null,
      isActive:     false,
      turnIndex:    0,
      endRequested: false,
      pendingClose: false,
    });
  },

  setEndRequested: (val) => set({ endRequested: val }),
  setPendingClose: (val) => set({ pendingClose: val }),
}));
