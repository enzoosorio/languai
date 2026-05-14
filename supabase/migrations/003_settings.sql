-- 003_settings.sql

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

-- ─── TRIGGER: auto-crear profile al registrarse ──────────────────────
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public          -- previene search_path hijacking (Supabase Advisor: high severity)
AS $$
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
