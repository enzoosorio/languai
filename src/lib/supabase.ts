import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import { Database } from '../types/database';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? '';

console.log('SUPABASE URL:', supabaseUrl ? supabaseUrl.slice(0, 30) + '...' : '⚠️ VACÍA');
console.log('SUPABASE KEY:', supabaseAnonKey ? '✅ cargada' : '⚠️ VACÍA');

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    'Faltan EXPO_PUBLIC_SUPABASE_URL o EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY en .env.local'
  );
}

// SecureStore keys have a 2048-char limit — truncate long keys to avoid errors.
// Resiliente: cualquier fallo de SecureStore (lectura/escritura) se traga y
// devuelve null/no-op en vez de rechazar. Si rechazara, getSession() en el
// arranque colgaría y la app se quedaría en el spinner para siempre.
const secureStoreAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    try {
      return await SecureStore.getItemAsync(key.slice(0, 255));
    } catch (e) {
      console.warn('[supabase] SecureStore getItem failed:', e);
      return null;
    }
  },
  setItem: async (key: string, value: string): Promise<void> => {
    try {
      await SecureStore.setItemAsync(key.slice(0, 255), value);
    } catch (e) {
      console.warn('[supabase] SecureStore setItem failed:', e);
    }
  },
  removeItem: async (key: string): Promise<void> => {
    try {
      await SecureStore.deleteItemAsync(key.slice(0, 255));
    } catch (e) {
      console.warn('[supabase] SecureStore removeItem failed:', e);
    }
  },
};

export const supabase = createClient<Database, 'public'>(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStoreAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
  global: {
    fetch: fetch.bind(globalThis),
  },
});
