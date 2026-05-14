# CLAUDE.md — Contexto del Orquestador

Este archivo es el contexto de trabajo exclusivo para Claude (Sonnet 4.x). Define el rol, el estado actual del proyecto y los criterios de supervisión sobre el código generado por Gemini (Copilot).

---

## Rol de Claude en este proyecto

**Orquestador, Arquitecto y Supervisor.** No genera código de implementación salvo que haya un fallo crítico o una corrección puntual necesaria. Las responsabilidades son:

1. **Revisar** el código generado por Gemini/Copilot y detectar desviaciones del plan.
2. **Aprobar o rechazar** cambios antes de que se apliquen a sistemas externos (Supabase, APIs, GitHub).
3. **Evolucionar los specs** cuando Gemini proponga algo disruptivo y bueno — evaluarlo, documentarlo en los `.md` correspondientes y actualizar `TASKS.md`.
4. **Mantener coherencia** entre todos los documentos de specs, el schema de DB y el código en producción.
5. **Alertar** cuando algo se salga de la línea planificada.

---

## Estado del proyecto

**App:** LanguAI — práctica de idiomas voz↔voz con IA (EN B2 + DE A1 MVP).  
**Stack:** React Native + Expo 52 / Supabase / OpenCode proxy (LLM) / Groq Whisper (STT) / OpenAI TTS / pgvector (RAG) / Azure Speech (pronunciation).  
**Repo local:** `C:\Users\enzoo\OneDrive\Escritorio\languai`  
**Specs:** en `crafting/` (o raíz según migración).

### Fases completadas
- [x] **Fase 0** — Fundación del repo (Expo + TS + deps + estructura)
- [x] **Fase 1** — Backend skeleton: 4 migraciones SQL generadas y revisadas. Migraciones **pendientes de aplicar en Supabase**.
- [ ] **Fase 2** — App shell, theming, navegación swipe ← *siguiente*

### Issues conocidos a resolver en próximas fases
| Issue | Fase | Prioridad |
|---|---|---|
| `tailwind.config.js` tiene `content: []` vacío | Antes de Fase 2 | Alta |
| `chat-turn` usa Deno std@0.168.0 en vez de `Deno.serve()` | Fase 3 | Media |
| `session_analytics` no tiene auto-refresh | Fase 13.5 | Baja |
| Tipos TypeScript de Supabase no generados (`supabase gen types`) | Fase 1 cierre | Media |

---

## Specs de referencia (archivos canónicos)

| Archivo | Contenido |
|---|---|
| `crafting/ARCHITECTURE.md` | Stack, schema DB completo (DDL), Edge Functions, latencias, deuda multi-idioma |
| `crafting/TASKS.md` | Roadmap de ~130 tareas en 17 fases — fuente de verdad de ejecución |
| `crafting/PRODUCT.md` | Visión, features core y secundarias |
| `crafting/FEEDBACK.md` | Pipeline feedback, colores, deep-dive, graduación SRS, Error Pattern |
| `crafting/ROLEPLAY.md` | Flujo roleplay, personaje fijo, cierre narrativo |
| `crafting/MEMORY_SYSTEM.md` | RAG, Obsidian export, Weekly Report, GitHub sync |
| `crafting/UX_UI.md` | Onboarding (5 pasos), pantallas, glassmorphism, swipes + fallbacks |
| `crafting/COSTS.md` | Estimación costos (~$1.41/mes plan primario, ~$1.52 fallback) |

---

## Decisiones de diseño clave (no negociables)

### UX
- Navegación por **swipe horizontal** (pager-view), no tab bar. Swipe izq = Roleplay, swipe der = SRS + Shadow Reading.
- **Cada swipe tiene botón fallback** visible.
- **Onboarding** de 5 pasos antes del primer uso (`onboarding_completed` en `user_settings`).
- **Zero-friction:** audio < 2s → ignorar silenciosamente, sin llamar APIs.
- Dark mode por defecto, glassmorphism, haptics consistentes.

### Feedback
- Se genera **solo al final de sesión** (nunca en tiempo real).
- **2 reintentos** de JSON parse; si fallan → popup + HITL opcional.
- Rechazo de span: reduce `weight`, incrementa `user_rejections`; archiva si `user_rejections >= 2` y `weight <= 0`.
- **Graduación SRS (Opción C):** `weight <= 0` AND `srs_state.interval >= 14d` → sugerencia manual al usuario.

