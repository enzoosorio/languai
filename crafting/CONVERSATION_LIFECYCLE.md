# CONVERSATION_LIFECYCLE — Ciclo de vida de una sesión conversacional

Documento dedicado al estado y transiciones de una conversación voz↔voz, desde el primer tap hasta el resumen post-sesión. Complementa [UX_UI.md](UX_UI.md) (visual) y [FEEDBACK.md](FEEDBACK.md) (qué se hace con la sesión cerrada).

---

## 1. Estados del ciclo

```
┌─────────┐
│  IDLE   │  ── tap mic ──►  ┌───────────┐
└─────────┘                  │ LISTENING │  ── tap mic ──►  ┌────────────┐
                             └───────────┘                  │ PROCESSING │
                                  │                         └────────────┘
                                  │ <2s → discard                  │
                                  ▼                                ▼
                             ┌─────────┐                     ┌──────────┐
                             │  IDLE   │ ◄─── audio done ────│ SPEAKING │
                             └─────────┘                     └──────────┘
                                                                  │
                                                          end conversation
                                                                  │
                                                                  ▼
                                                            ┌─────────┐
                                                            │ CLOSING │  (loader)
                                                            └─────────┘
                                                                  │
                                                                  ▼
                                                            ┌─────────┐
                                                            │ SUMMARY │  (FeedbackScreen)
                                                            └─────────┘
```

| Estado | UI | Permite navegación | Mic enabled |
|---|---|---|---|
| `idle` | Home normal (swipes + edge buttons + pills) | Sí | Sí |
| `listening` | Focus parcial (edges fade 30%, swipe disabled) | No | Tap = stop |
| `processing` | Focus parcial + spinner | No | No |
| `speaking` | Focus parcial + waveform reactivo | No | No |
| `in_session` (idle entre turnos, ya hay turnos persistidos) | **Focus completo** (edges hidden, End button visible) | No (solo End / Back) | Sí |
| `closing` | Spinner full-screen *"Wrapping up your conversation…"* | No | No |
| `summary` | `FeedbackScreen` (ver [FEEDBACK.md](FEEDBACK.md)) | Sí | — |

---

## 2. Triggers de transición

### 2.1 Entrada a focus mode (fade progresivo)

Decisión: el focus mode no aparece de golpe. Se aplica un **fade progresivo en tres pasos** para evitar la sensación de "ventana muerta":

| Momento | Cambio visual |
|---|---|
| Tap 1 (start recording) | Edge buttons + swipes pasan a `opacity: 0.3`, gestos swipe se bloquean. NO desaparecen. |
| Tap 2 → primera respuesta de IA persistida | **Focus completo**: edges con `opacity: 0` (display none), aparece botón **End conversation** abajo + botón **Back** arriba-izq |
| Discard <2s | Fade-back a `opacity: 1.0` (transición 200ms) |

**Justificación:** hold-to-start (1.5s) fue evaluado y descartado:
- Contradice el gesto tap-toggle ya elegido para los turnos
- Agrega fricción acumulativa
- No soluciona la "inconsistencia" — solo la mueve antes

**Justificación de no entrar en focus completo desde tap 1:** el usuario puede tapear para probar el mic y cancelar (audio <2s). Si entramos en focus completo de inmediato, tendríamos que salir bruscamente.

### 2.2 Salida de focus mode (cerrar conversación)

Hay **dos formas equivalentes** de cerrar:

1. **Manual:** botón "End conversation" siempre visible durante focus mode
2. **Inferido por la IA:** tool call `end_conversation` (ver §3)

Ambas disparan el mismo flujo: `closing → summary`.

Una tercera forma como **safety**: botón "Back" superior izquierdo durante focus, que ofrece **descartar la sesión sin guardar** (modal de confirmación si hay ≥2 turnos). Cierra sin generar feedback.

---

## 3. Detección de despedida vía tool call

### 3.1 Decisión

Usar **function calling** del LLM en `chat-turn`, no prompt engineering con sentinel tokens. Razones:

- Mismo round-trip — no agrega latencia
- JSON estructurado, schema validado
- Campo `confidence` numérico explícito
- API estandarizada cross-proveedor (OpenAI, DeepSeek, Anthropic)

### 3.2 Schema del tool

```typescript
{
  type: 'function',
  function: {
    name: 'end_conversation',
    description: `Call ONLY when the user clearly intends to end the conversation 
                  (says goodbye, "see you later", "I have to go", "let's stop here", etc.).
                  Do NOT call if the farewell appears in a quoted or narrated context 
                  like "I said goodbye to him" or "...and then she said see you later".`,
    parameters: {
      type: 'object',
      properties: {
        confidence: {
          type: 'number',
          description: 'How sure you are that the user is ending the conversation (0.0-1.0)'
        },
        farewell_phrase: {
          type: 'string',
          description: 'The exact phrase used by the user'
        },
        reasoning: {
          type: 'string',
          description: 'Brief justification: why you believe this is a real farewell vs narrated'
        }
      },
      required: ['confidence', 'farewell_phrase', 'reasoning']
    }
  }
}
```

