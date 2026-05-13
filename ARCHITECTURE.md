# Architecture & Tech Stack

## Decisiones de arquitectura clave

| Decisión | Elección | Motivo |
|---|---|---|
| Backend | Supabase | Auth + DB + Edge Functions + Realtime en uno, sin infra propia |
| LLM Core | OpenCode proxy (GPT-4o / Claude Sonnet) | Plan Go cubre costo, compatible con OpenAI SDK |
| STT | Groq Whisper API | ~300ms, precio casi nulo |
| TTS MVP | OpenAI TTS (`nova`) | Simple, ~400ms, barato |
| TTS V2 | ElevenLabs Turbo WebSocket | Streaming phrase-by-phrase, latencia percibida < 1s |
| LLM Voice MVP | Full response → TTS | Confiable, 2-3s total de latencia — aceptable |
| LLM Voice V2 | Streaming + TTS phrase-by-phrase | Menor latencia pero solo cuando sea 100% fluido |
| YouTube | Gemini 1.5 Flash | Multimodal nativo, cuota gratuita generosa |
| Vector DB | pgvector en Supabase | Sin infra extra, integrado con el resto del esquema |
| Auth | Supabase Magic Link (email) | Cero SDK extra, multi-usuario ready para open-source |
| Audio clips | No se guardan | Solo texto transcripto. Privacidad + cero costo |
| Realtime | Supabase Realtime (Postgres Changes) | Notificación de feedback listo sin polling |
| Obsidian sync | GitHub REST API + Obsidian Git plugin | Sin pagar Obsidian Sync, vault siempre actualizado. PR como fallback si el PUT directo falla. |
| Pronunciation | Azure Speech Pronunciation Assessment | API dedicada, breakdown fonético, alternativa: Speechace API |

---

## 1. Diagrama de Infraestructura (Topología)

```
┌─────────────────────────────────────────────────────────────────────┐
│                        DISPOSITIVO MÓVIL                            │
│  React Native + Expo                                                │
│  ┌──────────┐  ┌──────────┐  ┌───────────┐  ┌──────────────────┐   │
│  │  Zustand │  │ expo-av  │  │ NativeWind│  │  expo-haptics    │   │
│  │  (state) │  │ (audio)  │  │  (UI)     │  │  Reanimated      │   │
│  └──────────┘  └──────────┘  └───────────┘  └──────────────────┘   │
└─────────────────────┬───────────────────────────────────────────────┘
                      │ HTTPS / SSE / Supabase JS SDK
                      │
┌─────────────────────▼───────────────────────────────────────────────┐
│                         SUPABASE                                    │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Postgres (pgvector + pgcrypto)                              │   │
│  │  ┌──────────────┐ ┌──────────────┐ ┌──────────────────────┐ │   │
│  │  │  Auth tables │ │  App tables  │ │  user_facts (vector) │ │   │
│  │  └──────────────┘ └──────────────┘ └──────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────┘   │
│  ┌────────────────────┐  ┌─────────────────┐  ┌─────────────────┐  │
│  │  Supabase Realtime │  │  Supabase Auth  │  │  Supabase Storage│ │
│  │  (Postgres Changes)│  │  (Magic Link)   │  │  (futuro: imgs) │  │
│  └────────────────────┘  └─────────────────┘  └─────────────────┘  │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │  Edge Functions (Deno)                                       │   │
│  │  ┌─────────────┐ ┌──────────────────┐ ┌────────────────────┐│   │
│  │  │ chat-turn   │ │generate-feedback │ │generate-roleplay   ││   │
│  │  └──────┬──────┘ └────────┬─────────┘ └────────────────────┘│   │
│  │  ┌──────┴──────┐ ┌────────┴─────────┐ ┌────────────────────┐│   │
│  │  │analyze-     │ │extract-facts     │ │export-obsidian     ││   │
│  │  │youtube      │ └──────────────────┘ └────────────────────┘│   │
│  │  └─────────────┘                                             │   │
│  └──────────────────────────────────────────────────────────────┘   │
└──────────────────────────┬──────────────────────────────────────────┘
                           │ HTTPS
          ┌────────────────┼──────────────────────┐
          │                │                      │
    ┌─────▼──────┐  ┌──────▼──────┐    ┌──────────▼─────┐
    │ OpenCode   │  │ Groq Whisper│    │  OpenAI TTS /  │
    │ Proxy      │  │ STT API     │    │  ElevenLabs     │
    │ (GPT-4o /  │  │ ~300ms      │    │  ~400ms / ~200ms│
    │  Claude)   │  └─────────────┘    └────────────────┘
    └────────────┘
          │
    ┌─────▼──────────┐      ┌──────────────┐
    │ Gemini 1.5     │      │  GitHub      │
    │ Flash          │      │  REST API    │
    │ (YouTube)      │      │  (Obsidian   │
    └────────────────┘      │   export)    │
                            └──────────────┘
```

