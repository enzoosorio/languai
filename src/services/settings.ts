import { supabase } from '../lib/supabase';
import type { Database, Json } from '../types/database';

type UserSettings = Database['public']['Tables']['user_settings']['Row'];

type UserSettingsUpdate = Database['public']['Tables']['user_settings']['Update'];

export const saveOnboarding = async (
  userId: string,
  nativeLang: string,
  targetLang: string,
  level: string,
): Promise<void> => {
  const payload: UserSettingsUpdate = {
    native_language: nativeLang,
    active_language: targetLang,
    active_level: level,
    languages_config: { [targetLang]: level } as Json,
    onboarding_completed: true,
  };

  const { error } = await supabase
    .from('user_settings')
    .update(payload)
    .eq('user_id', userId);

  if (error) throw error;
};

export const loadUserSettings = async (userId: string): Promise<UserSettings | null> => {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (error) return null;
  return data;
};
