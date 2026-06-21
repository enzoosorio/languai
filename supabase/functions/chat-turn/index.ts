import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Max turns de historial para enviar al LLM (20 = 10 exchanges ≈ 5 min de sesión).
// Turnos más viejos se descartan — el contexto más reciente es el que importa.
const MAX_HISTORY_TURNS = 20;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { session_id, user_text, lang, level } = body;

    // ── Guard clauses ────────────────────────────────────────────────────────
    if (!session_id || !user_text || !lang || !level) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: session_id, user_text, lang, level' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const apiKey  = Deno.env.get('OPENCODE_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? '';
    const baseUrl = Deno.env.get('OPENCODE_BASE_URL') ?? 'https://api.openai.com';
    const model   = Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key no configurada en Edge Function' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    // ── Fetch historial de la sesión desde la DB ─────────────────────────────
    // IMPORTANTE: el cliente llama a chat-turn ANTES de persistir el turno actual
    // (ver HomeScreen.tsx). Por eso la query lee los turnos previos correctamente,
    // sin race condition con el insert del turno actual.
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: turns, error: turnsError } = await supabase
      .from('session_turns')
      .select('speaker, text')
      .eq('session_id', session_id)
      .order('idx', { ascending: true })
      .limit(MAX_HISTORY_TURNS);

    if (turnsError) {
      // No-fatal: continúa sin historial, es mejor que no responder
      console.warn('[chat-turn] Error fetching history:', turnsError.message);
    }

    // ── Tool: end_conversation ──────────────────────────────────────────────
    // Schema exacto de CONVERSATION_LIFECYCLE.md §3.2.
    // tool_choice: 'auto' — el LLM decide si llamarlo o no por turno.
    const tools = [
      {
        type: 'function',
        function: {
          name: 'end_conversation',
          description:
            `Call ONLY when the user clearly intends to end the conversation ` +
            `(says goodbye, "see you later", "I have to go", "let's stop here", etc.). ` +
            `Do NOT call if the farewell appears in a quoted or narrated context ` +
            `like "I said goodbye to him" or "...and then she said see you later".`,
          parameters: {
            type: 'object',
            properties: {
              confidence: {
                type: 'number',
                description: 'How sure you are that the user is ending the conversation (0.0–1.0)',
              },
              farewell_phrase: {
                type: 'string',
                description: 'The exact phrase used by the user',
              },
              reasoning: {
                type: 'string',
                description: 'Brief justification: why this is a real farewell vs narrated context',
              },
            },
            required: ['confidence', 'farewell_phrase', 'reasoning'],
          },
        },
      },
    ];

    // ── System prompt base ───────────────────────────────────────────────────
    // TODO Fase 10: reemplazar por buildSystemPrompt() con inyección RAG + nudge items.
    const systemPrompt =
      `You are a conversational language partner helping the user practice ` +
      `${lang.toUpperCase()} at CEFR level ${level}.\n\n` +
      `Guidelines:\n` +
      `- Respond naturally in ${lang.toUpperCase()} at ${level} complexity\n` +
      `- Keep responses concise: 2-3 sentences maximum\n` +
      `- If the user makes a grammar or vocabulary mistake, gently weave a ` +
      `correction into your reply without explicitly pointing it out\n` +
      `- Be encouraging and stay engaged with the conversation topic\n` +
      `- Never break character or mention you are an AI`;

    // ── Construir array de mensajes con historial ────────────────────────────
    type LLMMessage = { role: 'system' | 'user' | 'assistant'; content: string };

    const messages: LLMMessage[] = [{ role: 'system', content: systemPrompt }];

    for (const turn of turns ?? []) {
      messages.push({
        role: turn.speaker === 'user' ? 'user' : 'assistant',
        content: turn.text,
      });
    }

    // Añadir el turno actual del usuario al final
    messages.push({ role: 'user', content: user_text });

    // ── Llamada al LLM ───────────────────────────────────────────────────────
    const llmRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages,
        tools,
        tool_choice: 'auto',
        max_tokens: 200,   // +50 tokens para acomodar tool call + respuesta de despedida
        temperature: 0.8,
      }),
    });

    if (!llmRes.ok) {
      const errText = await llmRes.text();
      return new Response(
        JSON.stringify({ error: `LLM error ${llmRes.status}: ${errText}` }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 502 },
      );
    }

    const llmData = await llmRes.json();
    const choice  = llmData.choices?.[0];

    // tool_calls: array de tool calls si el LLM invocó end_conversation (o vacío)
    const tool_calls: unknown[] = choice?.message?.tool_calls ?? [];

    // content puede ser null cuando el LLM solo emite tool call sin texto.
    // En ese caso usamos un farewell genérico para que siempre haya audio.
    const ai_text: string =
      choice?.message?.content?.trim() ||
      (tool_calls.length > 0 ? "It was great talking with you! Goodbye! 👋" : '');

    return new Response(JSON.stringify({ ai_text, tool_calls }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (error) {
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Error desconocido' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
    );
  }
});