---

## 2. Schema de Base de Datos (Normalizado)

### Diagrama ER

```
auth.users (Supabase built-in)
    │ 1
    │
    ▼ 1
profiles ──────────────── user_settings
    │ 1                        (1:1)
    │
    ├──────────── user_streaks (1:1)
    │
    ├──────────── tracked_items (1:N)
    │                 │ N
    │                 │ ◄── feedback_annotations (N:1, optional)
    │                 │ ◄── deep_dive_sessions.tracked_item_id
    │
    ├──────────── user_facts (1:N, embeddings pgvector)
    │
    ├──────────── roleplay_topic_batches (1:N)
    │
    └──────────── sessions (1:N)
                      │ 1
                      ├──────── session_turns (1:N)
                      │              │ 1
                      │              └──── feedback_annotations (1:N)
                      │
                      └──────── deep_dive_sessions (1:N)
                                    │ parent_session_id
                                    │ dive_session_id ──► sessions
                                    └ tracked_item_id ──► tracked_items
```

### DDL completo y normalizado

```sql
-- ─── EXTENSIONES ────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgvector";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── PROFILES ────────────────────────────────────────────────────────
-- Extiende auth.users de Supabase. Se crea automáticamente via trigger.
CREATE TABLE profiles (
  id           uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email        text NOT NULL,
  display_name text,
  created_at   timestamptz DEFAULT now()
);

-- ─── USER SETTINGS ───────────────────────────────────────────────────
CREATE TABLE user_settings (
  user_id                  uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  native_language          text NOT NULL DEFAULT 'es',  -- idioma nativo del usuario
  active_language          text NOT NULL DEFAULT 'en',  -- idioma activo en sesión: 'en' | 'de'
  active_level             text NOT NULL DEFAULT 'B2',
  languages_config         jsonb NOT NULL DEFAULT      -- nivel por idioma: {"en":"B2","de":"A1"}
    '{"en":"B2","de":"A1"}'::jsonb,
  theme                    text NOT NULL DEFAULT 'dark', -- 'dark' | 'light'
  tts_voice                text NOT NULL DEFAULT 'nova',
  github_token_encrypted   text,    -- cifrado con pgcrypto antes de guardar
  github_repo              text,
  onboarding_completed     bool NOT NULL DEFAULT false,
  updated_at               timestamptz DEFAULT now()
);

-- ─── USER STREAKS ────────────────────────────────────────────────────
CREATE TABLE user_streaks (
  user_id          uuid PRIMARY KEY REFERENCES profiles(id) ON DELETE CASCADE,
  current_streak   int NOT NULL DEFAULT 0,
  longest_streak   int NOT NULL DEFAULT 0,
  last_session_date date,
  updated_at       timestamptz DEFAULT now()
);

-- ─── SESSIONS ────────────────────────────────────────────────────────
-- Una sesión = una conversación cerrada (libre, roleplay o deep_dive).
CREATE TABLE sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type             text NOT NULL CHECK (type IN ('free','roleplay','deep_dive')),
  language         text NOT NULL,            -- 'en' | 'de'
  level            text NOT NULL,            -- 'B2', 'A1', ...
  scenario         text,                     -- frase del roleplay (si aplica)
  started_at       timestamptz NOT NULL DEFAULT now(),
  ended_at         timestamptz,
  summary          text,                     -- resumen autogenerado al cerrar
  tags             text[]        NOT NULL DEFAULT '{}',
  youtube_context  jsonb,                    -- contexto extraído por Gemini si aplica
  feedback_status  text NOT NULL DEFAULT 'pending'
                   CHECK (feedback_status IN ('pending','processing','done','failed')),
  created_at       timestamptz NOT NULL DEFAULT now()
);

-- Índices: las queries más frecuentes son por user + fecha y por feedback_status
CREATE INDEX idx_sessions_user_date   ON sessions(user_id, started_at DESC);
CREATE INDEX idx_sessions_type        ON sessions(user_id, type);
CREATE INDEX idx_sessions_tags        ON sessions USING GIN(tags);
CREATE INDEX idx_sessions_feedback    ON sessions(feedback_status)
  WHERE feedback_status != 'done';       -- partial index: solo sesiones pendientes

-- ─── SESSION TURNS ───────────────────────────────────────────────────
CREATE TABLE session_turns (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  idx          int NOT NULL,             -- orden dentro de la sesión (0-based)
  speaker      text NOT NULL CHECK (speaker IN ('user','ai')),
  text         text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, idx)               -- garantiza orden consistente
);

CREATE INDEX idx_turns_session ON session_turns(session_id, idx);

-- ─── TRACKED ITEMS ───────────────────────────────────────────────────
-- Librería personal de errores/advertencias. Alimenta SRS y nudges.
CREATE TABLE tracked_items (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text                text NOT NULL,     -- forma de superficie ("rolling down the deep")
  lemma               text NOT NULL,     -- forma normalizada ("roll_down")
  severity            text NOT NULL CHECK (severity IN ('error','warning','improvement')),
  category            text NOT NULL,     -- 'grammar'|'vocab'|'context'|'phrasal'|'register'
  explanation         text NOT NULL,     -- explicación cacheada (no regenerar cada vez)
  weight              float NOT NULL DEFAULT 0.5,   -- 0..1, acumulativo
  first_seen_session  uuid REFERENCES sessions(id),
  last_seen_session   uuid REFERENCES sessions(id),
  -- SM-2: interval (días), ease (2.5 default), repetitions, next_review (ISO date)
  srs_state           jsonb NOT NULL DEFAULT
    '{"interval":1,"ease":2.5,"repetitions":0,"next_review":null}'::jsonb,
  archived            bool NOT NULL DEFAULT false,
  user_rejections     int  NOT NULL DEFAULT 0,  -- veces que el usuario marcó "no era error"
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, lemma)               -- un item por lema por usuario
);

CREATE INDEX idx_tracked_user         ON tracked_items(user_id);
CREATE INDEX idx_tracked_weight       ON tracked_items(user_id, weight DESC)
  WHERE archived = false;
CREATE INDEX idx_tracked_srs          ON tracked_items(user_id, ((srs_state->>'next_review')))
  WHERE archived = false;              -- para queries de "qué repasar hoy"

-- ─── FEEDBACK ANNOTATIONS ────────────────────────────────────────────
CREATE TABLE feedback_annotations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  turn_id          uuid NOT NULL REFERENCES session_turns(id) ON DELETE CASCADE,
  span_start       int NOT NULL,         -- offset en caracteres en turn.text
  span_end         int NOT NULL,
  severity         text NOT NULL CHECK (severity IN ('error','warning','improvement')),
  category         text NOT NULL,
  explanation      text NOT NULL,        -- corta, para tooltip
  suggestion       text NOT NULL,
  tracked_item_id  uuid REFERENCES tracked_items(id),  -- link si fue promovido a la librería
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_annotations_turn     ON feedback_annotations(turn_id);
CREATE INDEX idx_annotations_severity ON feedback_annotations(turn_id, severity);
CREATE INDEX idx_annotations_tracked  ON feedback_annotations(tracked_item_id)
  WHERE tracked_item_id IS NOT NULL;

-- ─── DEEP DIVE SESSIONS ──────────────────────────────────────────────
-- Relaciona una sub-conversación de deep-dive con su sesión madre y su tracked_item.
CREATE TABLE deep_dive_sessions (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  parent_session_id   uuid NOT NULL REFERENCES sessions(id),
  tracked_item_id     uuid NOT NULL REFERENCES tracked_items(id),
  dive_session_id     uuid NOT NULL REFERENCES sessions(id),  -- la sesión real (type='deep_dive')
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_deep_dive_parent  ON deep_dive_sessions(parent_session_id);
CREATE INDEX idx_deep_dive_item    ON deep_dive_sessions(tracked_item_id);

-- ─── USER FACTS (RAG) ────────────────────────────────────────────────
-- Hechos atómicos sobre el usuario extraídos al final de cada sesión.
CREATE TABLE user_facts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  text             text NOT NULL,
  embedding        vector(1536),         -- OpenAI text-embedding-3-small
  source_session   uuid REFERENCES sessions(id),
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_facts_user      ON user_facts(user_id);
CREATE INDEX idx_facts_embedding ON user_facts
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);                    -- IVFFlat: rápido para colecciones personales (<50k)

-- ─── ROLEPLAY TOPIC BATCHES ──────────────────────────────────────────
-- Cache de frases de escenario pre-generadas para el dado.
CREATE TABLE roleplay_topic_batches (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  language    text NOT NULL,
  level       text NOT NULL,
  topics      text[] NOT NULL,           -- array de 5 frases de escenario
  used_count  int NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_topics_user ON roleplay_topic_batches(user_id, language, created_at DESC);

-- ─── SESSION ANALYTICS (vista materializada) ─────────────────────────
-- Métricas agregadas por semana para Weekly Report y pantalla Stats.
CREATE MATERIALIZED VIEW session_analytics AS
SELECT
  user_id,
  date_trunc('week', started_at)              AS week_start,
  COUNT(*)                                    AS session_count,
  COALESCE(SUM(EXTRACT(EPOCH FROM (ended_at - started_at))/60), 0)::int AS total_minutes,
  AVG(EXTRACT(EPOCH FROM (ended_at - started_at))/60)::int              AS avg_minutes
FROM sessions
WHERE ended_at IS NOT NULL
GROUP BY user_id, date_trunc('week', started_at);

CREATE INDEX idx_analytics_user_week ON session_analytics(user_id, week_start DESC);

-- ─── TRIGGER: auto-crear profile al registrarse ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO profiles(id, email)
  VALUES (NEW.id, NEW.email);
  INSERT INTO user_settings(user_id) VALUES (NEW.id);
  INSERT INTO user_streaks(user_id)  VALUES (NEW.id);
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();
```

