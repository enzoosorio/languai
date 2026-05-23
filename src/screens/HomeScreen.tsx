import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  ScrollView,
  ActivityIndicator,
  Linking,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
import { useTheme } from '../hooks/useTheme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useUserStore } from '../stores/useUserStore';
import { useSessionStore } from '../stores/useSessionStore';
import { transcribe } from '../services/stt';
import { speak } from '../services/tts';
import { saveOnboarding } from '../services/settings';
import { supabase } from '../lib/supabase';

type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

const HINT_TEXT: Record<VoiceStatus, string> = {
  idle: 'Tap to speak',
  listening: 'Listening... tap to send',
  processing: 'Processing...',
  speaking: 'Speaking...',
};

const TARGET_LANGUAGES = [
  { code: 'en', label: 'English', flag: '🇺🇸' },
  { code: 'de', label: 'Deutsch', flag: '🇩🇪' },
];

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];

interface Props {
  onNavigateRoleplay: () => void;
  onNavigateSRS: () => void;
  onToggleTheme: () => void;
}

export const HomeScreen: React.FC<Props> = ({
  onNavigateRoleplay,
  onNavigateSRS,
  onToggleTheme,
}) => {
  const { isDark, colors } = useTheme();
  const { user, settings, loadSettings } = useUserStore();
  const { startRecording, stopRecording } = useVoiceRecording();
  const { isActive, startSession, persistTurn, endSession } = useSessionStore();

  const lang = settings?.active_language ?? 'en';
  const level = settings?.active_level ?? 'B1';

  // Voice state
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const activeSoundRef = useRef<Audio.Sound | null>(null);

  // Lang/level picker modal
  const [showPicker, setShowPicker] = useState(false);
  const [pickerLang, setPickerLang] = useState(lang);
  const [pickerLevel, setPickerLevel] = useState(level);
  const [savingLang, setSavingLang] = useState(false);

  // Animations
  const mountOpacity = useRef(new Animated.Value(0)).current;
  const mountTranslateY = useRef(new Animated.Value(24)).current;
  const breathScale = useRef(new Animated.Value(1)).current;
  const sonarScale = useRef(new Animated.Value(0.6)).current;
  const sonarOpacity = useRef(new Animated.Value(0.5)).current;
  const micPressScale = useRef(new Animated.Value(1)).current;
  const sonarLoopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    Animated.parallel([
      Animated.timing(mountOpacity, { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(mountTranslateY, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, { toValue: 1.08, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathScale, { toValue: 1.0, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();

    startSonar(2200);
  }, []);

  useEffect(() => {
    const speed = voiceStatus === 'listening' || voiceStatus === 'speaking' ? 800 : 2200;
    startSonar(speed);
  }, [voiceStatus]);

  // Sync picker with current settings when opening
  useEffect(() => {
    if (showPicker) {
      setPickerLang(lang);
      setPickerLevel(level);
    }
  }, [showPicker]);

  const startSonar = (duration: number) => {
    sonarLoopRef.current?.stop();
    sonarScale.setValue(0.6);
    sonarOpacity.setValue(0.5);
    sonarLoopRef.current = Animated.loop(
      Animated.parallel([
        Animated.timing(sonarScale, { toValue: 2.2, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(sonarOpacity, { toValue: 0.4, duration: 300, useNativeDriver: true }),
          Animated.timing(sonarOpacity, { toValue: 0, duration: duration - 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    );
    sonarLoopRef.current.start();
  };

  // ── Voice: TAP-TOGGLE (first tap = start, second tap = stop + process) ──
  const handleMicPress = async () => {
    if (voiceStatus === 'idle') {
      await handleStartListening();
    } else if (voiceStatus === 'listening') {
      await handleStopAndProcess();
    }
    // ignore taps while processing or speaking
  };

  const handleStartListening = async () => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setVoiceStatus('listening');
      await startRecording();
    } catch (err) {
      console.warn('[Mic] startRecording error:', err);
      setVoiceStatus('idle');
    }
  };

  const handleStopAndProcess = async () => {
    try {
      const result = await stopRecording();

      if (!result) {
        // < 2s — discard silently
        console.log('[Mic] Audio too short, discarding');
        setVoiceStatus('idle');
        return;
      }

      setVoiceStatus('processing');
      console.log('[Voice] Transcribing...', result.durationMs, 'ms');

      const userText = await transcribe(result.uri, lang);
      console.log('[Voice] Transcribed:', userText);

      if (!isActive) {
        await startSession(lang, level, 'free');
      }
      const currentSessionId = useSessionStore.getState().sessionId;
      persistTurn('user', userText);

      const { data, error } = await supabase.functions.invoke('chat-turn', {
        body: { session_id: currentSessionId ?? 'no-session', user_text: userText, lang, level },
      });

      if (error || !data?.ai_text) {
        throw new Error(error?.message ?? 'No response from AI');
      }

      console.log('[Voice] AI:', data.ai_text);

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      setVoiceStatus('speaking');

      if (activeSoundRef.current) {
        await activeSoundRef.current.stopAsync();
        await activeSoundRef.current.unloadAsync();
        activeSoundRef.current = null;
      }

      const audioPath = await speak(data.ai_text, lang);
      const { sound } = await Audio.Sound.createAsync({ uri: audioPath });
      activeSoundRef.current = sound;

      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded && status.didJustFinish) {
          sound.unloadAsync();
          activeSoundRef.current = null;
          setVoiceStatus('idle');
        }
      });

      await sound.playAsync();
      persistTurn('ai', data.ai_text);
    } catch (err) {
      console.warn('[Voice] Error:', err);
      setVoiceStatus('idle');
    }
  };

  // ── Lang/level picker ──
  const handleSaveLang = async () => {
    if (!user || !pickerLang || !pickerLevel) return;
    setSavingLang(true);
    try {
      await saveOnboarding(user.id, settings?.native_language ?? 'es', pickerLang, pickerLevel);
      await loadSettings();
      setShowPicker(false);
    } catch (err) {
      console.warn('[LangPicker] save error:', err);
    } finally {
      setSavingLang(false);
    }
  };

  const micScale = Animated.multiply(breathScale, micPressScale);
  const isMicActive = voiceStatus !== 'idle';

  const micColor =
    voiceStatus === 'listening' ? colors.danger :
    voiceStatus === 'speaking'  ? colors.success :
    colors.accent;

  return (
    <Animated.View style={[styles.container, { backgroundColor: colors.background, opacity: mountOpacity, transform: [{ translateY: mountTranslateY }] }]}>

      {/* ── Header ── */}
      <View style={styles.header}>
        {/* Streak pill — long-press to toggle theme */}
        <TouchableOpacity
          style={[styles.streakPill, { backgroundColor: colors.surface }]}
          onLongPress={onToggleTheme}
          delayLongPress={600}
          activeOpacity={0.8}
        >
          <Text style={styles.streakText}>🔥 3</Text>
        </TouchableOpacity>

        {/* Lang + level pill — tap to open selector */}
        <TouchableOpacity
          style={[styles.langPill, { backgroundColor: colors.surface, borderColor: colors.border }]}
          onPress={() => setShowPicker(true)}
          activeOpacity={0.8}
        >
          <Text style={[styles.langText, { color: colors.text }]}>
            {lang.toUpperCase()}
          </Text>
          <View style={[styles.levelBadge, { backgroundColor: colors.accent + '33' }]}>
            <Text style={[styles.levelText, { color: colors.accent }]}>{level}</Text>
          </View>
          <Ionicons name="chevron-down" size={12} color={colors.textMuted} style={{ marginLeft: 2 }} />
        </TouchableOpacity>
      </View>

      {/* ── Center: mic button ── */}
      <View style={styles.center}>
        <Animated.View pointerEvents="none" style={[styles.sonarRing, { borderColor: isMicActive ? colors.accentLight : colors.accent, transform: [{ scale: sonarScale }], opacity: sonarOpacity }]} />

        <TouchableOpacity
          onPress={handleMicPress}
          onPressIn={() => Animated.spring(micPressScale, { toValue: 0.91, useNativeDriver: true, speed: 20, bounciness: 4 }).start()}
          onPressOut={() => Animated.spring(micPressScale, { toValue: 1.0, useNativeDriver: true, speed: 20, bounciness: 8 }).start()}
          disabled={voiceStatus === 'processing' || voiceStatus === 'speaking'}
          activeOpacity={1}
        >
          <Animated.View style={[styles.micButton, { backgroundColor: micColor, transform: [{ scale: micScale }] }]}>
            <Ionicons
              name={voiceStatus === 'processing' ? 'hourglass-outline' : voiceStatus === 'listening' ? 'stop' : 'mic'}
              size={42}
              color="#fff"
            />
          </Animated.View>
        </TouchableOpacity>

        <Text style={[styles.hint, { color: isMicActive ? colors.text : colors.textMuted }]}>
          {HINT_TEXT[voiceStatus]}
        </Text>
      </View>

      {/* ── Edge nav buttons ── */}
      <TouchableOpacity style={[styles.edgeBtn, styles.edgeBtnLeft, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onNavigateRoleplay} activeOpacity={0.75}>
        <Ionicons name="chatbubbles-outline" size={22} color={colors.text} />
      </TouchableOpacity>
      <TouchableOpacity style={[styles.edgeBtn, styles.edgeBtnRight, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={onNavigateSRS} activeOpacity={0.75}>
        <Ionicons name="library-outline" size={22} color={colors.text} />
      </TouchableOpacity>

      {/* ── End session button ── */}
      {isActive && (
        <TouchableOpacity style={[styles.endBtn, { backgroundColor: colors.danger + '26', borderColor: colors.danger + '55' }]} onPress={endSession} activeOpacity={0.8}>
          <Text style={[styles.endBtnText, { color: colors.danger }]}>End session</Text>
        </TouchableOpacity>
      )}

      {/* ── YouTube pill ── */}
      <TouchableOpacity style={[styles.ytPill, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => Linking.openURL('https://www.youtube.com')} activeOpacity={0.8}>
        <Ionicons name="logo-youtube" size={16} color="#FF0000" />
        <Text style={[styles.ytText, { color: colors.textMuted }]}>Watch & learn</Text>
      </TouchableOpacity>

      {/* ── Theme toggle hint ── */}
      <Text style={[styles.themeHint, { color: colors.textMuted }]}>
        {isDark ? '☀️' : '🌙'} long-press streak to toggle theme
      </Text>

      {/* ── Lang / Level picker modal ── */}
      <Modal visible={showPicker} animationType="slide" transparent presentationStyle="overFullScreen">
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { backgroundColor: colors.surfaceSolid }]}>
            <Text style={[styles.modalTitle, { color: colors.text }]}>Language & Level</Text>

            <Text style={[styles.modalLabel, { color: colors.textMuted }]}>LANGUAGE</Text>
            <View style={styles.chipRow}>
              {TARGET_LANGUAGES.map(l => (
                <TouchableOpacity
                  key={l.code}
                  style={[styles.chip, { borderColor: pickerLang === l.code ? colors.accent : colors.border, backgroundColor: pickerLang === l.code ? colors.accent + '22' : colors.surface }]}
                  onPress={() => setPickerLang(l.code)}
                >
                  <Text style={[styles.chipText, { color: pickerLang === l.code ? colors.text : colors.textMuted }]}>
                    {l.flag} {l.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={[styles.modalLabel, { color: colors.textMuted, marginTop: 20 }]}>CEFR LEVEL</Text>
            <View style={styles.chipRow}>
              {LEVELS.map(lv => (
                <TouchableOpacity
                  key={lv}
                  style={[styles.chip, { borderColor: pickerLevel === lv ? colors.accent : colors.border, backgroundColor: pickerLevel === lv ? colors.accent + '22' : colors.surface }]}
                  onPress={() => setPickerLevel(lv)}
                >
                  <Text style={[styles.chipText, { color: pickerLevel === lv ? colors.text : colors.textMuted }]}>{lv}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={styles.modalActions}>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => setShowPicker(false)}>
                <Text style={[styles.modalBtnText, { color: colors.textMuted }]}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.modalBtn, { backgroundColor: colors.accent }]} onPress={handleSaveLang} disabled={savingLang}>
                {savingLang ? <ActivityIndicator color="#fff" size="small" /> : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { position: 'absolute', top: 20, left: 20, right: 20, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  streakPill: { paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20 },
  streakText: { fontSize: 14, fontWeight: '600' },
  langPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1 },
  langText: { fontSize: 14, fontWeight: '700' },
  levelBadge: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
  levelText: { fontSize: 12, fontWeight: '700' },
  center: { alignItems: 'center', justifyContent: 'center' },
  sonarRing: { position: 'absolute', width: 100, height: 100, borderRadius: 50, borderWidth: 2 },
  micButton: { width: 100, height: 100, borderRadius: 50, alignItems: 'center', justifyContent: 'center', shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.35, shadowRadius: 16, elevation: 12 },
  hint: { marginTop: 20, fontSize: 14, letterSpacing: 0.3 },
  edgeBtn: { position: 'absolute', top: '50%', width: 48, height: 48, borderRadius: 24, alignItems: 'center', justifyContent: 'center', borderWidth: 1, marginTop: -24 },
  edgeBtnLeft: { left: 16 },
  edgeBtnRight: { right: 16 },
  endBtn: { position: 'absolute', bottom: 90, paddingHorizontal: 20, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  endBtnText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  ytPill: { position: 'absolute', bottom: 36, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 24, borderWidth: 1 },
  ytText: { fontSize: 13, fontWeight: '500' },
  themeHint: { position: 'absolute', bottom: 10, fontSize: 10, opacity: 0.5 },
  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  modalSheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 28, paddingBottom: 48 },
  modalTitle: { fontSize: 18, fontWeight: '700', marginBottom: 24 },
  modalLabel: { fontSize: 11, fontWeight: '700', letterSpacing: 1, marginBottom: 10 },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 50, borderWidth: 1 },
  chipText: { fontSize: 14, fontWeight: '600' },
  modalActions: { flexDirection: 'row', gap: 10, marginTop: 32 },
  modalBtn: { flex: 1, paddingVertical: 14, borderRadius: 14, alignItems: 'center', borderWidth: 1, borderColor: 'transparent' },
  modalBtnText: { fontSize: 15, fontWeight: '600' },
});









