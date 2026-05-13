# Feedback System

Pilar central de LanguAI: convertir cada conversación (libre o roleplay) en aprendizaje accionable, navegable y persistente. Inspirado en las pantallas de feedback de Speak y Duolingo Max, pero con deep-dive interactivo y librería de errores con pesos que alimenta repaso espaciado y nudges implícitos al LLM.

## Propósito

Después de cada sesión el usuario recibe:

1. Una **transcripción navegable** con marcado a color (rojo / amarillo / azul) sobre las palabras y frases relevantes.
2. La capacidad de **clickear un span** para ver una explicación corta, y profundizar a una conversación dedicada (deep-dive) sobre esa palabra o expresión.
3. Una **librería personal de tracked items** que se acumula a través de las sesiones y alimenta el sistema de repaso (SRS) y los nudges implícitos del LLM en sesiones futuras.

## Cuándo se genera

**Solo al final de la sesión** (no en tiempo real). Esto:

- Mantiene la conversación fluida y zero-friction.
- Reduce costo: 1 llamada LLM grande por sesión, no N llamadas pequeñas por turno.
- Permite al LLM ver la conversación completa y dar correcciones coherentes (no marcar un error que el usuario corrigió 2 turnos después solo).

La **única "interrupción" en conversación** es el comportamiento natural de la IA pidiendo aclaración cuando no entiende al usuario ("¿podés repetir?"). Esto **no es parte del sistema de feedback** — es el flujo conversacional normal.

## Pipeline de generación

1. Usuario cierra la sesión (manual o por cierre narrativo del roleplay).
2. Cliente sube la transcripción a una Edge Function (segunda Edge Function, asíncrona — ver [ARCHITECTURE.md](ARCHITECTURE.md)).
3. La función llama al LLM con un prompt estructurado que pide JSON estricto:

```json
{
  "turns": [
    {
      "speaker": "user|ai",
      "text": "...",
      "annotations": [
        {
          "span": [start, end],
          "severity": "error|warning|improvement",
          "category": "grammar|vocab|context|phrasal|register|...",
          "explanation": "Frase corta (≤1 oración) para mostrar en tooltip.",
          "suggestion": "Cómo se diría idiomáticamente."
        }
      ]
    }
  ],
  "summary": "Mini resumen autogenerado de la sesión.",
  "tags": ["sports", "ordering_food"],
  "tracked_items": [
    {
      "text": "rolling down the deep",
      "lemma": "rolling_down",
      "severity": "error",
      "weight": 0.9,
      "category": "phrasal"
    }
  ]
}
```

4. Validación de JSON. Si falla parse:
   - **Retry 1:** Mismo prompt con instrucción adicional de formato estricto.
   - **Retry 2:** Prompt mínimo pidiendo solo los campos obligatorios.
   - **Si ambos fallan:** La Edge Function setea `sessions.feedback_status = 'failed'`. Supabase Realtime notifica a la app, que muestra un popup: *"No pudimos estructurar tu feedback correctamente."*
   - **HITL (Human-in-the-Loop):** El usuario puede ver los campos vacíos/inválidos y completarlos manualmente desde la app (texto libre). Si no interviene, la sesión queda grabada sin anotaciones (el audio de la conversación no se pierde, solo el análisis).
5. Se escribe a Supabase (tablas en [ARCHITECTURE.md](ARCHITECTURE.md)).
6. Se notifica al cliente: feedback listo.

## Semántica de los colores

| Color | Severidad | Significado | Peso SRS |
|---|---|---|---|
| 🔴 Rojo | **Error grave** | La palabra/frase rompe el contexto, tiene fallo estructural claro, o produce malentendido. | Alto |
| 🟡 Amarillo | **Advertencia / estrategia horizontal** | El usuario circunlocó o usó una palabra menos precisa que existe pero hay opción mejor. No es error: es una estrategia compensatoria que vale la pena registrar para enseñar el upgrade. | Medio |
| 🔵 Azul | **Mejora / upgrade opcional** | Alternativa más natural o nativa. No hay nada mal en lo que dijo, pero un nativo lo diría diferente. | Bajo (no entra al SRS por defecto, configurable) |