---

## 3. Diagramas de Flujo

### 3.1 Voice Loop — MVP (Full Response → TTS)

```
App (RN)                  Groq STT          Edge: chat-turn      OpenCode LLM      OpenAI TTS
   │                          │                    │                   │                │
   │── graba audio ──────────►│                    │                   │                │
   │◄── transcripción (~300ms)│                    │                   │                │
   │                          │                    │                   │                │
   │── POST /chat-turn ───────────────────────────►│                   │                │
   │   {session_id, user_text,│                    │                   │                │
   │    lang, level}          │                    │── build prompt ──►│                │
   │                          │                    │   (RAG context +  │                │
   │                          │                    │    nudge items)   │                │
   │                          │                    │◄── ai_text (~1s) ─│                │
   │                          │                    │                   │                │
   │                          │                    │── POST TTS ───────────────────────►│
   │                          │                    │◄── audio bytes (~400ms) ───────────│
   │                          │                    │                   │                │
   │◄── {ai_text, audio_b64} ─────────────────────│                   │                │
   │                          │                    │                   │                │
   │── reproduce audio ───────────────────────────────────────────────────────────────►│
   │── persiste turno (user + ai) en session_turns │                   │                │
```

**Latencia total MVP: ~300 + ~1000 + ~400 = ~1.7s** (típico en respuestas cortas)

