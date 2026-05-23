const GROQ_API_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';

export const transcribe = async (audioUri: string, lang: string): Promise<string> => {
  const apiKey = process.env.EXPO_PUBLIC_GROQ_API_KEY;
  if (!apiKey) throw new Error('EXPO_PUBLIC_GROQ_API_KEY no configurada');

  // In React Native, local file:// URIs can't be fetched to a blob.
  // Pass the file descriptor directly — the native networking layer handles it.
  const formData = new FormData();
  formData.append('file', {
    uri: audioUri,
    type: 'audio/m4a',
    name: 'audio.m4a',
  } as any);
  formData.append('model', 'whisper-large-v3-turbo');
  formData.append('language', lang);
  formData.append('response_format', 'text');

  const res = await fetch(GROQ_API_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}` },
    body: formData,
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`STT error ${res.status}: ${err}`);
  }

  return res.text();
};
