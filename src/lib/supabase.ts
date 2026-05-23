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

// SecureStore keys have a 2048-char limit — truncate long keys to avoid errors
const secureStoreAdapter = {
  getItem: (key: string) => SecureStore.getItemAsync(key.slice(0, 255)),
  setItem: (key: string, value: string) => SecureStore.setItemAsync(key.slice(0, 255), value),
  removeItem: (key: string) => SecureStore.deleteItemAsync(key.slice(0, 255)),
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
