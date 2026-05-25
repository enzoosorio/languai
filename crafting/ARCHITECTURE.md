# Architecture & Tech Stack

## Decisiones de arquitectura clave

| Decisión | Elección | Motivo |
|---|---|---|
| Backend | Supabase | Auth + DB + Edge Functions + Realtime en uno, sin infra propia |
| LLM Conversación | DeepSeek V4 Flash (vía OpenCode proxy) | Mejor latencia del pool; calidad >90% de Pro. Ver [MODELS.md](MODELS.md) |
| LLM Feedback / Judge / Extract | DeepSeek V4 Pro (vía OpenCode proxy) | Mejor reasoning del pool, JSON structured output. Asíncrono, no bloquea voice loop |
| Grammar filter paralelo | LanguageTool (OSS) | Rule-based, segundo opinador no autoritativo en feedback pipeline |
| STT | Groq Whisper Large v3 Turbo | ~300ms, imbatible costo/latencia |
| TTS MVP | OpenAI TTS (`nova`/`onyx`) | Simple, ~400ms, barato |
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
│  │  └─────────────┘ ┌──────────────────┐                        │   │
│  │                  │ guided-chips     │  ← chips para modo     │   │
│  │                  └──────────────────┘    guided practice      │   │
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
    │                 │ N                   ┌── vocabulary_catalog (1:N) ◄────┐
    │                 │ ◄── feedback_annotations (N:1, optional)              │
    │                 │ ◄── deep_dive_sessions.tracked_item_id                │
    │                 │ ── (al graduarse) ──────────────────────────────────►─┘
    │
    ├──────────── user_corpus_exposure (1:N) ──► b2_expressions_corpus (global)
    │
    ├──────────── user_facts (1:N, embeddings pgvector)
    │
    ├──────────── roleplay_topic_batches (1:N)
    │
    └──────────── sessions (1:N)  [mode: free|roleplay|guided]
                      │ 1
                      ├──────── session_turns (1:N)
                      │              │                 [chips_offered, chips_used,
                      │              │                  constraint_status — solo en mode=guided]
                      │              └──── feedback_annotations (1:N)
                      │
                      └──────── deep_dive_sessions (1:N)
                                    │ parent_session_id
                                    │ dive_session_id ──► sessions
                                    └ tracked_item_id ──► tracked_items

-- Tablas globales (sin user_id, lectura authenticated):
b2_expressions_corpus  ──► user_corpus_exposure (N:M via user_id+corpus_id)
vocabulary_definitions_cache  (caché global de definiciones LLM)
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

-- ─── MIGRACIÓN 006: Guided Practice + Vocabulary Catalog ───────────────
-- Aplicar DESPUÉS de las migraciones 001-005.

-- ALTER sessions: añadir columna mode para distinguir free/roleplay/guided
-- (type se mantiene para free|roleplay|deep_dive — guided es un sub-modo de free)
ALTER TABLE sessions
  ADD COLUMN mode text NOT NULL DEFAULT 'free'
  CHECK (mode IN ('free', 'roleplay', 'guided'));

-- ALTER session_turns: metadata de chips para sesiones guiadas
ALTER TABLE session_turns
  ADD COLUMN chips_offered     jsonb,    -- array de los 4 chips ofrecidos en ese turno
  ADD COLUMN chips_used        text[],   -- lemmas que matchearon (fuzzy ≥ 0.8)
  ADD COLUMN constraint_status text      -- 'satisfied' | 'skipped' | 'no_chips' | null
    CHECK (constraint_status IN ('satisfied','skipped','no_chips'));

-- ─── B2 EXPRESSIONS CORPUS (tabla global, no por usuario) ────────────────
-- Semilla inicial ~150 expresiones. Fuente: Oxford Learner's + Cambridge English.
-- Crece vía migraciones SQL curadas; no hay ingesta automática.
CREATE TABLE b2_expressions_corpus (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  expression  text NOT NULL,          -- forma de superficie ("show up")
  lemma       text NOT NULL UNIQUE,   -- normalizado ("show_up")
  category    text NOT NULL           -- 'phrasal_verb'|'conjunction'|'collocation'|'adverb'|'idiom'
              CHECK (category IN ('phrasal_verb','conjunction','collocation','adverb','idiom')),
  tags        text[] NOT NULL DEFAULT '{}',  -- ['daily','work','formal','social']
  difficulty  text NOT NULL DEFAULT 'B2',    -- 'B1'|'B2'|'C1' — permite expansión futura
  example     text,                          -- ejemplo de uso curado
  language    text NOT NULL DEFAULT 'en',    -- 'en' únicamente en MVP; 'de' post-MVP
  created_at  timestamptz DEFAULT now()
);

