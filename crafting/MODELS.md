# MODELS — Catálogo de modelos, decisiones y rutas de evolución

Documento único de verdad para qué modelo usa cada parte del pipeline de LanguAI, por qué se eligió, y qué alternativas existen para escalar o degradar.

**Principio rector:** todo modelo es intercambiable vía variable de configuración. Ningún componente de la app está acoplado a un proveedor específico. Diseñar pensando en swap.

---

## 1. Stack por caso de uso (vigente)

| Componente | Modelo actual | Proveedor / acceso | Latencia objetivo | Costo aprox. |
|---|---|---|---|---|
| **Conversación en vivo** (`chat-turn`) | DeepSeek V4 Flash | OpenCode proxy (plan Go) | <1s respuesta corta | incluido en plan |
| **Feedback final** (`generate-feedback`) | DeepSeek V4 Pro | OpenCode proxy | 3-6s (asíncrono) | incluido |
| **Filtro grammar paralelo** | LanguageTool (self-host o API) | OSS / opcional | 100-300ms | $0 self-host |
| **Fact extraction** (`extract-facts`) | DeepSeek V4 Flash | OpenCode proxy | 1-2s background | incluido |
| **Contradiction judge** | DeepSeek V4 Pro | OpenCode proxy | 1-3s background | incluido |
| **Per-turn analysis** (background) | DeepSeek V4 Flash | OpenCode proxy | 1-2s background | incluido |
| **End-conversation detection** | mismo `chat-turn` (tool call) | — | 0 overhead | — |
| **Embeddings** | `text-embedding-3-small` (1536d) | OpenAI directo | <100ms | $0.02/M tokens |
| **STT** | `whisper-large-v3-turbo` | Groq | ~300ms | ~$0.04/h audio |
| **TTS** (MVP) | `tts-1` voice `nova` (EN) / `onyx` (DE) | OpenAI directo | ~400ms | $15/M chars |
| **TTS** (V2) | Turbo v2.5 streaming | ElevenLabs | ~200ms primer chunk | $0.30/1k chars |
| **Pronunciation scoring** | Pronunciation Assessment | Azure Speech | ~600ms | ~$1/h audio |
| **YouTube context** | Gemini 1.5 Flash | Google AI Studio | 2-5s | cuota gratis generosa |

---

## 2. Decisiones clave y razonamiento

### Conversación en vivo → DeepSeek V4 Flash

**Por qué Flash y no Pro:** la conversación es latencia-crítica. Flash entrega tokens 3-4× más rápido que Pro a costa de ~5% menos de "razonamiento". En tutoría conversacional B1-C1 esa diferencia no se nota.

**Por qué no GPT-4o-mini:** OpenCode Go ya cubre Flash sin costo marginal. GPT-4o-mini cuesta por API call.

**Cuándo cambiar:** si el alemán rinde mal (B2+) con DeepSeek, swap a Qwen3.6 Plus solo para `lang === 'de'`. Si el inglés rinde mal, fallback a `gpt-4o-mini`.

**Variable a tocar:** `LLM_CONVERSATION_MODEL` en Edge Function secrets.

---

### Feedback / juicio / extracción → DeepSeek V4 Pro

**Por qué Pro y no Flash:** estos jobs corren **asíncronos**. El usuario no los espera. Podemos gastar 3-6 segundos en razonar bien. Pro es notoriamente superior a Flash y Sonnet 4.5 en tareas de razonamiento estructurado con JSON output.

**Por qué no Claude Sonnet 4.5:** decisión del owner — el plan de Claude (Anthropic) se reserva para crafting y coding del proyecto, no como API de runtime. DeepSeek V4 Pro es el reemplazo más capaz dentro del plan OpenCode Go.

**Cuándo cambiar:** si la accuracy del feedback baja del 90% en validación manual, evaluar Claude Sonnet 4.5 vía API directa. Costo extra estimado: $0.005-0.01 por sesión.

**Variable a tocar:** `LLM_FEEDBACK_MODEL`, `LLM_JUDGE_MODEL`.

---

### Filtro grammar paralelo → LanguageTool

**Rol:** segundo opinador rule-based para grammar puramente sintáctica que el LLM principal pudo haber pasado por alto.

**No es autoridad:** solo agrega annotations marcadas con `source: 'languagetool'` y `confidence: 0.6`. Si el LLM ya marcó el mismo span, gana el LLM (su justificación es más rica).

