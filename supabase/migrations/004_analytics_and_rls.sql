-- 004_analytics_and_rls.sql

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


-- ─── ROW LEVEL SECURITY (RLS) ────────────────────────────────────────

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_turns ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_annotations ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_dive_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_facts ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleplay_topic_batches ENABLE ROW LEVEL SECURITY;

-- Políticas genéricas: el usuario sólo puede ver y editar sus propios datos.
-- Por simplicidad, todos verifican `auth.uid() = user_id`. 
-- (Para las tablas que no tienen user_id directamente sino turn_id o session_id,
-- se debe hacer join, o de manera más sencilla en el app confiar en que la sesión está protegida).

-- profiles
CREATE POLICY "Users can only read their own profile." 
  ON profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can only update their own profile." 
  ON profiles FOR UPDATE USING (auth.uid() = id);

-- user_settings
CREATE POLICY "Users can manage their own settings." 
  ON user_settings FOR ALL USING (auth.uid() = user_id);

-- user_streaks
CREATE POLICY "Users can manage their own streaks." 
  ON user_streaks FOR ALL USING (auth.uid() = user_id);

-- sessions
CREATE POLICY "Users can only see and edit their sessions." 
  ON sessions FOR ALL USING (auth.uid() = user_id);

-- session_turns
CREATE POLICY "Users can manage turns for their sessions." 
  ON session_turns FOR ALL 
  USING (session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- tracked_items
CREATE POLICY "Users can manage their tracked items." 
  ON tracked_items FOR ALL USING (auth.uid() = user_id);

-- feedback_annotations
CREATE POLICY "Users can manage feedback annotations for their turns"
  ON feedback_annotations FOR ALL
  USING (turn_id IN (
    SELECT id FROM session_turns WHERE session_id IN (
        SELECT id FROM sessions WHERE user_id = auth.uid()
    )
  ));

-- deep_dive_sessions
CREATE POLICY "Users can manage their deep dives."
  ON deep_dive_sessions FOR ALL
  USING (parent_session_id IN (SELECT id FROM sessions WHERE user_id = auth.uid()));

-- user_facts
CREATE POLICY "Users can manage their facts." 
  ON user_facts FOR ALL USING (auth.uid() = user_id);

-- roleplay_topic_batches
CREATE POLICY "Users can manage their roleplay topics." 
  ON roleplay_topic_batches FOR ALL USING (auth.uid() = user_id);