### 3.3 Lógica de confianza

| Confidence | Acción de la app |
|---|---|
| ≥ 0.85 | Cierre directo. El `ai_text` natural de despedida se reproduce, luego `closing → summary`. |
| 0.50 – 0.84 | La respuesta del LLM **ya incluye** un cierre soft ("It was great talking with you. Bye for now!"). La app marca el `sessionStore.pending_close = true`. Si el próximo turno del usuario es **corto (<5 palabras) y afirmativo o vacío**, cerramos. Si retoma conversación, se cancela `pending_close`. |
| < 0.50 | Ignorar. Conversación sigue. |

### 3.4 Ejemplos esperados de comportamiento

| Input usuario | Tool call esperado | Acción |
|---|---|---|
| "Ok, see you later, bye!" | `confidence: 0.95` | Cierre directo |
| "I think I have to go now" | `confidence: 0.85` | Cierre directo |
| "Anyway, this is interesting. Let's wrap up." | `confidence: 0.70` | Soft close, esperar confirmación |
| "And then I told him goodbye and left." | `confidence: 0.10` | No cierra (contexto narrado) |
| "Goodbye is such a weird word in English" | `confidence: 0.05` | No cierra (meta-conversación) |
| "Hi! How are you?" | (no tool call) | Conversación normal |

### 3.5 Override manual

El botón **End conversation** siempre está disponible y prevalece sobre la lógica del LLM. Es la garantía de salida.

---

## 4. Flujo post-cierre

```
estado: closing
  │
  ├─ trigger 'session.ended' event
  │
  ├─ paralelo (todos fire-and-forget desde la app):
  │  ├─ UPDATE sessions SET ended_at = now(), feedback_status='processing'
  │  ├─ invoke generate-feedback Edge Function
  │  ├─ invoke extract-facts Edge Function  
  │  ├─ invoke export-obsidian Edge Function (si github_token configurado)
  │  └─ refresh session_analytics (materialized view)
  │
  ├─ App suscribe a Supabase Realtime sobre sessions.feedback_status
  │
  ├─ Mostrar loader "Wrapping up your conversation…" (max 8s timeout)
  │
  └─ Cuando feedback_status='done' → navegar a FeedbackScreen (estado: summary)
```

**Si timeout >8s sin respuesta:** mostrar opción "Continue waiting" + "View partial summary" (lo que haya en `sessions.summary` aunque sea null). La sesión queda persistida igual, el feedback puede llegar después.

---

## 5. Casos borde

### Audio <2s en mitad de conversación
- Se descarta silenciosamente (`useVoiceRecording.stopRecording → null`)
- NO cuenta como turno, NO persiste
- El focus mode no cambia (seguimos en `in_session` si ya había turnos previos)

### Pérdida de conexión durante turno
- STT/LLM/TTS errors → toast non-blocking, vuelve a `idle` dentro del session
- La sesión sigue activa, el usuario puede reintentar
- No se cierra la sesión por errores transitorios

### App va a background durante speaking
- El audio sigue reproduciéndose (config de background audio mode)
- Al volver, el estado se preserva
- Detalle de implementación: ver Fase 13 en [TASKS.md](TASKS.md)

### Usuario tapea Back durante focus
- Si la sesión tiene ≥2 turnos → modal: *"Discard this conversation? Progress won't be saved."* con botones [Discard] / [Keep talking]
- Si tiene <2 turnos → discard directo, sin modal

### Tool call con confidence intermedia que el usuario sigue hablando
- `pending_close` se resetea automáticamente cuando el usuario responde con >5 palabras
- No se acumula, no requiere lógica extra

---

## 6. Implementación cross-referencia

| Concepto | Archivo / componente |
|---|---|
| Estado del lifecycle | `useSessionStore` ([ARCHITECTURE.md](ARCHITECTURE.md)) |
| Tool call setup | `supabase/functions/chat-turn/index.ts` |
| Focus mode visual | `HomeScreen.tsx` + nueva sección en [UX_UI.md](UX_UI.md) |
| End conversation button | `HomeScreen.tsx` (focus mode footer) |
| Closing → summary navigation | `App.tsx` PagerView o modal stack según diseño final |
| Loader durante closing | `<SessionClosingScreen />` (nuevo componente) |

---

## 7. Open issues

- [ ] **Definir** animación específica del fade progresivo (duración, easing)
- [ ] **Decidir** si el botón Back en focus permite minimizar a una "burbuja pendiente" en vez de descartar (similar a deep-dive)
- [ ] **Validar empíricamente** los thresholds de confidence con 30+ sesiones reales antes de fijarlos
- [ ] **Cómo notificar** al usuario que la IA infirió despedida cuando él no quería terminar — ¿botón "Continue anyway" durante el closing loader?