**Paralelo, no en cascada:** ambos corren al mismo tiempo. Latencia total = max(LLM, LT) ≈ latencia del LLM solo.

**Deploy:** self-host vía Docker o usar la versión cloud free (LanguageTool Premium API es paga).

---

### Embeddings → OpenAI `text-embedding-3-small`

**Por qué no usar un embeddings model de OpenCode:** costo ya es marginal ($0.02/M tokens = ~$0.001 por sesión típica). Cambiar de modelo de embeddings significa reindexar **todos** los `user_facts` históricos. No vale la pena salvo migración seria.

**Dimensión 1536:** soportada nativa por pgvector con IVFFlat. Cambiar a 3072 (modelo `large`) duplicaría costo y storage sin ganancia perceptible para retrieval personal.

**Inmutabilidad:** una vez en producción, **no cambiar** sin migración planificada.

---

### STT → Groq Whisper Large v3 Turbo

**Imbatible** en relación calidad/costo/latencia a 2026-05. Whisper open-source corriendo en hardware Groq LPU es 5-10× más rápido que la API oficial de OpenAI a menor precio.

**Alternativa de fallback:** OpenAI Whisper API si Groq cae (raro). Misma interfaz, solo cambiar endpoint.

**Variable a tocar:** `STT_ENDPOINT`, `STT_MODEL`.

---

### TTS — MVP → OpenAI tts-1, V2 → ElevenLabs

**MVP justificado:** `tts-1` es barato y "suficientemente bueno" para producción inicial. Voces `nova` (EN) y `onyx` (DE) tienen prosody decente.

**V2 cuando:** la latencia percibida sea el bottleneck. ElevenLabs streaming entrega primer audio chunk en ~200ms (vs ~400ms de OpenAI por audio completo). Esto baja la latencia percibida total de ~1.7s a ~0.9s.

**No usar antes:** ElevenLabs es 20× más caro por carácter. Sin demanda real de menor latencia, esperar.

---

### Pronunciation → Azure Speech

**Servicio especializado**, no LLM. Devuelve scoring fonético granular (accuracy, fluency, completeness, prosody). Ningún LLM general lo hace bien.

**Alternativas evaluadas:**
- Speechace API: caro, similar quality
- WhisperX + alignment: complejo, peor accuracy
- Cualquier LLM "escuchando" el audio: no es lo mismo, no hay scoring fonético real

**Variable a tocar:** `PRONUNCIATION_PROVIDER` (solo Azure por ahora).

---

## 3. Modelos disponibles en OpenCode Go — clasificación

Lista actual (a 2026-05) de modelos accesibles bajo el plan, con mi recomendación de uso o descarte:

| Modelo | Recomendación | Por qué |
|---|---|---|
| **DeepSeek V4 Pro** | ✅ Feedback / juicio / extract | Mejor reasoning del pool, alta accuracy en JSON estructurado |
| **DeepSeek V4 Flash** | ✅ Conversación en vivo, fact extract | Mejor latencia del pool, calidad >90% de Pro |
| **Qwen3.6 Plus** | 🔄 Backup multilingual | Strong en DE/asiático, alternativa si DeepSeek flaquea en alemán |
| **Qwen3.5 Plus** | 🔄 Backup | Versión anterior, solo si 3.6 no disponible |
| **GLM-5.1** | ⚠️ Evaluación pendiente | Decente pero no probado superior a DeepSeek para nuestras tareas |
| **GLM-5** | ❌ Descarte | Reemplazado por 5.1 |
| **Kimi K2.6** | ⚠️ Solo si DeepSeek cae | Históricamente fuerte en chino, no aporta sobre DeepSeek para EN/DE |
| **Kimi K2.5** | ❌ Descarte | Reemplazado por 2.6 |
| **MiMo-V2.5-Pro** | ❌ Descarte | Reasoning-focus (estilo o1), overkill para tutoría — gasta tokens en chain-of-thought sin aporte |
| **MiMo-V2.5** | ❌ Descarte | Igual que arriba |
| **MiniMax M2.7** | ❌ Descarte | Su fuerte es contexto largo (1M+ tokens); nuestras sesiones son cortas, no aplica |
| **MiniMax M2.5** | ❌ Descarte | Versión anterior, mismo motivo |