CREATE INDEX idx_corpus_tags     ON b2_expressions_corpus USING GIN(tags);
CREATE INDEX idx_corpus_language ON b2_expressions_corpus(language, difficulty);

-- RLS: lectura pública para authenticated; escritura solo service_role (migraciones)
ALTER TABLE b2_expressions_corpus ENABLE ROW LEVEL SECURITY;
CREATE POLICY "corpus_select" ON b2_expressions_corpus
  FOR SELECT TO authenticated USING (true);

-- ─── USER CORPUS EXPOSURE ────────────────────────────────────────────────
-- Trackea cuántas veces se ofreció/usó cada chip del corpus por usuario.
-- Evita re-ofrecer expresiones ya dominadas y permite ordenar por relevancia.
CREATE TABLE user_corpus_exposure (
  user_id          uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  corpus_id        uuid NOT NULL REFERENCES b2_expressions_corpus(id) ON DELETE CASCADE,
  times_offered    int NOT NULL DEFAULT 0,
  times_used       int NOT NULL DEFAULT 0,   -- veces que matcheó en turno del usuario
  last_offered_at  timestamptz,
  PRIMARY KEY (user_id, corpus_id)
);

CREATE INDEX idx_exposure_user ON user_corpus_exposure(user_id, times_used DESC);

ALTER TABLE user_corpus_exposure ENABLE ROW LEVEL SECURITY;
CREATE POLICY "exposure_select" ON user_corpus_exposure
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "exposure_upsert" ON user_corpus_exposure
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "exposure_update" ON user_corpus_exposure
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ─── VOCABULARY CATALOG ──────────────────────────────────────────────────
-- Catálogo permanente de palabras/expresiones aprendidas o adoptadas.
-- Distinto de tracked_items (errores con weight mutable).
-- Una vez en catálogo, queda en catálogo; los errores futuros crean nuevos tracked_items.
CREATE TABLE vocabulary_catalog (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                 uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  expression              text NOT NULL,
  lemma                   text NOT NULL,
  language                text NOT NULL DEFAULT 'en',
  cefr_level              text,           -- 'A2'|'B1'|'B2'|'C1' — estimado por LLM o del corpus
  category                text,           -- 'phrasal_verb'|'word'|'collocation'|'idiom'
  source                  text NOT NULL   -- cómo entró al catálogo
    CHECK (source IN (
      'promoted_from_tracked',    -- graduación desde tracked_items
      'post_session_suggestion',  -- sugerencia post-sesión aceptada
      'manual_tap',               -- long-press en feedback/transcripción
      'guided_mastered'           -- usado correctamente 3+ veces en guided mode
    )),
  source_session_id       uuid REFERENCES sessions(id),       -- sesión donde se aprendió
  source_tracked_item_id  uuid REFERENCES tracked_items(id),  -- si vino por promoción
  definition              text,           -- generada por LLM al ingresar; no editable
  example                 text,           -- generado por LLM; no editable
  user_note               text,           -- nota libre del usuario (única parte editable)
  tags                    text[] NOT NULL DEFAULT '{}',
  added_at                timestamptz NOT NULL DEFAULT now(),
  last_seen_at            timestamptz,    -- última sesión donde apareció
  times_used_after_catalog int NOT NULL DEFAULT 0,
  hidden                  bool NOT NULL DEFAULT false,  -- ocultar sin borrar
  UNIQUE (user_id, lemma, language)        -- una entrada por lemma+idioma por usuario
);

CREATE INDEX idx_catalog_user     ON vocabulary_catalog(user_id, language, added_at DESC);
CREATE INDEX idx_catalog_lemma    ON vocabulary_catalog(user_id, lemma, language);
CREATE INDEX idx_catalog_tags     ON vocabulary_catalog USING GIN(tags);
CREATE INDEX idx_catalog_active   ON vocabulary_catalog(user_id, language)
  WHERE hidden = false;

ALTER TABLE vocabulary_catalog ENABLE ROW LEVEL SECURITY;
CREATE POLICY "catalog_select" ON vocabulary_catalog
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
CREATE POLICY "catalog_insert" ON vocabulary_catalog
  FOR INSERT TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);
CREATE POLICY "catalog_update" ON vocabulary_catalog
  FOR UPDATE TO authenticated USING ((SELECT auth.uid()) = user_id);