### Backend
- **Supabase** como único backend (Edge Functions Deno, pgvector, Realtime, Auth Magic Link).
- LLM via **OpenCode proxy** (plan Go). Fallback: cambiar `LLM_ENDPOINT` + `LLM_MODEL` a GPT-4o Mini directo.
- Audio nunca se persiste — solo texto transcrito (privacidad + costo).
- RLS activo en todas las tablas. Edge Functions usan service role key.

### Schema (campos críticos, verificar siempre)
- `tracked_items`: tiene `user_rejections int default 0` — verificar que Gemini no lo omita.
- `user_settings`: tiene `native_language`, `languages_config jsonb`, `onboarding_completed bool`.
- `sessions.feedback_status`: enum `pending | processing | done | failed`.
- `session_turns`: en Fase 3.5 se añade `pronunciation_score float` (no está aún en las migraciones).

---

## Checklist de supervisión (usar en cada revisión)

Cuando Gemini entregue código, verificar:

### Siempre
- [ ] ¿El archivo/función corresponde a la tarea de TASKS.md que se está ejecutando?
- [ ] ¿Se respetan los nombres de tablas, campos y tipos del schema de ARCHITECTURE.md?
- [ ] ¿Las Edge Functions usan `Deno.serve()` (no el import antiguo de std@0.168.0)?
- [ ] ¿Los servicios del front llaman a Supabase con el cliente de `src/lib/supabase.ts`?
- [ ] ¿Se respeta la estructura de carpetas `src/{screens,components,stores,services,hooks,lib,types,theme}`?

### Para UI/UX
- [ ] ¿Usa NativeWind (clases Tailwind) en vez de StyleSheet.create?
- [ ] ¿Los swipes corresponden al mapeado correcto (izq=Roleplay, der=SRS)?
- [ ] ¿Hay botón fallback para cada swipe?
- [ ] ¿El glassmorphism usa `expo-blur`?

### Para Edge Functions
- [ ] ¿Tienen CORS headers correctos?
- [ ] ¿Validan el body con guard clauses antes de procesar?
- [ ] ¿Usan `service_role` para operaciones de escritura en DB (no anon)?

### Para lógica de feedback/SRS
- [ ] ¿El JSON de feedback tiene exactamente los campos del spec (turns[].annotations[], summary, tags, tracked_items[])?
- [ ] ¿El SM-2 está en `src/lib/srs.ts` y no duplicado en otro lado?
- [ ] ¿La lógica de `user_rejections` y graduación están en el store o en la Edge Function, no en el componente?

---

## Cómo evaluar propuestas disruptivas de Gemini

Si Gemini propone algo que **no está en el plan** pero parece buena idea:

1. Evaluar si rompe alguna decisión no-negociable (arriba).
2. Si no rompe nada → documentar en el spec correspondiente y añadir tarea en TASKS.md.
3. Si mejora algo existente → actualizar el spec y la tarea.
4. Si contradice una decisión de diseño → rechazar y explicar el motivo.
5. Si es una feature nueva válida → agregarla en la fase correcta de TASKS.md (no intercalar en fases activas).

---

## Variables de entorno esperadas

```env
# Supabase
EXPO_PUBLIC_SUPABASE_URL=
EXPO_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # solo en Edge Functions, nunca en el cliente

# LLM (OpenCode proxy)
OPENCODE_API_KEY=
OPENCODE_BASE_URL=

# STT
GROQ_API_KEY=

# TTS
OPENAI_API_KEY=              # también para embeddings

# Pronunciation
AZURE_SPEECH_KEY=
AZURE_SPEECH_REGION=

# YouTube
GEMINI_API_KEY=

# GitHub (Obsidian export — cifrado en DB, no en .env)
# Se almacena en user_settings.github_token_encrypted via pgcrypto
```

---

## Notas de colaboración

- **Gemini genera, Claude revisa.** No duplicar trabajo.
- Si hay un fallo puntual en el código de Gemini, Claude puede corregirlo directamente con Edit.
- Si el fallo es estructural (afecta múltiples archivos o el schema), Claude documenta el problema, propone la corrección y Gemini re-genera.
- Las migraciones SQL siempre pasan por revisión de Claude antes de aplicarse en Supabase.
- Antes de avanzar de fase, la verificación ✅ de TASKS.md debe estar pasando.
