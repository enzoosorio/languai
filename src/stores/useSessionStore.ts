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
  endSession:      () => Promise<void>;
  setEndRequested: (val: boolean) => void;
  setPendingClose: (val: boolean) => void;
}

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

    // Fire-and-forget — never blocks the voice loop
    supabase
      .from('session_turns')
      .insert({ session_id: sessionId, idx: turnIndex, speaker, text })
      .then(({ error }) => {
        if (error) console.warn('persistTurn error:', error.message);
      });

    set({ turnIndex: turnIndex + 1 });
  },

  endSession: async () => {
    const { sessionId } = get();
    if (!sessionId) return;

    const { error } = await supabase
      .from('sessions')
      .update({ ended_at: new Date().toISOString() })
      .eq('id', sessionId);

    if (error) console.warn('endSession error:', error.message);

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
