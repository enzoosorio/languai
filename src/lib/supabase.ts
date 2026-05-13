import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || '';

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('Faltan credenciales de Supabase en .env.local');
}

// TODO: Una vez que hagas `npx supabase gen types typescript` y tengas el archivo `types.ts`,
// podés pasarlo acá como <Database> para tener tipos estrictos.
export const supabase = createClient(supabaseUrl, supabaseAnonKey);