### 3.2 Voice Loop — V2 (Streaming Phrase-by-Phrase)

```
App (RN)              Edge: chat-turn         OpenCode LLM        ElevenLabs WS
   │                        │                       │                   │
   │── POST /chat-turn ────►│                       │                   │
   │   Accept: text/event-  │── stream: true ──────►│                   │
   │   stream               │◄─ token... ───────────│                   │
   │                        │◄─ token... ───────────│                   │
   │                        │   [detecta boundary]  │                   │
   │                        │── send sentence 1 ────────────────────────►│
   │◄── SSE: {type:"text",  │◄─ audio chunk 1 (ws)──────────────────────│
   │    chunk: "..."}       │                       │                   │
   │── reproduce chunk 1 ──►│                       │                   │
   │                        │◄─ token... ───────────│                   │
   │                        │   [detecta boundary]  │                   │
   │                        │── send sentence 2 ────────────────────────►│
   │◄── SSE: {type:"audio", │◄─ audio chunk 2 ──────────────────────────│
   │    chunk: "..."}       │                       │                   │
   │── reproduce chunk 2 ──►│                       │                   │
```

**Latencia percibida V2: ~300ms STT + ~600ms al primer audio = ~0.9s**

> **Decisión**: MVP arranca con 3.1 (full response). El código de `chat-turn` se escribe con una flag `STREAMING=false` que se activa en V2 sin cambiar la interfaz de la app.

