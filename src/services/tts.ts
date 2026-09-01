import * as FileSystem from 'expo-file-system/legacy';

const OPENAI_TTS_URL = 'https://api.openai.com/v1/audio/speech';

/**
 * Techo para la petición de TTS. Sin él, un fetch colgado deja la máquina de
 * estados de voz varada en 'preparing' sin ninguna salida.
 */
const TTS_TIMEOUT_MS = 20000;

/** fetch con AbortController — rechaza en vez de colgarse para siempre. */
async function fetchTTS(apiKey: string, text: string, voice: string): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TTS_TIMEOUT_MS);
  try {
    return await fetch(OPENAI_TTS_URL, {
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
      signal: controller.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') {
      throw new Error(`TTS timeout after ${TTS_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

// Map language code to a suitable OpenAI TTS voice
const VOICE_MAP: Record<string, string> = {
  en: 'nova',
  de: 'onyx',
};

export const speak = async (text: string, lang: string): Promise<string> => {
  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_OPENAI_API_KEY no configurada');

  const voice = VOICE_MAP[lang] ?? 'nova';

  const res = await fetchTTS(apiKey, text, voice);

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

// ─── Cache persistente por frase (SRS) ───────────────────────────────────────
// `speak()` arriba es efímero (textos únicos/largos de la conversación). Para el
// SRS, las frases (lemmas) son cortas y RECURRENTES en el tiempo, así que vale la
// pena cachearlas en disco keyed por hash: cada lemma se baja UNA sola vez en su
// vida y los repasos siguientes (y el prefetch) son cache hits de ~0 latencia.

const TTS_CACHE_DIR = `${FileSystem.cacheDirectory}tts_cache/`;
let cacheDirReady = false;

// djb2 — hash estable y rápido para nombrar el archivo de cache.
function djb2(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  }
  return (h >>> 0).toString(36);
}

/**
 * Devuelve true si el directorio de cache está disponible.
 * Antes esto no tenía try/catch: un fallo de FileSystem dejaba `cacheDirReady`
 * en false para siempre y reventaba cada llamada posterior a speakCached().
 * Ahora un fallo solo significa "sin cache", no "sin TTS".
 */
async function ensureCacheDir(): Promise<boolean> {
  if (cacheDirReady) return true;
  try {
    const info = await FileSystem.getInfoAsync(TTS_CACHE_DIR);
    if (!info.exists) {
      await FileSystem.makeDirectoryAsync(TTS_CACHE_DIR, { intermediates: true });
    }
    cacheDirReady = true;
    return true;
  } catch (err) {
    console.warn('[tts] cache dir unavailable, falling back to uncached:', err);
    return false;
  }
}

/**
 * Versión cacheada de `speak()` para frases recurrentes (SRS).
 * Si el audio ya está en disco → devuelve el path sin tocar la red.
 * Si no → lo genera una vez y lo persiste con nombre `${lang}_${hash}.mp3`.
 */
export const speakCached = async (text: string, lang: string): Promise<string> => {
  // Sin directorio de cache seguimos funcionando, solo que sin cache.
  if (!(await ensureCacheDir())) return speak(text, lang);

  const path = `${TTS_CACHE_DIR}${lang}_${djb2(text)}.mp3`;

  const info = await FileSystem.getInfoAsync(path);
  if (info.exists) {
    console.log('[tts] cache HIT:', path);
    return path; // cache hit → 0 red
  }
  console.log('[tts] cache MISS → fetching:', text.slice(0, 40));

  const apiKey = process.env.EXPO_PUBLIC_OPENAI_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_OPENAI_API_KEY no configurada');

  const voice = VOICE_MAP[lang] ?? 'nova';
  const res = await fetchTTS(apiKey, text, voice);

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`TTS error ${res.status}: ${err}`);
  }

  const buffer = await res.arrayBuffer();
  const base64 = uint8ArrayToBase64(new Uint8Array(buffer));
  await FileSystem.writeAsStringAsync(path, base64, { encoding: FileSystem.EncodingType.Base64 });
  console.log('[tts] cached →', path);
  return path;
};
