import { useState, useRef, useEffect } from 'react';
import { Audio } from 'expo-av';

type RecordingStatus = 'idle' | 'recording';

interface RecordingResult {
  uri: string;
  durationMs: number;
}

interface UseVoiceRecording {
  status: RecordingStatus;
  startRecording: () => Promise<void>;
  stopRecording: () => Promise<RecordingResult | null>;
}

export const useVoiceRecording = (): UseVoiceRecording => {
  const [status, setStatus] = useState<RecordingStatus>('idle');
  const recordingRef = useRef<Audio.Recording | null>(null);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recordingRef.current) {
        recordingRef.current.stopAndUnloadAsync().catch(() => {});
      }
    };
  }, []);

  const startRecording = async (): Promise<void> => {
    const { granted } = await Audio.requestPermissionsAsync();
    if (!granted) return;

    await Audio.setAudioModeAsync({
      allowsRecordingIOS: true,
      playsInSilentModeIOS: true,
    });

    const recording = new Audio.Recording();
    await recording.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
    await recording.startAsync();

    recordingRef.current = recording;
    setStatus('recording');
  };

  const stopRecording = async (): Promise<RecordingResult | null> => {
    const recording = recordingRef.current;
    if (!recording) return null;

    try {
      const statusInfo = await recording.getStatusAsync();
      await recording.stopAndUnloadAsync();
      recordingRef.current = null;

      // setAudioModeAsync REEMPLAZA el objeto de modo entero: pasar solo
      // allowsRecordingIOS revertía playsInSilentModeIOS a false, y entonces la
      // respuesta TTS no sonaba si el switch de silencio del iPhone estaba puesto
      // (la UI decía "Speaking..." en silencio absoluto).
      await Audio.setAudioModeAsync({
        allowsRecordingIOS:   false,
        playsInSilentModeIOS: true,
      });

      const durationMs = statusInfo.isRecording ? statusInfo.durationMillis ?? 0 : 0;

      // Discard silently if under 2 seconds — never call APIs with short clips
      if (durationMs < 2000) return null;

      const uri = recording.getURI();
      if (!uri) return null;

      return { uri, durationMs };
    } finally {
      setStatus('idle');
    }
  };

  return { status, startRecording, stopRecording };
};
