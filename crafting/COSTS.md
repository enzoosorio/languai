# Plan de Costos — LanguAI

Estimación de costos operativos por sesión y por mes. Incluye el **plan primario** (usando el proxy OpenCode Go) y el **plan fallback** (APIs cloud directas si el plan Go se satura o no está disponible).

---

## Supuestos base

| Variable | Valor asumido |
|---|---|
| Duración promedio por sesión | 5 min |
| Turnos del usuario por sesión | ~10 turnos |
| Palabras por turno del usuario | ~20 palabras (~100 chars de audio) |
| Respuesta del LLM por turno | ~80-120 tokens |
| Sesiones por día (uso personal) | 1 sesión/día |
| Sesiones por mes | 30 sesiones/mes |

---

## Desglose de costos por sesión

### STT — Groq Whisper

- Precio: ~$0.000059 / segundo de audio
- Audio por sesión: 10 turnos × ~5s = ~50s
- **Costo estimado:** $0.000059 × 50 = **~$0.003/sesión**
- **Mensual (30 sesiones):** ~$0.09

### LLM — Conversación (`chat-turn`)

- Modelo primario: GPT-4o via OpenCode proxy (cubierto por Plan Go)
- Fallback: GPT-4o Mini directo ($0.15/M input, $0.60/M output)
- Tokens por sesión: ~10 turnos × (500 system + 200 input + 100 output) = ~8,000 tokens total
- **Con Plan Go:** $0 (cubierto)
- **Fallback GPT-4o Mini:** (6,000 input × $0.15/M) + (2,000 output × $0.60/M) = **~$0.002/sesión** → ~$0.06/mes

### LLM — Feedback (`generate-feedback`)

- 1 llamada grande al cerrar sesión
- Tokens: ~3,000 input (transcripción completa) + ~1,500 output (JSON anotado)
- **Con Plan Go:** $0 (cubierto)
- **Fallback GPT-4o Mini:** (3,000 × $0.15/M) + (1,500 × $0.60/M) = **~$0.0014/sesión** → ~$0.04/mes

### LLM — Extract facts (`extract-facts`)

- 1 llamada pequeña por sesión (paralela al feedback)
- Tokens: ~1,500 input + ~300 output
- **Con Plan Go:** $0
- **Fallback GPT-4o Mini:** **~$0.0004/sesión** → ~$0.01/mes

### Embeddings — RAG (`text-embedding-3-small`)

- ~5 hechos × 50 tokens/hecho = ~250 tokens/sesión
- Precio: $0.02/M tokens
- **Costo:** $0.02/M × 250 = **~$0.000005/sesión** → despreciable

### TTS — OpenAI (`nova`)

- Precio: $0.015 / 1,000 caracteres
- Caracteres/sesión: 10 turnos IA × ~200 chars = ~2,000 chars
- **Costo estimado:** $0.015 × 2 = **~$0.03/sesión** → ~$0.90/mes

> **TTS V2 (ElevenLabs Turbo):** ~$0.00022/char. A 2,000 chars = ~$0.44/sesión → ~$13.20/mes. Significativamente más caro — mantener MVP con OpenAI `nova`.

### Pronunciation Score — Azure Speech

- Precio: ~$1.00 / hora de audio procesado
- Audio por sesión: ~50 segundos = ~0.014h
- **Costo estimado:** $1.00 × 0.014 = **~$0.014/sesión** → ~$0.42/mes

### YouTube Context — Gemini 1.5 Flash

- Gratis hasta 15 req/min en Free Tier.
- Uso esperado: ocasional (no cada sesión).
- **Costo estimado:** $0 con cuota gratuita

### GitHub API — Export Obsidian

- REST API gratuita (sin límite de costo para uso personal).
- **Costo:** $0

### Weekly Report — `weekly-report`

- 1 llamada LLM/semana (análisis de sesiones)
- Tokens: ~2,000 input + ~800 output
- **Con Plan Go:** $0
- **Fallback GPT-4o Mini:** **~$0.0008/semana** → ~$0.003/mes

---

## Resumen mensual (30 sesiones/mes, 1 sesión/día)

| Servicio | Plan Go (primario) | Fallback (APIs directas) |
|---|---|---|
| Groq Whisper STT | ~$0.09 | ~$0.09 |
| LLM chat-turn | $0 | ~$0.06 |
| LLM generate-feedback | $0 | ~$0.04 |
| LLM extract-facts | $0 | ~$0.01 |
| Embeddings (RAG) | ~$0.00 | ~$0.00 |
| OpenAI TTS (nova) | ~$0.90 | ~$0.90 |
| Azure Speech (pronunciation) | ~$0.42 | ~$0.42 |
| Gemini (YouTube, ocasional) | $0 | $0 |
| GitHub API | $0 | $0 |
| Weekly report (LLM) | $0 | ~$0.003 |
| **TOTAL MENSUAL** | **~$1.41** | **~$1.52** |

---

## Plan primario — OpenCode Go

- Cubre completamente todos los costos de LLM (chat, feedback, extract-facts, weekly report).
- Costo restante: Groq STT + TTS + Azure Speech ≈ $1.41/mes (personal).
- **Veredicto:** Completamente asumible para uso personal.

## Plan fallback — APIs cloud directas

Activar si el Plan Go se satura o no está disponible:

1. **Inmediato:** Cambiar endpoint del LLM de OpenCode proxy a OpenAI API directa con GPT-4o Mini.
   - Variable de entorno: `LLM_ENDPOINT` y `LLM_MODEL` en Edge Functions.
   - Sin cambio de código, solo cambio de config.
2. **Si el costo TTS escala** (múltiples usuarios): Evaluar cambio a ElevenLabs Pay-as-you-go solo para voz principal, mantener `nova` para deep-dives.
3. **Umbral de alerta:** Si el costo mensual supera $10 (escenario multi-usuario), revisar:
   - Reducir el sistema prompt size (economizar tokens en RAG).
   - Limitar `generate-feedback` a sesiones > 3 turnos.
   - Deshabilitar `extract-facts` para sesiones < 2 min.

---

## Escalabilidad (si el proyecto se abre a más usuarios)

| Usuarios activos/mes | LLM (fallback) | TTS | STT | Azure Speech | Total estimado |
|---|---|---|---|---|---|
| 1 (personal) | ~$0.10 | ~$0.90 | ~$0.09 | ~$0.42 | ~$1.51 |
| 10 | ~$1.00 | ~$9.00 | ~$0.90 | ~$4.20 | ~$15.10 |
| 100 | ~$10 | ~$90 | ~$9 | ~$42 | ~$151 |

Para 10+ usuarios: necesitaría modelo de freemium o sponsorships. No aplica al caso de uso actual (personal + open-source).
