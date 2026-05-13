-- 002_feedback.sql

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