**Nota crítica**: los errores son **contextuales**, no solo léxicos. Una palabra puede ser técnicamente correcta pero mal usada para el contexto. El LLM debe juzgarlo considerando el flujo entero de la conversación.

## Pantalla de Feedback (UI)

Glassmorphism, dark/light mode (ver [UX_UI.md](UX_UI.md)):

- **Header**: título de la sesión (escenario si es roleplay, autogenerado si fue libre) + tags como chips + duración + contadores por color (🔴 3 · 🟡 5 · 🔵 2).
- **Cuerpo**: lista scrolleable de turnos alternados (user / AI) como burbujas de chat glassmórficas estilo iMessage. Los spans del usuario llevan fondo/underline con su color de severidad.
- **Footer**: "Volver al historial" + "Repetir sesión similar".

### Interacción con un span

- **Tap en span** → tooltip preview con la `explanation` corta (≤ 1 frase) + `suggestion`.
- **Tap en preview** (ahora con padding generoso) → expande a **deep-dive flotante** (siguiente sección).
- **Rechazar anotación ("No era error"):** El tooltip incluye un botón o swipe de rechazo. Al confirmar:
  - Reduce `tracked_items.weight` en -1 (mínimo 0).
  - Incrementa `tracked_items.user_rejections` en +1.
  - Si el item llega a `weight = 0` **y** `user_rejections >= 2`, se archiva automáticamente.
  - Permite corregir edge cases donde la IA comete errores de evaluación.

## Deep-dive flotante

Una pantalla dedicada para conversar con la IA específicamente sobre **un** tracked item (palabra, frase, phrasal verb que el usuario marcó como interesante).

- Pantalla nueva, no modal: tiene su propio espacio para historial.
- **Voz habilitada** (mismo pipeline STT → LLM → TTS del modo principal).
- La IA arranca con la explicación completa del item y ejemplos de uso, luego conversa libremente sobre eso.
- **Minimizar** → queda un **circulito flotante** en una esquina (draggable a otra esquina), con el avatar / inicial del item dentro.
- **Tap en circulito** → reabre la pantalla del deep-dive con su historial intacto.

### Regla de "solo uno activo a la vez"

- Si el usuario abre otro deep-dive distinto, el circulito actual se **reemplaza**.
- Si el deep-dive actual tiene > N turnos (ej. 4), se pide confirmación antes de reemplazarlo, para no perder una conversación sustanciosa.
- Al reemplazar, la conversación anterior se cierra normalmente y dispara **su propio feedback** (ver siguiente sección).

### El deep-dive cuenta como sub-sesión de feedback

- Al cerrar el deep-dive, se genera **su propio feedback** con el mismo pipeline (Edge Function, JSON estructurado, anotaciones).
- Se guarda en `deep_dive_sessions(parent_session_id, tracked_item_id, ...)` (ver [ARCHITECTURE.md](ARCHITECTURE.md)).
- **Cross-link**: cuando el feedback del deep-dive contiene anotaciones sobre el mismo `tracked_item` que originó la sub-sesión (o un item compartido con el feedback principal), la UI muestra el link "Visto también en sesión [X]".

## Librería de Tracked Items

Persistencia de errores y advertencias a través del tiempo. Tabla `tracked_items` (esquema en [ARCHITECTURE.md](ARCHITECTURE.md)) con:

- `text` (la expresión textual) y `lemma` (forma normalizada).
- `severity` (error / warning / improvement).
- `weight` acumulativo: arranca según severidad, se ajusta cada vez que reaparece (más repeticiones → más peso, hasta techo).
- `srs_state` (intervalo, próxima fecha de repaso — algoritmo estilo Anki / SM-2).

Esta librería alimenta dos cosas:

### 1. Sección de Repaso (SRS) — Phrasal Verbs y vocabulario

- Sección navegable separada (acceso por swipe + botón fallback desde menú; ver [UX_UI.md](UX_UI.md)).
- **EN-only** en el MVP: el caso de uso personal del usuario son phrasal verbs y palabras dobles (*speak up*, *free up*, *going down*, *pay off*) que cuesta colocar en el momento justo.
- Cards SRS ordenadas por `weight × recencia × prioridad_srs`.
- Modo "drill" rápido: 3-5 mini-ejercicios generados por IA usando el item en frases de ejemplo y pidiendo al usuario que produzca una propia.

