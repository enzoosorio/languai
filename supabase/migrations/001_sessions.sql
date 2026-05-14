    -- 001_sessions.sql

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
