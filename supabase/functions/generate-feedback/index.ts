import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ── Tipos del JSON de feedback ───────────────────────────────────────────────
// Modelo unificado: el LLM devuelve UNA sola lista de anotaciones. Cada una
// copia VERBATIM el substring del error desde un turno del usuario; el span se
// calcula en código con indexOf (determinístico) en vez de pedirle offsets al
// LLM (que no sabe contar caracteres de forma fiable).
interface FeedbackAnnotation {
  text:        string;   // substring copiado EXACTO de un turno del usuario
  severity:    'error' | 'warning' | 'improvement';
  category:    string;   // grammar | vocab | phrasal | register | context
  explanation: string;   // 1 frase para el tooltip
  suggestion:  string;   // cómo lo diría un nativo
  track:       boolean;  // ¿promover a la librería SRS (tracked_items)?
  lemma?:      string;   // forma normalizada — requerido si track=true
}

interface FeedbackJSON {
  summary:     string;
  tags:        string[];
  annotations: FeedbackAnnotation[];
}

// ── Validador del JSON de feedback ───────────────────────────────────────────
function validateFeedback(raw: unknown): raw is FeedbackJSON {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (typeof obj.summary !== 'string')   return false;
  if (!Array.isArray(obj.tags))          return false;
  if (!Array.isArray(obj.annotations))   return false;
  return true;
}

// Peso por defecto según severidad
function defaultWeight(severity: FeedbackAnnotation['severity']): number {
  return severity === 'error' ? 0.9 : severity === 'warning' ? 0.6 : 0.3;
}

