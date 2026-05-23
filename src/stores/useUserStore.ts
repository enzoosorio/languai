import { create } from 'zustand';
import type { User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';
import type { Database } from '../types/database';

type UserSettings = Database['public']['Tables']['user_settings']['Row'];

interface UserState {
  user: User | null;
  settings: UserSettings | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setSettings: (settings: UserSettings | null) => void;
  clearUser: () => void;
  loadSettings: () => Promise<void>;
  setLoading: (loading: boolean) => void;
}

export const useUserStore = create<UserState>((set, get) => ({
  user: null,
  settings: null,
  isLoading: true,

  setUser: (user) => set({ user }),
  setSettings: (settings) => set({ settings }),
  clearUser: () => set({ user: null, settings: null }),
  setLoading: (loading) => set({ isLoading: loading }),

  loadSettings: async () => {
    const { user } = get();
    if (!user) return;

    const { data, error } = await supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', user.id)
      .single();

    if (!error && data) {
      set({ settings: data });
    }
  },
}));
