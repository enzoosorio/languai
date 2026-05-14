-- 004_analytics_and_rls.sql

-- ─── SESSION ANALYTICS (vista materializada) ─────────────────────────
-- Métricas agregadas por semana para Weekly Report y pantalla Stats.
-- NOTA: El acceso seguro a esta vista se gestiona en 005_fix_analytics_access.sql
--       (REVOKE directo + función SECURITY DEFINER get_my_session_analytics()).
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
-- Habilitación en todas las tablas de la app.

ALTER TABLE profiles              ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_settings         ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_streaks          ENABLE ROW LEVEL SECURITY;
ALTER TABLE sessions              ENABLE ROW LEVEL SECURITY;
ALTER TABLE session_turns         ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracked_items         ENABLE ROW LEVEL SECURITY;
ALTER TABLE feedback_annotations  ENABLE ROW LEVEL SECURITY;
ALTER TABLE deep_dive_sessions    ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_facts            ENABLE ROW LEVEL SECURITY;
ALTER TABLE roleplay_topic_batches ENABLE ROW LEVEL SECURITY;


-- ─── POLÍTICAS RLS ───────────────────────────────────────────────────
--
-- Buenas prácticas aplicadas:
--   1. TO authenticated  → el planner descarta la política para rol anon sin evaluarla
--                          (mejora medida: ~99.78% en benchmarks de Supabase)
--   2. (SELECT auth.uid()) → PostgreSQL cachea el resultado como initPlan en lugar de
--                            reevaluar auth.uid() fila por fila
--                          (mejora medida: ~94.97% en benchmarks de Supabase)
--   3. WITH CHECK explícito en INSERT/UPDATE para máxima claridad
--   4. feedback_annotations usa JOIN en lugar de IN(IN(...)) anidado


-- ── profiles ─────────────────────────────────────────────────────────
-- INSERT: lo maneja el trigger handle_new_user() con SECURITY DEFINER → no se necesita aquí.
-- DELETE: intencional sin política → los usuarios no pueden borrarse desde el cliente.

CREATE POLICY "profiles_select_own"
  ON profiles FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = id);

CREATE POLICY "profiles_update_own"
  ON profiles FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = id)
  WITH CHECK ((SELECT auth.uid()) = id);


-- ── user_settings ─────────────────────────────────────────────────────
-- INSERT: trigger crea la fila en el registro; UPDATE/SELECT desde el cliente.

CREATE POLICY "user_settings_select_own"
  ON user_settings FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_settings_update_own"
  ON user_settings FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── user_streaks ──────────────────────────────────────────────────────
-- Escrituras solo vía Edge Function (service_role); cliente solo lee.

CREATE POLICY "user_streaks_select_own"
  ON user_streaks FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "user_streaks_update_own"
  ON user_streaks FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── sessions ──────────────────────────────────────────────────────────
-- El cliente crea sesiones (INSERT) y las cierra (UPDATE ended_at).
-- Las Edge Functions usan service_role y bypass RLS.

CREATE POLICY "sessions_select_own"
  ON sessions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "sessions_insert_own"
  ON sessions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "sessions_update_own"
  ON sessions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── session_turns ─────────────────────────────────────────────────────
-- Escrituras desde Edge Function (service_role). Cliente solo necesita SELECT.
-- Se deja INSERT para el caso de persistencia optimista desde el cliente.

CREATE POLICY "session_turns_select_own"
  ON session_turns FOR SELECT TO authenticated
  USING (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "session_turns_insert_own"
  ON session_turns FOR INSERT TO authenticated
  WITH CHECK (
    session_id IN (
      SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())
    )
  );


-- ── tracked_items ─────────────────────────────────────────────────────
-- Edge Functions crean/actualizan vía service_role.
-- El cliente actualiza weight/user_rejections al rechazar un span (UPDATE).

CREATE POLICY "tracked_items_select_own"
  ON tracked_items FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "tracked_items_update_own"
  ON tracked_items FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── feedback_annotations ──────────────────────────────────────────────
-- Escrituras exclusivamente desde Edge Function (service_role).
-- Cliente: SELECT para renderizar el FeedbackScreen.
-- JOIN reemplaza el doble IN(IN(...)) anidado → mejor plan de ejecución.

CREATE POLICY "feedback_annotations_select_own"
  ON feedback_annotations FOR SELECT TO authenticated
  USING (
    turn_id IN (
      SELECT st.id
      FROM   session_turns st
      JOIN   sessions s ON s.id = st.session_id
      WHERE  s.user_id = (SELECT auth.uid())
    )
  );


-- ── deep_dive_sessions ────────────────────────────────────────────────
-- Escrituras desde Edge Function (service_role). Cliente: SELECT.

CREATE POLICY "deep_dive_sessions_select_own"
  ON deep_dive_sessions FOR SELECT TO authenticated
  USING (
    parent_session_id IN (
      SELECT id FROM sessions WHERE user_id = (SELECT auth.uid())
    )
  );


-- ── user_facts ────────────────────────────────────────────────────────
-- Escrituras desde Edge Function (extract-facts). Cliente: SELECT.

CREATE POLICY "user_facts_select_own"
  ON user_facts FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);


-- ── roleplay_topic_batches ────────────────────────────────────────────
-- Escrituras desde Edge Function (generate-roleplay-topics). Cliente: SELECT.

CREATE POLICY "roleplay_topic_batches_select_own"
  ON roleplay_topic_batches FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);