// ── Llama al LLM y parsea JSON (con 2 reintentos) ───────────────────────────
async function callLLMForFeedback(
  messages: Array<{ role: string; content: string }>,
  apiKey: string,
  baseUrl: string,
  model: string,
): Promise<FeedbackJSON | null> {

  const tryParse = async (msgs: typeof messages): Promise<FeedbackJSON | null> => {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: msgs, temperature: 0.3, max_tokens: 3000 }),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';

    // Stripping de posibles code-fences que el LLM añada
    const cleaned = content
      .replace(/^```json\s*/i, '')
      .replace(/^```\s*/i, '')
      .replace(/\s*```$/i, '')
      .trim();

    try {
      const parsed = JSON.parse(cleaned);
      return validateFeedback(parsed) ? (parsed as FeedbackJSON) : null;
    } catch {
      return null;
    }
  };

  // Intento 1: prompt original
  let result = await tryParse(messages);
  if (result) return result;

  // Intento 2: mismo historial + instrucción de formato estricto
  const retry1 = [
    ...messages,
    { role: 'assistant', content: '(previous attempt produced invalid JSON)' },
    {
      role: 'user',
      content:
        'Your previous response was not valid JSON. ' +
        'Return ONLY a valid JSON object. No markdown. No code blocks. ' +
        'No explanations. Start with { and end with }.',
    },
  ];
  result = await tryParse(retry1);
  if (result) return result;

  // Intento 3: prompt mínimo — solo campos obligatorios
  const minimalSystem =
    'Return ONLY a valid JSON object with keys: ' +
    '"summary" (string), "tags" (array of strings), ' +
    '"annotations" (array of {text, severity, category, explanation, suggestion, track, lemma}). ' +
    'No markdown. No extra text.';
  const retry2 = [
    { role: 'system', content: minimalSystem },
    messages[messages.length - 1], // solo el último mensaje de usuario
  ];
  return await tryParse(retry2);
}

// ── Handler principal ────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body           = await req.json();
    const { session_id } = body as { session_id?: string };

    if (!session_id) {
      return new Response(
        JSON.stringify({ error: 'session_id requerido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // ── Leer sesión ──────────────────────────────────────────────────────────
    const { data: session, error: sessionError } = await supabase
      .from('sessions')
      .select('id, user_id, language, level, type, feedback_status')
      .eq('id', session_id)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: 'Sesión no encontrada' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 404 },
      );
    }

    // No reprocesar si ya está done o processing
    if (session.feedback_status === 'done' || session.feedback_status === 'processing') {
      return new Response(
        JSON.stringify({ feedback_status: session.feedback_status }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // ── Leer turnos ──────────────────────────────────────────────────────────
    const { data: turns, error: turnsError } = await supabase
      .from('session_turns')
      .select('id, idx, speaker, text')
      .eq('session_id', session_id)
      .order('idx', { ascending: true });

    if (turnsError || !turns || turns.length < 4) {
      // Menos de 4 turnos (2 intercambios) → no tiene sentido generar feedback
      await supabase
        .from('sessions')
        .update({ feedback_status: 'failed' })
        .eq('id', session_id);
      return new Response(
        JSON.stringify({ feedback_status: 'failed', reason: 'too_short' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Marcar como procesando
    await supabase
      .from('sessions')
      .update({ feedback_status: 'processing' })
      .eq('id', session_id);

    // ── Construir el prompt ──────────────────────────────────────────────────
    const lang  = session.language.toUpperCase();
    const level = session.level;

    // Numeramos los turnos para que el LLM ubique de dónde copia cada error.
    const conversationText = turns
      .map((t) => `Turn ${t.idx} [${t.speaker.toUpperCase()}]: ${t.text}`)
      .join('\n');

    const systemPrompt =
      `You are a language learning coach. Analyze the conversation and return a JSON feedback object.\n\n` +
      `Language: ${lang}  |  CEFR Level: ${level}\n\n` +
      `Return ONLY a valid JSON object (no markdown, no code blocks) with this EXACT structure:\n` +
      `{\n` +
      `  "summary": "2-3 sentence summary of the conversation",\n` +
      `  "tags": ["topic1", "topic2"],\n` +
      `  "annotations": [\n` +
      `    {\n` +
      `      "text": "<substring copied CHARACTER-FOR-CHARACTER from a USER turn>",\n` +
      `      "severity": "error" | "warning" | "improvement",\n` +
      `      "category": "grammar" | "vocab" | "phrasal" | "register" | "context",\n` +
      `      "explanation": "1-sentence explanation of the problem",\n` +
      `      "suggestion": "How a native speaker would say it",\n` +
      `      "track": true,\n` +
      `      "lemma": "normalized canonical form (required when track is true)"\n` +
      `    }\n` +
      `  ]\n` +
      `}\n\n` +
      `CRITICAL RULES:\n` +
      `- "text" MUST be an EXACT, verbatim, case-sensitive copy of a contiguous substring that\n` +
      `  literally appears inside one of the USER turns. Do NOT paraphrase, fix, normalize, or\n` +
      `  re-tokenize it. If the user wrote "I am going to take lunch", a valid text is "take lunch".\n` +
      `  If the substring does not appear verbatim in a user turn, DO NOT include that annotation.\n` +
      `- ONLY annotate USER turns. Never annotate AI turns.\n` +
      `- Keep "text" SHORT — the minimal span that contains the problem (1-6 words), not the whole sentence.\n` +
      `- severity: "error" = grammatically wrong; "warning" = unnatural/awkward but understandable;\n` +
      `  "improvement" = correct but a native would phrase it better.\n` +
      `- track: true for items worth studying later (most errors + notable warnings). Provide "lemma"\n` +
      `  (the corrected/canonical form, e.g. "have lunch"). Use track: false for minor improvements.\n` +
      `- Return 3-10 annotations total. Quality over quantity — only the most meaningful ones.\n` +
      `- tags: 1-3 lowercase snake_case topics (e.g. "daily_life", "travel", "work").\n` +
      `- Return ONLY the JSON object, nothing else.`;

    const userMessage = `Here is the conversation:\n\n${conversationText}`;

    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user',   content: userMessage  },
    ];

    // ── LLM ─────────────────────────────────────────────────────────────────
    const apiKey  = Deno.env.get('OPENCODE_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? '';
    const baseUrl = Deno.env.get('OPENCODE_BASE_URL') ?? 'https://api.openai.com';
    const model   = Deno.env.get('FEEDBACK_MODEL') ?? Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini';

    const feedback = await callLLMForFeedback(messages, apiKey, baseUrl, model);

    if (!feedback) {
      await supabase
        .from('sessions')
        .update({ feedback_status: 'failed' })
        .eq('id', session_id);
      return new Response(
        JSON.stringify({ feedback_status: 'failed', reason: 'parse_error' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
      );
    }

    // ── Persistir anotaciones + tracked_items (modelo unificado) ─────────────
    // Para cada anotación: localizamos el substring verbatim dentro de un turno
    // del usuario via indexOf (determinístico). Si la anotación es "track",
    // hacemos upsert del tracked_item y vinculamos su id a la anotación.
    const userTurns = turns.filter((t) => t.speaker === 'user');
    let annotationsInserted = 0;

    for (const ann of feedback.annotations) {
      if (!ann.text || typeof ann.text !== 'string') continue;

      // Localizar el turno del usuario que contiene el substring (case-insensitive,
      // pero el offset es válido sobre el texto original porque toLowerCase no
      // cambia la longitud en estos scripts).
      const needle = ann.text.toLowerCase();
      let matchTurn: typeof turns[number] | null = null;
      let spanStart = -1;

      for (const t of userTurns) {
        const idx = t.text.toLowerCase().indexOf(needle);
        if (idx !== -1) {
          matchTurn = t;
          spanStart = idx;
          break;
        }
      }

      // Si el LLM alucinó un substring que no existe verbatim → lo saltamos.
      if (!matchTurn || spanStart === -1) continue;

      const spanEnd = spanStart + ann.text.length;

      // ── tracked_item (si aplica) ───────────────────────────────────────────
      let trackedItemId: string | null = null;
      if (ann.track && ann.lemma) {
        const { data: existing } = await supabase
          .from('tracked_items')
          .select('id, weight')
          .eq('user_id', session.user_id)
          .eq('lemma', ann.lemma)
          .maybeSingle();

        if (existing) {
          await supabase
            .from('tracked_items')
            .update({
              weight:            Math.min(1.0, existing.weight + 0.2),
              last_seen_session: session_id,
              severity:          ann.severity,
              explanation:       ann.explanation,
            })
            .eq('id', existing.id);
          trackedItemId = existing.id;
        } else {
          const { data: inserted } = await supabase
            .from('tracked_items')
            .insert({
              user_id:            session.user_id,
              text:               ann.text,
              lemma:              ann.lemma,
              severity:           ann.severity,
              category:           ann.category,
              explanation:        ann.explanation,
              weight:             defaultWeight(ann.severity),
              first_seen_session: session_id,
              last_seen_session:  session_id,
            })
            .select('id')
            .single();
          trackedItemId = inserted?.id ?? null;
        }
      }

      // ── feedback_annotation ────────────────────────────────────────────────
      const { error: annError } = await supabase
        .from('feedback_annotations')
        .insert({
          turn_id:         matchTurn.id,
          span_start:      spanStart,
          span_end:        spanEnd,
          severity:        ann.severity,
          category:        ann.category,
          explanation:     ann.explanation,
          suggestion:      ann.suggestion ?? '',
          tracked_item_id: trackedItemId,
        });

      if (annError) {
        console.warn('[generate-feedback] annotation insert error:', annError.message);
      } else {
        annotationsInserted++;
      }
    }

    // ── Actualizar sesión ────────────────────────────────────────────────────
    await supabase
      .from('sessions')
      .update({
        summary:         feedback.summary,
        tags:            feedback.tags,
        feedback_status: 'done',
      })
      .eq('id', session_id);

    return new Response(
      JSON.stringify({
        feedback_status:     'done',
        session_id,
        annotations_created: annotationsInserted,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 },
    );

  } catch (err) {
    console.error('[generate-feedback] unexpected error:', err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'Error desconocido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
