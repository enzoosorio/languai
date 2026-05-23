import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { sendOtp, verifyOtp } from '../services/auth';

type Step = 'email' | 'otp' | 'sent';

export const LoginScreen: React.FC = () => {
  const { colors, typography } = useTheme();
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSendOtp = async () => {
    if (!email.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await sendOtp(email.trim().toLowerCase());
      setStep('otp');
    } catch (e: any) {
      setError(e.message ?? 'Error enviando el código');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async () => {
    if (otp.length < 6) return;
    setLoading(true);
    setError(null);
    try {
      await verifyOtp(email.trim().toLowerCase(), otp.trim());
      // Auth state change fires automatically → App.tsx re-renders
    } catch (e: any) {
      setError(e.message ?? 'Código inválido o expirado');
    } finally {
      setLoading(false);
    }
  };

  const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.background },
    inner: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: 32,
      gap: 12,
    },
    title: {
      ...typography.h1,
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      ...typography.body,
      color: colors.textMuted,
      marginBottom: 24,
    },
    input: {
      ...typography.body,
      color: colors.text,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 14,
      paddingHorizontal: 18,
      paddingVertical: 14,
    },
    btn: {
      backgroundColor: colors.accent,
      borderRadius: 14,
      paddingVertical: 15,
      alignItems: 'center',
      marginTop: 4,
    },
    btnText: {
      ...typography.bodyMedium,
      color: colors.text,
    },
    back: {
      alignSelf: 'center',
      marginTop: 8,
    },
    backText: {
      ...typography.caption,
      color: colors.textMuted,
    },
    error: {
      ...typography.caption,
      color: colors.danger,
      textAlign: 'center',
    },
  });

  return (
    <KeyboardAvoidingView
      style={s.root}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <View style={s.inner}>
        {step === 'email' ? (
          <>
            <Text style={s.title}>LanguAI</Text>
            <Text style={s.subtitle}>Ingresá tu email para acceder</Text>
            <TextInput
              style={s.input}
              placeholder="tu@email.com"
              placeholderTextColor={colors.textMuted}
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              value={email}
              onChangeText={setEmail}
              onSubmitEditing={handleSendOtp}
              returnKeyType="send"
            />
            {error && <Text style={s.error}>{error}</Text>}
            <TouchableOpacity
              style={s.btn}
              onPress={handleSendOtp}
              disabled={loading || !email.trim()}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={s.btnText}>Enviar código</Text>
              )}
            </TouchableOpacity>
          </>
        ) : (
          <>
            <Text style={s.title}>Revisá tu email</Text>
            <Text style={s.subtitle}>
              Ingresá el código de 6 dígitos que te enviamos a {email}
            </Text>
            <TextInput
              style={[s.input, { letterSpacing: 8, textAlign: 'center', fontSize: 22 }]}
              placeholder="000000"
              placeholderTextColor={colors.textMuted}
              keyboardType="number-pad"
              maxLength={6}
              value={otp}
              onChangeText={setOtp}
              onSubmitEditing={handleVerifyOtp}
              returnKeyType="done"
              autoFocus
            />
            {error && <Text style={s.error}>{error}</Text>}
            <TouchableOpacity
              style={s.btn}
              onPress={handleVerifyOtp}
              disabled={loading || otp.length < 6}
            >
              {loading ? (
                <ActivityIndicator color={colors.text} />
              ) : (
                <Text style={s.btnText}>Verificar</Text>
              )}
            </TouchableOpacity>
            <TouchableOpacity style={s.back} onPress={() => { setStep('email'); setOtp(''); setError(null); }}>
              <Text style={s.backText}>Volver a ingresar email</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
};