### 3.3 Notificación de Feedback listo (Supabase Realtime)

```
App (RN)                  Supabase Realtime         Edge: generate-feedback
   │                            │                             │
   │── subscribe ──────────────►│                             │
   │   sessions WHERE           │                             │
   │   id = session_id          │                             │
   │                            │                             │
   │── "End session" ──────────────────────────────────────►│
   │   (sets ended_at)          │                            │── análisis LLM
   │                            │                            │── escribe annotations
   │                            │                            │── upsert tracked_items
   │                            │                            │── UPDATE sessions
   │                            │◄── Postgres change ────────│   SET feedback_status='done'
   │◄── evento realtime ────────│
   │   {feedback_status:'done'} │
   │                            │
   │── navega a FeedbackScreen ►│
```

### 3.4 Pipeline completo post-sesión (Feedback + RAG + Obsidian)

```
Usuario cierra sesión
         │
         ▼
Edge: generate-feedback (asíncrona)
 ├── Lee session_turns de Supabase
 ├── Llama LLM con transcripción completa
 │   └── Devuelve JSON: turns[].annotations[], summary, tags, tracked_items[]
 ├── Valida JSON (retry si falla parse)
 ├── Escribe feedback_annotations
 ├── UPSERT tracked_items (acumula weight, actualiza srs_state)
 └── UPDATE sessions SET summary, tags, feedback_status='done'
         │
         ├──► Supabase Realtime notifica a la App
         │
         ▼
Edge: extract-facts (dispara en paralelo)
 ├── LLM pequeño extrae 3-8 hechos atómicos de la sesión
 ├── Genera embeddings (OpenAI text-embedding-3-small)
 └── INSERT user_facts con embedding
         │
         ▼
Edge: export-obsidian (dispara si github_token configurado)
 ├── Formatea Markdown con frontmatter (date, type, tags, language, level)
 ├── Sección "Correcciones" con [[phrasal:lemma]] backlinks
 └── PUT a GitHub REST API → repo del usuario → Obsidian Git sincroniza
```

### 3.5 Construcción del System Prompt (antes de cada sesión)

```
buildSystemPrompt(user_id, session)
 │
 ├── 1. Embed del texto inicial del usuario (o scenario del roleplay)
 ├── 2. pgvector similarity search en user_facts → top-5 hechos relevantes
 ├── 3. Query tracked_items: ORDER BY weight × recencia LIMIT 8 WHERE NOT archived
 │
 └── Prompt resultante:
     ┌──────────────────────────────────────────────────────────┐
     │ You are an English conversation partner at B2 level.     │
     │                                                          │
     │ [MEMORY]                                                 │
     │ - The user went out with friends last Tuesday.           │
     │ - The user is learning English and German.               │
     │                                                          │
     │ [ROLEPLAY] (si aplica)                                   │
     │ Scenario: You're a store clerk. The customer (The user)  │
     │ is returning a defective laptop. Be mildly uncooperative.│
     │ Close the scene naturally around 5 minutes.              │
     │                                                          │
     │ [IMPLICIT NUDGE] (invisible al usuario)                  │
     │ When contextually natural, weave in: "speak up",         │
     │ "free up", "pay off". Do NOT mention you're doing this.  │
     └──────────────────────────────────────────────────────────┘

```

---

## 4. Edge Functions — responsabilidades