-- ─── VOCABULARY DEFINITIONS CACHE (global) ───────────────────────────────
-- Caché de definiciones generadas por LLM para evitar regenerar por idioma+lemma.
-- Compartido entre usuarios — la definición de "show up" es la misma para todos.
CREATE TABLE vocabulary_definitions_cache (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lemma       text NOT NULL,
  language    text NOT NULL DEFAULT 'en',
  definition  text NOT NULL,
  example     text NOT NULL,
  generated_at timestamptz DEFAULT now(),
  UNIQUE (lemma, language)
);

ALTER TABLE vocabulary_definitions_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "def_cache_select" ON vocabulary_definitions_cache
  FOR SELECT TO authenticated USING (true);
-- INSERT solo desde service_role (Edge Functions); usuarios solo leen.

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

**Optimización clave:** análisis per-turn corre asíncrono **durante** la sesión. El job final solo agrega resultados pre-computados. Esto baja el loader post-sesión de 15-20s a 2-3s.

```
DURANTE LA SESIÓN (background, paralelo al voice loop):
─────────────────────────────────────────────────────
Cada turno del usuario   ─►  Edge: analyze-turn (DeepSeek V4 Flash)
                              │
                              └── INSERT feedback_annotations parciales
                              
Cada turno del usuario   ─►  Edge: score-pronunciation (Azure Speech)
                              │
                              └── UPDATE session_turns.pronunciation_score

Cada 3 turnos del user   ─►  Edge: extract-facts (DeepSeek V4 Flash)
                              │
                              └── pipeline §1.3 de MEMORY_SYSTEM.md

USUARIO CIERRA SESIÓN:
─────────────────────────────────────────────────────
         │
         ▼
Edge: generate-feedback (asíncrona) — DeepSeek V4 Pro
 ├── PARALELO ─┬─ Lee annotations parciales pre-computadas
 │             │
 │             └─ LanguageTool API → annotations sintácticas (source='languagetool')
 │
 ├── Llama LLM con transcripción completa para análisis cross-turn / patrones
 ├── Valida JSON (2 retries si parsing falla)
 ├── MERGE annotations LLM + LanguageTool (dedupe por span; LLM gana en colisiones)
 ├── UPSERT tracked_items (acumula weight, actualiza srs_state)
 ├── Genera summary + tags
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

| Función | Trigger | Input | Output | Modelo |
|---|---|---|---|---|
| `chat-turn` | Cada turno del usuario | `{session_id, user_text, lang, level}` | `{ai_text, tool_calls?}` | DeepSeek V4 Flash + tool `end_conversation` |
| `analyze-turn` | Async post-turno | `{turn_id, prev_turns[]}` | annotations parciales en DB | DeepSeek V4 Flash |
| `score-pronunciation` | Async post-turno usuario | `{audio_b64, transcript, lang}` | `pronunciation_score` en `session_turns` | Azure Speech (no LLM) |
| `extract-facts` | Cada 3 turnos + cierre | `{session_id, turn_ids[]}` | `user_facts[]` con validación contra existentes | DeepSeek V4 Flash + embeddings + Judge call para conflicts |
| `judge-fact` | Sub-call de extract-facts | `{old_fact, new_fact}` | `{verdict: IDEMPOTENT\|REFINES\|CONTRADICTS\|CONTEXT_DEPENDENT\|UNRELATED}` | DeepSeek V4 Pro |
| `generate-feedback` | Al cerrar sesión | `session_id` | annotations agregadas + tracked_items en DB | DeepSeek V4 Pro + LanguageTool (paralelo) |
| `generate-roleplay-topics` | Al abrir Roleplay | `{lang, level, user_interests[]}` | `topics[]` (batch 5) | DeepSeek V4 Flash |
| `analyze-youtube` | Al pegar URL | `{url, lang}` | `{summary, key_points, transcript}` | Gemini 1.5 Flash |
| `guided-chips` | App solicita chips para turno guiado | `{session_id, turn_id, focus: 'srs'\|'b2'\|'mixed'}` | `{should_emit_chips, chips[{expression,source,hint_short,hint_example}]}` | DeepSeek V4 Flash |
| `generate-srs-drill` | Al iniciar drill SRS | `{item_ids[], lang}` | `exercises[]` | DeepSeek V4 Pro |
| `generate-shadow-exercise` | Al iniciar Shadow Reading | `{lang, level, tracked_items[]}` | `{phrase, audio_b64}` | DeepSeek V4 Flash + OpenAI TTS |
| `export-obsidian` | Post-sesión (si config) | `session_id` | Markdown en GitHub | sin LLM, solo formato |
| `weekly-report` | Cron dominical 23:00 UTC | `user_id` | Markdown en GitHub + datos en DB | DeepSeek V4 Pro |

Ver [MODELS.md](MODELS.md) para el detalle de por qué cada modelo y cómo hacer swap.

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
