# KNOWLEDGE_VAULT.md — Baúl de conocimiento (feature futura)

> **Estado:** spec a futuro (no implementada). Documentada ahora porque el schema actual ya la habilita
> parcialmente; dejarla escrita hace que la integración sea trivial cuando lleguemos. Implementación
> planificada en **Fase 15** de [TASKS.md](TASKS.md). Punto de partida concreto ya construido: el
> **flashback de contexto** del SRS (Fase 9.B).

---

## 1. Visión

Tratar LanguAI no solo como un practicador voz↔voz, sino como una **base de conocimiento personal** del
aprendizaje — un "mini Obsidian / Notion" adentro de la app. Cada conversación es una unidad de conocimiento
revisitable, reanudable y organizable.

Caso de uso disparador (del dueño): *"Hablé 5 min por voz sobre un video de YouTube que me pareció
interesante, pero no tuve más tiempo. Mañana abro la app y quiero **continuar esa misma conversación** sin
re-pegar el video — la IA recuerda de qué hablábamos."*

---

## 2. Pilares

1. **Conversaciones persistentes y reanudables**
   Reabrir una sesión pasada y **seguir hablando por voz** (no solo leerla). La IA rehidrata el historial y
   continúa el hilo.
2. **Organización por tags ("carpetas") + búsqueda**
   `sessions.tags[]` agrupa conversaciones por tema. UI estilo chat de IA: carpetas (tags) → conversaciones.
   Búsqueda por tag y por texto (en `summary` / turnos).
3. **Summary evolutivo**
   `sessions.summary` se **actualiza/extiende** cada vez que reabrís la conversación y seguís hablando — el
   resumen acompaña el crecimiento del hilo en vez de quedar congelado del primer cierre.
4. **Espejo externo (Obsidian)**
   La DB es la **fuente de verdad**. El export a Obsidian (Fase 12) es un **mirror/backup** para el vault
   personal del usuario, no un mecanismo de ahorro de storage.

---

## 3. Qué soporta el schema HOY (por eso será fácil)

| Necesidad del baúl | Ya existe | Dónde |
|---|---|---|
| Historia completa de cada conversación | ✅ `session_turns` (una fila por turno: `idx, speaker, text`) | `001_sessions.sql` |
| Síntesis por conversación | ✅ `sessions.summary` | `001_sessions.sql` |
| Carpetas / agrupación | ✅ `sessions.tags[]` con índice GIN | `001_sessions.sql` |
| Tipos de sesión | ✅ `sessions.type` (`free`/`roleplay`/`deep_dive`) | `001_sessions.sql` |
| Contexto YouTube | ✅ `sessions.youtube_context jsonb` | `001_sessions.sql` |
| Rehidratar historial al LLM | ✅ `chat-turn` ya carga turnos previos | `functions/chat-turn` |
| Recuperar ventana de contexto barata | ✅ índice `(session_id, idx)` + flashback | `srsContext.ts` (Fase 9.B) |

**No requiere tablas nuevas.** El baúl es esencialmente **UI + un par de ajustes de lógica** sobre datos que
ya guardamos.

---

## 4. Gaps a resolver cuando se implemente

1. **`chat-turn` debe traer los ÚLTIMOS N turnos, no los primeros.**
   Hoy hace `.order('idx', asc).limit(20)` → en conversaciones largas reanudables eso devuelve el comienzo,
   no el contexto reciente. Cambiar a "últimos N" (order desc + limit, luego re-ordenar asc).
2. **Título de conversación.** Derivable del `summary` (primera oración) o un campo `title` opcional.
3. **Summary evolutivo.** Al reabrir y agregar turnos, re-generar/extender `summary` (reusar el pipeline de
   `generate-feedback` o una función liviana `update-summary`).
4. **UI de navegación del baúl.** Lista de carpetas (tags) → lista de conversaciones → detalle reanudable.
5. **Reanudar = misma sesión.** Reabrir setea la `session` activa en `useSessionStore` y sigue insertando
   turnos con `idx` continuando desde el último.

---

## 5. Relación con otras piezas

- **Flashback SRS (Fase 9.B)** — primer uso del baúl: desde una card, saltar al momento exacto de la
  conversación donde se dijo la frase. Comparte la resolución de ventana de `srsContext.ts`.
- **Obsidian export (Fase 12)** — el baúl in-app y el mirror Obsidian comparten la misma fuente (`sessions`
  + `session_turns` + `summary`). El export se puede disparar desde el detalle de una conversación.
- **RAG / memoria (Fase 10)** — `user_facts` + embeddings complementan el baúl: el baúl es navegación
  explícita por conversación; el RAG es recuperación implícita de hechos.

---

## 6. Consideración de storage

Texto plano, barato: una conversación de ~100 turnos ≈ 30–80 KB. Miles de conversaciones = decenas de MB,
holgado para el tier de Supabase a escala personal. Si algún día pesa: archivar turnos crudos antiguos
conservando el `summary`. **No es una preocupación para el MVP ni para el baúl.**
