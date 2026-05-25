import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  TouchableWithoutFeedback,
  TextInput,
  StyleSheet,
  Animated,
  Easing,
  Modal,
  ActivityIndicator,
  Keyboard,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import { Audio } from 'expo-av';
import * as Haptics from 'expo-haptics';
// Reanimated — keyboard sync con shared values (evita race con runtime init)
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '../hooks/useTheme';
import { useVoiceRecording } from '../hooks/useVoiceRecording';
import { useUserStore } from '../stores/useUserStore';
import { useSessionStore } from '../stores/useSessionStore';
import { transcribe } from '../services/stt';
import { speak } from '../services/tts';
import { saveOnboarding } from '../services/settings';
import { supabase } from '../lib/supabase';

// ── Constantes de diseño ───────────────────────────────────────────────────────
const MIC_SIZE          = 159;   // Figma spec: squircle 159×159
const MIC_RADIUS        = 60;    // Figma spec: cornerRadius 60
const HEADER_BTN_SIZE   = 44;
const HEADER_BTN_RADIUS = 14;

// ── Tipos ─────────────────────────────────────────────────────────────────────
type VoiceStatus = 'idle' | 'listening' | 'processing' | 'speaking';

const HINT_TEXT: Record<VoiceStatus, string> = {
  idle:       'Tap to speak',
  listening:  'Listening… tap to send',
  processing: 'Processing…',
  speaking:   'Speaking…',
};

const MIC_ICON: Record<VoiceStatus, React.ComponentProps<typeof Ionicons>['name']> = {
  idle:       'mic',
  listening:  'stop',
  processing: 'hourglass-outline',
  speaking:   'radio-outline',
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

// ── GlassLayers ───────────────────────────────────────────────────────────────
// BlurView intenso (36/48) + fill semi-transparente + sombra exterior.
// El parent DEBE tener overflow:'hidden' y el borderRadius correspondiente.
interface GlassLayersProps {
  isDark:        boolean;
  fillAlpha?:    number;   // override del fill semi-transparente
  blurIntensity?: number;  // override de la intensidad del blur
}
const GlassLayers: React.FC<GlassLayersProps> = ({
  isDark,
  fillAlpha,
  blurIntensity,
}) => {
  const intensity = blurIntensity ?? (isDark ? 36 : 48);
  const darkFill  = `rgba(255,255,255,${fillAlpha ?? 0.12})`;
  const lightFill = `rgba(0,0,0,${fillAlpha ?? 0.08})`;
  return (
    <>
      {/* Blur de fondo — efecto humo/glass */}
      <BlurView
        intensity={intensity}
        tint={isDark ? 'dark' : 'light'}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {/* Fill semi-transparente sobre el blur */}
      <View
        style={[StyleSheet.absoluteFill, {
          backgroundColor: isDark ? darkFill : lightFill,
        }]}
        pointerEvents="none"
      />
    </>
  );
};

// ── HeaderBtnBorder ───────────────────────────────────────────────────────────
// Borde glass theme-aware renderizado por encima del BlurView.
const HeaderBtnBorder: React.FC<{ isDark: boolean; radius?: number }> = ({
  isDark,
  radius = HEADER_BTN_RADIUS,
}) => (
  <View
    style={[StyleSheet.absoluteFillObject, {
      borderRadius: radius,
      borderWidth:  StyleSheet.hairlineWidth * 2,
      borderColor:  isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)',
    }]}
    pointerEvents="none"
  />
);

