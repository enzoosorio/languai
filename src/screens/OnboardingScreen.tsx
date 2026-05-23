import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useUserStore } from '../stores/useUserStore';
import { saveOnboarding } from '../services/settings';

const NATIVE_LANGUAGES = [
  { code: 'es', label: 'Español' },
  { code: 'pt', label: 'Português' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'de', label: 'Deutsch' },
  { code: 'zh', label: '中文' },
  { code: 'ja', label: '日本語' },
  { code: 'ko', label: '한국어' },
  { code: 'ar', label: 'العربية' },
  { code: 'ru', label: 'Русский' },
  { code: 'hi', label: 'हिन्दी' },
  { code: 'en', label: 'English' },
];

const TARGET_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

const LEVELS: { code: string; label: string; desc: string }[] = [
  { code: 'A1', label: 'A1', desc: 'Principiante' },
  { code: 'A2', label: 'A2', desc: 'Básico' },
  { code: 'B1', label: 'B1', desc: 'Intermedio' },
  { code: 'B2', label: 'B2', desc: 'Avanzado' },
  { code: 'C1', label: 'C1', desc: 'Experto' },
];

export const OnboardingScreen: React.FC = () => {
  const { colors, typography } = useTheme();
  const { user, loadSettings } = useUserStore();

  const [step, setStep] = useState(0);
  const [nativeLang, setNativeLang] = useState('');
  const [targetLang, setTargetLang] = useState('');
  const [level, setLevel] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleFinish = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      await saveOnboarding(user.id, nativeLang, targetLang, level);
      await loadSettings();
      // App.tsx reacts to settings.onboarding_completed → renders PagerView
    } catch (e: any) {
      setError(e.message ?? 'Error guardando configuración');
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    root: { flex: 1 },
    inner: { flex: 1, paddingHorizontal: 28, paddingTop: 60 },
    step: {
      ...typography.label,
      color: colors.textMuted,
      marginBottom: 8,
    },
    title: {
      ...typography.h2,
      color: colors.text,
      marginBottom: 28,
    },
    optionRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 10,
      marginBottom: 32,
    },
    chip: {
      paddingHorizontal: 18,
      paddingVertical: 10,
      borderRadius: 50,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    chipSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent + '33',
    },
    chipText: {
      ...typography.bodyMedium,
      color: colors.textMuted,
    },
    chipTextSelected: {
      color: colors.text,
    },
    levelRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 32,
    },
    levelChip: {
      flex: 1,
      alignItems: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    levelChipSelected: {
      borderColor: colors.accent,
      backgroundColor: colors.accent + '33',
    },
    levelCode: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    levelDesc: {
      ...typography.caption,
      color: colors.textMuted,
    },
    summary: {
      ...typography.body,
      color: colors.text,
      marginBottom: 32,
      lineHeight: 26,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 'auto',
      marginBottom: 40,
    },
    btnDisabled: { opacity: 0.4 },
    btnText: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
      marginBottom: 8,
    },
  });

  const targetLangLabel = TARGET_LANGUAGES.find((l) => l.code === targetLang);

  return (
    <View style={s.root}>
      <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
        <View style={s.inner}>
          {/* Step 0 — native language */}
          {step === 0 && (
            <>
              <Text style={s.step}>PASO 1 DE 3</Text>
              <Text style={s.title}>¿Cuál es tu idioma nativo?</Text>
              <View style={s.optionRow}>
                {NATIVE_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[s.chip, nativeLang === lang.code && s.chipSelected]}
                    onPress={() => setNativeLang(lang.code)}
                  >
                    <Text
                      style={[s.chipText, nativeLang === lang.code && s.chipTextSelected]}
                    >
                      {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Step 1 — target language + level */}
          {step === 1 && (
            <>
              <Text style={s.step}>PASO 2 DE 3</Text>
              <Text style={s.title}>¿Qué idioma querés practicar?</Text>
              <View style={s.optionRow}>
                {TARGET_LANGUAGES.map((lang) => (
                  <TouchableOpacity
                    key={lang.code}
                    style={[s.chip, targetLang === lang.code && s.chipSelected]}
                    onPress={() => setTargetLang(lang.code)}
                  >
                    <Text
                      style={[s.chipText, targetLang === lang.code && s.chipTextSelected]}
                    >
                      {lang.flag} {lang.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={[s.title, { marginBottom: 16 }]}>¿Cuál es tu nivel?</Text>
              <View style={s.levelRow}>
                {LEVELS.map((l) => (
                  <TouchableOpacity
                    key={l.code}
                    style={[s.levelChip, level === l.code && s.levelChipSelected]}
                    onPress={() => setLevel(l.code)}
                  >
                    <Text style={s.levelCode}>{l.label}</Text>
                    <Text style={s.levelDesc}>{l.desc}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}

          {/* Step 2 — summary */}
          {step === 2 && (
            <>
              <Text style={s.step}>PASO 3 DE 3</Text>
              <Text style={s.title}>Listo para practicar</Text>
              <Text style={s.summary}>
                {`Vas a practicar ${targetLangLabel?.label ?? targetLang} en nivel ${level}.\n\nLa IA va a adaptarse a tu nivel y corrección progresivamente.`}
              </Text>
              {error && <Text style={s.error}>{error}</Text>}
            </>
          )}

          {/* Navigation button */}
          <TouchableOpacity
            style={[
              s.btn,
              ((step === 0 && !nativeLang) ||
                (step === 1 && (!targetLang || !level)) ||
                loading) &&
                s.btnDisabled,
            ]}
            disabled={
              (step === 0 && !nativeLang) ||
              (step === 1 && (!targetLang || !level)) ||
              loading
            }
            onPress={() => {
              if (step < 2) setStep((prev) => prev + 1);
              else handleFinish();
            }}
          >
            {loading ? (
              <ActivityIndicator color={colors.text} />
            ) : (
              <Text style={s.btnText}>
                {step < 2 ? 'Siguiente' : 'Empezar a practicar'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>
    </View>
  );
};