**Nota:** todo "descarte" es para este proyecto, no es un juicio absoluto del modelo. MiMo y MiniMax son excelentes en sus dominios.

---

## 4. Mecanismo de swap (no acoplarse a proveedor)

Toda Edge Function que llame a un LLM lee su modelo de variables de entorno. Ejemplo en `chat-turn`:

```typescript
const config = {
  endpoint: Deno.env.get('LLM_CONVERSATION_ENDPOINT'),
  model:    Deno.env.get('LLM_CONVERSATION_MODEL'),
  apiKey:   Deno.env.get('LLM_CONVERSATION_KEY'),
};
```

Para cambiar el modelo de conversación:
1. Cambiar las 3 vars en Supabase Edge Function secrets
2. Redeploy (o auto-reload si Supabase lo soporta)
3. Sin cambios en código

Funciones que tienen su propia config:
- `LLM_CONVERSATION_*` — chat-turn, roleplay turns, deep-dive turns
- `LLM_FEEDBACK_*` — generate-feedback
- `LLM_JUDGE_*` — contradiction detection, fact validation
- `LLM_EXTRACT_*` — extract-facts, per-turn-analysis
- `LLM_ROLEPLAY_GEN_*` — generate-roleplay-topics (puede ser distinto)

---

## 5. Plan de validación (A/B antes de fijar)

Antes de fijar un modelo para producción, correr una validación corta:

### Para modelos de conversación
1. Recolectar 20 turnos reales de usuarios (transcript + lang + level)
2. Generar respuestas con cada candidato (DeepSeek V4 Flash, Qwen3.6 Plus, GPT-4o-mini)
3. Evaluar manualmente: naturalidad, adherencia al nivel CEFR, latencia
4. Ganador: el que cumple el target de latencia con la mejor naturalidad

### Para modelos de feedback
1. Recolectar 10 sesiones completas con feedback "ground truth" anotado a mano
2. Generar feedback con cada candidato (DeepSeek V4 Pro, Claude Sonnet 4.5 vía API, GPT-4o)
3. Medir: % de annotations correctas (precision), % de errores reales atrapados (recall), JSON parse success rate
4. Target: >90% precision + >85% recall + 100% JSON parse en 2 intentos

---

## 6. Costos comparativos (estimación mensual @ 100 sesiones / mes)

Asumiendo sesión promedio = 6 turnos del usuario, 2 min audio, 800 tokens LLM por turno.

| Caso | Stack actual (OpenCode + OpenAI satélites) | Stack alternativo (todo OpenAI directo) |
|---|---|---|
| Conversación LLM | $0 (plan Go) | ~$3.20 (gpt-4o-mini) |
| Feedback LLM | $0 (plan Go) | ~$0.80 (gpt-4o) |
| Embeddings | ~$0.10 | ~$0.10 |
| STT (Groq) | ~$0.30 | ~$0.30 |
| TTS (OpenAI) | ~$2.40 | ~$2.40 |
| Pronunciation (Azure) | ~$0.40 | ~$0.40 |
| **Total** | **~$3.20/mes + plan OpenCode Go** | **~$7.20/mes** |

Plan OpenCode Go ya pagado por otras razones → el delta efectivo es bajo.

---

## 7. Open issues / a evaluar

- [ ] **Benchmark formal** de DeepSeek V4 Flash vs gpt-4o-mini en alemán B2 (pendiente — hacer al cerrar Fase 3)
- [ ] **Decidir** si LanguageTool corre self-host (Docker en VPS) o cloud free tier
- [ ] **Evaluar** modelos open-source de pronunciation (Wav2Vec2-based) como alternativa a Azure cuando volumen lo justifique
- [ ] **Fine-tuning** del modelo de feedback con dataset de correcciones rechazadas — **defer a v3**, requiere >5000 ejemplos pulidos
- [ ] **Cuándo activar V2 streaming TTS** — definir threshold de usuarios o métrica de "queja por lentitud"

---

## 8. Histórico de decisiones

| Fecha | Cambio | Razón |
|---|---|---|
| 2026-05-23 | Doc creado, stack inicial fijado | Cierre de checkpoint de planeación Fase 3 |
| 2026-05-23 | DeepSeek V4 Pro elegido para feedback (vs Sonnet 4.5 original) | Plan Claude reservado para crafting/coding |
| 2026-05-23 | LanguageTool agregado como filtro paralelo | Validación rule-based de grammar sintáctica |