### 2. Nudge implícito al LLM (Vocabulary in Context)

- El system prompt de futuras sesiones incluye un bloque tipo:
  > *"Try to naturally weave these expressions into the conversation when contextually appropriate: [phrasal verbs / words list]. Do NOT mention to the user that you are doing this."*
- Esto expone al usuario a sus puntos débiles en contexto natural, sin meta-comentario que rompa la inmersión.
- **Auditable:** Cuando la IA usa una expresión del nudge, la Edge Function `chat-turn` puede detectarla (fuzzy match contra la lista) y marcar el turno correspondiente. Al cerrar sesión, el FeedbackScreen muestra un resumen: *"Expresiones de tu lista practicadas hoy: 'run into' ✓, 'speak up' ✓"* con badge `✓ usado en sesión` visible en el tracked_item del SRS.

## Histórico de sesiones

- Lista de cards (acceso por menú secundario):
  - Título: `scenario` (si roleplay) o resumen autogenerado.
  - Fecha + duración.
  - Tags como chips.
  - Mini-resumen (1-2 líneas).
  - Contadores por color (🔴 N · 🟡 N · 🔵 N).
- **Tap en card** → abre la pantalla de feedback de esa sesión completa, navegable, idéntica a cuando recién terminó.
- Los tags son los mismos que los usados para exportar a Obsidian (ver [MEMORY_SYSTEM.md](MEMORY_SYSTEM.md)) — consistencia entre la app y el vault.

## Costos de IA

- 1 sola llamada LLM grande por sesión (no por turno).
- Plan Go de OpenCode lo cubre cómodamente.
- **Cache de explicaciones por `tracked_item`**: la primera vez que aparece "rolling down the deep" se genera la explicación; las siguientes veces se reutiliza (y el LLM la puede refinar si el usuario lo trabaja en deep-dive).
- Deep-dives son sub-sesiones cortas, así que su feedback es barato.

## Graduación de Tracked Items (SRS)

**Criterio elegido: Híbrido + confirmación manual (Opción C).**

Un tracked item está listo para graduarse cuando:
- `weight <= 0` (ningún error reciente, posiblemente con rechazos)
- Y `srs_state.interval >= 14` (14 días desde el último repaso — retención confirmada)

Cuando ambas condiciones se cumplen, la app muestra una sugerencia suave (no-intrusiva):
> *"Parece que ya dominas 'run into' — ¿archivarlo?"*
> [**Archivar**] [Seguir practicando]

- **Al archivar:** `tracked_items.archived = true`. El item deja de aparecer en el SRS activo y en los nudges del LLM, pero se guarda en una sección "Graduados" consultable. No se elimina de la DB.
- **Al ignorar:** El item sigue activo. La sugerencia reaparece si las condiciones se mantienen en la siguiente sesión.

## Error Pattern Detection

Al generar el feedback de una sesión, la Edge Function `generate-feedback` consulta si el usuario ha cometido el mismo error (mismo `lemma`) en 3 o más sesiones distintas previas.

Si detecta patrones:
- Se añade una **tarjeta de Pattern Insight** al tope del FeedbackScreen (ver [UX_UI.md](UX_UI.md)).
- Ejemplo: *"Llevas 4 sesiones confundiendo 'make' vs 'do' — ¿quieres practicarlo ahora?"* con botón para abrir deep-dive directo sobre ese item.
- La tarjeta es dismissable. Solo aparece si hay patrones reales; no existe en la mayoría de sesiones.
- No interrumpe la conversación activa.

## Resumen de decisiones de diseño

| Punto | Decisión |
|---|---|
| Generación de feedback | Solo al final de sesión, no en tiempo real |
| Reintentos JSON | 2 reintentos, luego popup + HITL opcional |
| Rechazo de span | Sí — reduce weight, archiva si rejections ≥ 2 y weight = 0 |
| Graduación SRS | Híbrido (weight=0 + interval≥14d) + confirmación manual |
| Vocabulary in Context | Auditable — badge "✓ usado en sesión" al finalizar |
| Pronunciación | Score asíncrono post-turno via Azure Speech (ver [PRODUCT.md](PRODUCT.md)) |
