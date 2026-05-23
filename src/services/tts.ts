import * as FileSystem from 'expo-file-system/legacy';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

// Map language code to a suitable OpenAI TTS voice
const VOICE_MAP: Record<string, string> = {
  en: 'nova',
  de: 'onyx',
};

export const speak = async (text: string, lang: string): Promise<string> => {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_OPENAI_API_KEY no configurada');

  const voice = VOICE_MAP[lang] ?? 'nova';

  const res = await fetch(OPENAI_TTS_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text,
      voice,
      response_format: 'mp3',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS error ${res.status}: ${err}`);
  }

  const buffer = await res.arrayBuffer();
  const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
  const path = `${FileSystem.cacheDirectory}tts_${Date.now()}.mp3`;

  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  return path;
};

function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}