| Función | Trigger | Input | Output | Costo IA |
|---|---|---|---|---|
| `chat-turn` | Cada turno del usuario | `{session_id, user_text, lang, level}` | `{ai_text, audio_b64}` | 1 LLM call/turno |
| `generate-feedback` | Al cerrar sesión | `session_id` | annotations + tracked_items en DB | 1 LLM call/sesión |
| `generate-roleplay-topics` | Al abrir Roleplay | `{lang, level, user_interests[]}` | `topics[]` (batch 5) | 1 LLM call/batch |
| `analyze-youtube` | Al pegar URL | `{url, lang}` | `{summary, key_points, transcript}` | 1 Gemini call/video |
| `extract-facts` | Post-sesión (paralelo) | `session_id` | `user_facts[]` en DB | 1 LLM call + N embeddings |
| `generate-srs-drill` | Al iniciar drill SRS | `{item_ids[], lang}` | `exercises[]` | 1 LLM call/drill |
| `export-obsidian` | Post-sesión (si config) | `session_id` | Markdown en GitHub (PUT directo, PR como fallback) | 0 (sin LLM, solo formato) |
| `score-pronunciation` | Post-turno usuario | `{audio_b64, transcript, lang}` | `{score, breakdown}` | 0 (Azure Speech, no LLM) |
| `generate-shadow-exercise` | Al iniciar Shadow Reading | `{lang, level, tracked_items[]}` | `{phrase, audio_b64}` | 1 TTS call + 1 LLM call/batch |
| `weekly-report` | Cron dominical 23:00 UTC | `user_id` | Markdown en GitHub + datos en DB | 1 LLM call/semana/usuario |

---

## 5. Índice de latencias estimadas (referencia de diseño)

| Operación | Latencia estimada |
|---|---|
| Groq Whisper STT | ~300ms |
| LLM (GPT-4o, ~100 tokens resp.) | ~800-1200ms |
| OpenAI TTS (~80 chars) | ~350-500ms |
| ElevenLabs Turbo Streaming (primer chunk) | ~180-250ms |
| Supabase Edge Function overhead | ~40-80ms |
| generate-feedback (full) | ~3-8s (asíncrono, no bloquea) |
| pgvector similarity search (<50k filas) | <50ms |

---

## 6. Stack final

### Frontend (Mobile)
- React Native + Expo SDK 52+
- Zustand (estado global de sesión, deep-dive, configuración)
- NativeWind v4 (Tailwind en RN)
- react-native-pager-view (navegación por swipe)
- expo-av (grabación + reproducción de audio)
- expo-haptics (retroalimentación táctil)
- expo-blur (glassmorphism)
- react-native-reanimated v3 + react-native-gesture-handler (animaciones y drag)
- @supabase/supabase-js (cliente DB + Realtime + Auth)

### Backend (Supabase)
- PostgreSQL 15+ con pgvector + pgcrypto
- Supabase Auth (Magic Link)
- Supabase Realtime (Postgres Changes)
- Supabase Edge Functions (Deno 1.x)

### APIs externas
- Groq Audio API (Whisper STT)
- OpenCode proxy (GPT-4o / Claude Sonnet — LLM core)
- OpenAI TTS v1 (MVP) → ElevenLabs Turbo v2.5 (V2)
- OpenAI text-embedding-3-small (embeddings RAG)
- Google Gemini 1.5 Flash (análisis YouTube)
- GitHub REST API (export Obsidian)
- **Azure Speech Services** — Pronunciation Assessment API (breakdown fonético por turno)

---

## 7. Deuda Técnica — Extensibilidad Multi-idioma

Añadir un idioma nuevo al MVP (ej. Francés, Italiano) tiene el siguiente costo de ingeniería estimado:

| Componente | Trabajo |
|---|---|
| TTS voice model | Seleccionar voz OpenAI/ElevenLabs para el idioma. ~1h |
| STT | Groq Whisper soporta 100+ idiomas; solo pasar el código correcto. ~0.5h |
| SRS deck | Crear equivalente de "phrasal verbs" para el idioma (puede ser "false friends", conectores, etc.). ~1-2 días |
| Roleplay prompts | Adaptar prompts de escenarios al contexto cultural del idioma. ~4h |
| Feedback prompts | Ajustar el LLM para detectar errores típicos del idioma destino. ~4h |
| Niveles CEFR | Ya genérico (A1/A2/B1/B2/C1) — sin cambios. |
| **Total estimado** | **~3-5 días de engineering por idioma nuevo** |

El schema ya soporta múltiples idiomas (`sessions.language`, `user_settings.languages_config jsonb`). No hay deuda estructural, solo trabajo de contenido y prompts.