// ── Componente principal ───────────────────────────────────────────────────────
export const HomeScreen: React.FC<Props> = ({
  onNavigateRoleplay: _onNavigateRoleplay,
  onNavigateSRS: _onNavigateSRS,
  onToggleTheme,
}) => {
  const { isDark, colors } = useTheme();
  const insets = useSafeAreaInsets();
  const { user, settings, loadSettings } = useUserStore();
  const { startRecording, stopRecording } = useVoiceRecording();
  const { isActive, startSession, persistTurn, endSession } = useSessionStore();

  const lang  = settings?.active_language ?? 'en';
  const level = settings?.active_level    ?? 'B1';

  // ── Estado ─────────────────────────────────────────────────────────────────
  const [voiceStatus, setVoiceStatus] = useState<VoiceStatus>('idle');
  const activeSoundRef = useRef<Audio.Sound | null>(null);

  const [ytUrl,       setYtUrl]       = useState('');
  const [showPicker,  setShowPicker]  = useState(false);
  const [pickerLang,  setPickerLang]  = useState(lang);
  const [pickerLevel, setPickerLevel] = useState(level);
  const [savingLang,  setSavingLang]  = useState(false);

  // ── Animaciones (old Animated — mount, breathe, sonar, press) ──────────────
  const mountOpacity    = useRef(new Animated.Value(0)).current;
  const mountTranslateY = useRef(new Animated.Value(24)).current;
  const breathScale     = useRef(new Animated.Value(1)).current;
  const sonarScale      = useRef(new Animated.Value(0.6)).current;
  const sonarOpacity    = useRef(new Animated.Value(0.5)).current;
  const micPressScale   = useRef(new Animated.Value(1)).current;
  const sonarLoopRef    = useRef<Animated.CompositeAnimation | null>(null);

  // ── Keyboard sync (Reanimated shared values + Platform listeners) ────────────
  // Usamos useSharedValue en lugar de useAnimatedKeyboard porque este último
  // llama subscribeForKeyboardEvents() síncronamente durante render, lo que
  // produce una race condition con el runtime de Reanimated en New Architecture
  // (Expo 54 / RN 0.76+) → "Exception in HostFunction: runtime not ready".
  const kbHeight = useSharedValue(0);

  const ytKeyboardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kbHeight.get() }],
  }));

  const centerKeyboardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: -kbHeight.get() * 0.25 }],
  }));

  // ── Keyboard listeners → shared value ─────────────────────────────────────
  // Los listeners escriben en kbHeight (shared value); las animated styles
  // lo leen en el UI thread → sin jank, sin re-render de React.
  useEffect(() => {
    const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const onShow = Keyboard.addListener(showEvt, (e) => {
      kbHeight.set(e.endCoordinates.height);
    });
    const onHide = Keyboard.addListener(hideEvt, () => {
      kbHeight.set(0);
    });
    return () => { onShow.remove(); onHide.remove(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Mount + breathe ────────────────────────────────────────────────────────
  useEffect(() => {
    Animated.parallel([
      Animated.timing(mountOpacity,    { toValue: 1, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
      Animated.timing(mountTranslateY, { toValue: 0, duration: 700, easing: Easing.out(Easing.quad), useNativeDriver: true }),
    ]).start();

    Animated.loop(
      Animated.sequence([
        Animated.timing(breathScale, { toValue: 1.04, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
        Animated.timing(breathScale, { toValue: 1.00, duration: 900, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
      ]),
    ).start();

    startSonar(2200);
  }, []);

  useEffect(() => {
    startSonar(voiceStatus === 'listening' || voiceStatus === 'speaking' ? 800 : 2200);
  }, [voiceStatus]);

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
        Animated.timing(sonarScale,   { toValue: 2.2, duration, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        Animated.sequence([
          Animated.timing(sonarOpacity, { toValue: 0.35, duration: 300, useNativeDriver: true }),
          Animated.timing(sonarOpacity, { toValue: 0,    duration: duration - 300, easing: Easing.out(Easing.quad), useNativeDriver: true }),
        ]),
      ]),
    );
    sonarLoopRef.current.start();
  };

  // ── Voice handlers ─────────────────────────────────────────────────────────
  const handleMicPress = async () => {
    Keyboard.dismiss();
    if (voiceStatus === 'idle')           await handleStartListening();
    else if (voiceStatus === 'listening') await handleStopAndProcess();
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
      if (!result) { setVoiceStatus('idle'); return; }

      setVoiceStatus('processing');
      const userText = await transcribe(result.uri, lang);

      if (!isActive) await startSession(lang, level, 'free');
      const currentSessionId = useSessionStore.getState().sessionId;
      persistTurn('user', userText);

      const { data, error } = await supabase.functions.invoke('chat-turn', {
        body: { session_id: currentSessionId ?? 'no-session', user_text: userText, lang, level },
      });
      if (error || !data?.ai_text) throw new Error(error?.message ?? 'No response from AI');

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

  // ── Lang/level picker ──────────────────────────────────────────────────────
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

  // ── Derivados ──────────────────────────────────────────────────────────────
  const micScale    = Animated.multiply(breathScale, micPressScale);
  const isMicActive = voiceStatus !== 'idle';

  const sonarColor =
    voiceStatus === 'listening' ? colors.danger  :
    voiceStatus === 'speaking'  ? colors.success :
    isDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.12)';

  const micIconColor =
    voiceStatus === 'listening' ? colors.danger  :
    voiceStatus === 'speaking'  ? colors.success :
    colors.text;

  const micBorderColor =
    voiceStatus === 'listening' ? colors.danger :
    isDark ? 'rgba(255,255,255,0.22)' : 'rgba(0,0,0,0.12)';

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss} accessible={false}>
      <Animated.View
        style={[
          styles.container,
          {
            backgroundColor: 'transparent',
            opacity:          mountOpacity,
            transform:        [{ translateY: mountTranslateY }],
          },
        ]}
      >

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <View style={[styles.header, { top: insets.top + 12 }]}>

          {/* Izquierda: settings → lang/level picker */}
          <TouchableOpacity
            style={[styles.headerBtn, styles.headerBtnShadow, { overflow: 'hidden' }]}
            onPress={() => setShowPicker(true)}
            activeOpacity={0.75}
          >
            <GlassLayers isDark={isDark} />
            <HeaderBtnBorder isDark={isDark} />
            <Ionicons name="settings-outline" size={18} color={colors.text} />
          </TouchableOpacity>

          {/* Derecha: racha + theme toggle */}
          <View style={styles.headerRight}>
            <View style={[styles.headerBtn, styles.headerBtnShadow, { overflow: 'hidden' }]}>
              <GlassLayers isDark={isDark} />
              <HeaderBtnBorder isDark={isDark} />
              <Text style={[styles.streakNumber, { color: colors.text }]}>3</Text>
            </View>

            <TouchableOpacity
              style={[styles.headerBtn, styles.headerBtnShadow, { overflow: 'hidden' }]}
              onPress={onToggleTheme}
              activeOpacity={0.75}
            >
              <GlassLayers isDark={isDark} />
              <HeaderBtnBorder isDark={isDark} />
              <Ionicons
                name={isDark ? 'sunny-outline' : 'moon-outline'}
                size={18}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── Contenido central — sube 0.25× cuando aparece el teclado ─────── */}
        <Reanimated.View style={centerKeyboardStyle}>
          <View style={styles.center}>

            {/* Contenedor fijo MIC_SIZE×MIC_SIZE — sonar se ancla aquí */}
            <View style={styles.micContainer}>

              {/* Sonar ring */}
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.sonarRing,
                  {
                    borderColor: sonarColor,
                    transform:   [{ scale: sonarScale }],
                    opacity:     sonarOpacity,
                  },
                ]}
              />

              {/* Mic squircle — scale = breathe × press */}
              <Animated.View style={{ transform: [{ scale: micScale }] }}>
                <TouchableOpacity
                  onPress={handleMicPress}
                  onPressIn={() =>
                    Animated.spring(micPressScale, { toValue: 0.93, useNativeDriver: true, speed: 20, bounciness: 4 }).start()
                  }
                  onPressOut={() =>
                    Animated.spring(micPressScale, { toValue: 1.0, useNativeDriver: true, speed: 20, bounciness: 8 }).start()
                  }
                  disabled={voiceStatus === 'processing' || voiceStatus === 'speaking'}
                  activeOpacity={1}
                  style={[
                    styles.micSquircle,
                    {
                      overflow:    'hidden',
                      borderColor: micBorderColor,
                      // Drop shadow bajo el mic
                      shadowColor: isDark ? '#000' : 'rgba(0,0,0,0.35)',
                    },
                  ]}
                >
                  {/* Glass — blur fuerte + fill más opaco para el mic */}
                  <GlassLayers
                    isDark={isDark}
                    fillAlpha={
                      voiceStatus === 'listening'
                        ? isDark ? 0.20 : 0.12
                        : isDark ? 0.15 : 0.10
                    }
                    blurIntensity={isDark ? 40 : 50}
                  />
                  {/* Tinte terracota cuando está escuchando */}
                  {voiceStatus === 'listening' && (
                    <View
                      style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(125,46,17,0.12)' }]}
                      pointerEvents="none"
                    />
                  )}
                  <Ionicons name={MIC_ICON[voiceStatus]} size={22} color={micIconColor} />
                </TouchableOpacity>
              </Animated.View>
            </View>

            {/* Hint de estado */}
            <Text style={[styles.hint, { color: isMicActive ? colors.text : colors.textMuted }]}>
              {HINT_TEXT[voiceStatus]}
            </Text>

            {/* Lang + level → abre picker */}
            <TouchableOpacity onPress={() => setShowPicker(true)} activeOpacity={0.6}>
              <Text style={[styles.langDisplay, { color: colors.textMuted }]}>
                {lang.toUpperCase()} · {level}
              </Text>
            </TouchableOpacity>
          </View>
        </Reanimated.View>

        {/* ── End session ──────────────────────────────────────────────────── */}
        {isActive && (
          <TouchableOpacity
            style={[
              styles.endBtn,
              { backgroundColor: colors.danger + '26', borderColor: colors.danger + '55' },
            ]}
            onPress={endSession}
            activeOpacity={0.8}
          >
            <Text style={[styles.endBtnText, { color: colors.danger }]}>End session</Text>
          </TouchableOpacity>
        )}

        {/* ── YouTube URL — sube por la altura completa del teclado ─────────── */}
        <Reanimated.View style={[styles.ytContainer, { bottom: 20 + insets.bottom }, ytKeyboardStyle]}>
          {/* Glass */}
          <GlassLayers isDark={isDark} />
          {/* Border overlay */}
          <View
            style={[StyleSheet.absoluteFill, {
              borderRadius: 20,
              borderWidth:  StyleSheet.hairlineWidth * 2,
              borderColor:  isDark ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.09)',
            }]}
            pointerEvents="none"
          />
          {/* Contenido — renderizado sobre las capas absolutas */}
          <Ionicons name="logo-youtube" size={15} color="#FF3B30" style={styles.ytIcon} />
          <TextInput
            style={[styles.ytInput, { color: colors.text }]}
            placeholder="Paste YouTube URL…"
            placeholderTextColor={colors.textMuted}
            value={ytUrl}
            onChangeText={setYtUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            returnKeyType="go"
            onSubmitEditing={() => {
              if (ytUrl.trim()) console.log('[YouTube] Extract:', ytUrl.trim());
            }}
          />
          {ytUrl.length > 0 && (
            <TouchableOpacity
              style={[styles.ytExtractBtn, { backgroundColor: colors.accent }]}
              onPress={() => console.log('[YouTube] Extract:', ytUrl.trim())}
              activeOpacity={0.8}
            >
              <Text style={styles.ytExtractText}>Extraer</Text>
            </TouchableOpacity>
          )}
        </Reanimated.View>

        {/* ── Lang / Level picker modal ─────────────────────────────────────── */}
        <Modal
          visible={showPicker}
          animationType="slide"
          transparent
          presentationStyle="overFullScreen"
        >
          <TouchableWithoutFeedback onPress={() => setShowPicker(false)}>
            <View style={styles.modalOverlay}>
              <TouchableWithoutFeedback onPress={() => { /* stop propagation */ }}>
                <View style={[styles.modalSheet, { backgroundColor: colors.surfaceSolid }]}>
                  <Text style={[styles.modalTitle, { color: colors.text }]}>Language & Level</Text>

                  <Text style={[styles.modalLabel, { color: colors.textMuted }]}>LANGUAGE</Text>
                  <View style={styles.chipRow}>
                    {TARGET_LANGUAGES.map(l => (
                      <TouchableOpacity
                        key={l.code}
                        style={[
                          styles.chip,
                          {
                            borderColor:     pickerLang === l.code ? colors.accent : colors.border,
                            backgroundColor: pickerLang === l.code ? colors.accent + '22' : colors.surface,
                          },
                        ]}
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
                        style={[
                          styles.chip,
                          {
                            borderColor:     pickerLevel === lv ? colors.accent : colors.border,
                            backgroundColor: pickerLevel === lv ? colors.accent + '22' : colors.surface,
                          },
                        ]}
                        onPress={() => setPickerLevel(lv)}
                      >
                        <Text style={[styles.chipText, { color: pickerLevel === lv ? colors.text : colors.textMuted }]}>
                          {lv}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  <View style={styles.modalActions}>
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: colors.surface, borderColor: colors.border }]}
                      onPress={() => setShowPicker(false)}
                    >
                      <Text style={[styles.modalBtnText, { color: colors.textMuted }]}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={[styles.modalBtn, { backgroundColor: colors.accent }]}
                      onPress={handleSaveLang}
                      disabled={savingLang}
                    >
                      {savingLang
                        ? <ActivityIndicator color="#fff" size="small" />
                        : <Text style={[styles.modalBtnText, { color: '#fff' }]}>Save</Text>
                      }
                    </TouchableOpacity>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </Modal>

      </Animated.View>
    </TouchableWithoutFeedback>
  );
};

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({

  // Raíz — transparente para que el BackgroundBlob de App.tsx sea visible
  container: {
    flex:           1,
    alignItems:     'center',
    justifyContent: 'center',
    overflow:       'visible',
  },

  // ── Header ──────────────────────────────────────────────────────────────────
  header: {
    position:       'absolute',
    top:            20,   // overridden inline with insets.top + 12
    left:           20,
    right:          20,
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
  },
  headerRight: {
    flexDirection: 'row',
    gap:           8,
  },
  headerBtn: {
    width:          HEADER_BTN_SIZE,
    height:         HEADER_BTN_SIZE,
    borderRadius:   HEADER_BTN_RADIUS,
    alignItems:     'center',
    justifyContent: 'center',
  },
  // Drop + inner shadow para los botones del header
  headerBtnShadow: {
    shadowColor:    '#000',
    shadowOffset:   { width: 0, height: 4 },
    shadowOpacity:  0.18,
    shadowRadius:   10,
    elevation:      6,
  },
  streakNumber: {
    fontFamily:    'DarkerGrotesque_700Bold',
    fontSize:      15,
    letterSpacing: -0.3,
  },

  // ── Centro ──────────────────────────────────────────────────────────────────
  center: {
    alignItems:     'center',
    justifyContent: 'center',
  },

  // Contenedor fijo — el sonar siempre se centra sobre el mic
  micContainer: {
    width:          MIC_SIZE,
    height:         MIC_SIZE,
    alignItems:     'center',
    justifyContent: 'center',
  },

  sonarRing: {
    position:     'absolute',
    top:          0,
    left:         0,
    width:        MIC_SIZE,
    height:       MIC_SIZE,
    borderRadius: MIC_RADIUS,
    borderWidth:  1.5,
  },

  // Mic squircle — 159×159 cornerRadius 60
  micSquircle: {
    width:          MIC_SIZE,
    height:         MIC_SIZE,
    borderRadius:   MIC_RADIUS,
    borderWidth:    1,
    alignItems:     'center',
    justifyContent: 'center',
    // Drop shadow pronunciado — "flota" sobre el fondo
    shadowOffset:  { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius:  30,
    elevation:     20,
  },

  hint: {
    marginTop:     24,
    fontSize:      14,
    letterSpacing: 0.3,
    fontFamily:    'DarkerGrotesque_400Regular',
  },
  langDisplay: {
    marginTop:     6,
    fontSize:      12,
    letterSpacing: 0.6,
    fontFamily:    'DarkerGrotesque_400Regular',
    opacity:       0.55,
  },

  // ── End session ─────────────────────────────────────────────────────────────
  endBtn: {
    position:          'absolute',
    bottom:            100,
    paddingHorizontal: 20,
    paddingVertical:   8,
    borderRadius:      20,
    borderWidth:       1,
  },
  endBtnText: {
    fontSize:      13,
    fontWeight:    '600',
    letterSpacing: 0.3,
  },

  // ── YouTube input ────────────────────────────────────────────────────────────
  ytContainer: {
    position:          'absolute',
    left:              32,
    right:             32,
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 14,
    paddingVertical:   10,
    borderRadius:      20,
    overflow:          'hidden',
    // Sombra suave para la barra inferior
    shadowColor:       '#000',
    shadowOffset:      { width: 0, height: 4 },
    shadowOpacity:     0.14,
    shadowRadius:      12,
    elevation:         8,
  },
  ytIcon: {
    marginRight: 8,
  },
  ytInput: {
    flex:            1,
    fontSize:        13,
    fontFamily:      'DarkerGrotesque_400Regular',
    letterSpacing:   0.1,
    paddingVertical: 0,
  },
  ytExtractBtn: {
    marginLeft:        10,
    paddingHorizontal: 12,
    paddingVertical:   6,
    borderRadius:      10,
  },
  ytExtractText: {
    fontSize:      12,
    fontWeight:    '700',
    color:         '#fff',
    letterSpacing: 0.2,
  },

  // ── Modal lang/level ─────────────────────────────────────────────────────────
  modalOverlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.50)',
    justifyContent:  'flex-end',
  },
  modalSheet: {
    borderTopLeftRadius:  24,
    borderTopRightRadius: 24,
    padding:              28,
    paddingBottom:        48,
  },
  modalTitle: {
    fontSize:     18,
    fontWeight:   '700',
    marginBottom: 24,
  },
  modalLabel: {
    fontSize:      11,
    fontWeight:    '700',
    letterSpacing: 1,
    marginBottom:  10,
  },
  chipRow: {
    flexDirection: 'row',
    flexWrap:      'wrap',
    gap:           8,
  },
  chip: {
    paddingHorizontal: 16,
    paddingVertical:   9,
    borderRadius:      50,
    borderWidth:       1,
  },
  chipText: {
    fontSize:   14,
    fontWeight: '600',
  },
  modalActions: {
    flexDirection: 'row',
    gap:           10,
    marginTop:     32,
  },
  modalBtn: {
    flex:            1,
    paddingVertical: 14,
    borderRadius:    14,
    alignItems:      'center',
    borderWidth:     1,
    borderColor:     'transparent',
  },
  modalBtnText: {
    fontSize:   15,
    fontWeight: '600',
  },
});
