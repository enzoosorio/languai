const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { session_id, user_text, lang, level } = body;

    if (!session_id || !user_text || !lang || !level) {
      return new Response(
        JSON.stringify({ error: 'Faltan campos requeridos: session_id, user_text, lang, level' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 },
      );
    }

    const apiKey = Deno.env.get('OPENCODE_API_KEY') ?? Deno.env.get('OPENAI_API_KEY') ?? '';
    const baseUrl = Deno.env.get('OPENCODE_BASE_URL') ?? 'https://api.openai.com';
    const model = Deno.env.get('LLM_MODEL') ?? 'gpt-4o-mini';

    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: 'API key no configurada en Edge Function' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 },
      );
    }

    const systemPrompt = `You are a conversational language partner helping the user practice ${lang.toUpperCase()} at CEFR level ${level}.

Guidelines:
- Respond naturally in ${lang.toUpperCase()} at level ${level} complexity
- Keep responses to 2-3 sentences maximum
- If the user makes a grammar or vocabulary mistake, gently weave a correction into your reply without explicitly pointing it out
- Be encouraging and engaged with the conversation topic
- Never break character or mention you are an AI`;

    const llmRes = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: user_text },
        ],
        max_tokens: 150,
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
    const ai_text: string = llmData.choices?.[0]?.message?.content ?? '';

    return new Response(JSON.stringify({ ai_text }), {
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
