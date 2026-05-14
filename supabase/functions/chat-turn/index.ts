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

    // TODO: Implementar la llamada real a OpenCode según fase 3.3.
    // Por ahora esto es solo un scaffold de echo que devuelve lo que recibió para poder verificar que funciona.
    
    const responsePayload = {
      ai_text: `Echo: Recibí tu mensaje en lenguaje ${lang} y nivel ${level}. Tu texto fue: "${user_text}".`
    };

    return new Response(JSON.stringify(responsePayload), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 400,
    });
  }
});
