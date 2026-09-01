-- 006_srs_tracking.sql
--
-- Trazabilidad de las mini-sesiones de repaso (SRS / Anki).
-- El botón "Start" delimita una sentada de repaso → la modelamos como una sesión
-- de repaso con su log de eventos por card.
--
-- Diseño (post-análisis): NO duplicar estado.
--   · srs_sessions  = agrupador liviano (timing). Sin contadores: se DERIVAN.
--   · srs_reviews   = log de eventos append-only por card (la historia que NO se
--                     puede reconstruir después → hay que loguearla desde hoy).
--
-- Agregados (cards_answered, used_tts/used_history a nivel sesión) se obtienen con
-- COUNT(*) / bool_or(...) sobre srs_reviews. Ver vista srs_session_stats al final.


-- ─── SRS SESSIONS (agrupador liviano) ────────────────────────────────────────
CREATE TABLE srs_sessions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  started_at  timestamptz NOT NULL DEFAULT now(),
  ended_at    timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_srs_sessions_user ON srs_sessions(user_id, started_at DESC);


-- ─── SRS REVIEWS (log de eventos por card) ───────────────────────────────────
-- Una card genera N filas a lo largo del tiempo (reciclable). Guarda el grade,
-- las señales de comportamiento (TTS / flashback) y el srs_state antes/después
-- para reconstruir curvas de retención y detectar leeches a futuro.
CREATE TABLE srs_reviews (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  srs_session_id    uuid NOT NULL REFERENCES srs_sessions(id) ON DELETE CASCADE,
  tracked_item_id   uuid NOT NULL REFERENCES tracked_items(id) ON DELETE CASCADE,
  grade             text NOT NULL CHECK (grade IN ('again','hard','good','easy')),
  used_tts          bool NOT NULL DEFAULT false,   -- ¿reprodujo el audio en esta card?
  used_history      bool NOT NULL DEFAULT false,   -- ¿abrió el flashback de contexto?
  srs_state_before  jsonb,
  srs_state_after   jsonb,
  reviewed_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_srs_reviews_session ON srs_reviews(srs_session_id);
CREATE INDEX idx_srs_reviews_item    ON srs_reviews(tracked_item_id, reviewed_at DESC);


-- ─── ROW LEVEL SECURITY ──────────────────────────────────────────────────────
-- Mismo patrón que 004_analytics_and_rls.sql:
--   (SELECT auth.uid()) cacheado como initPlan + TO authenticated + WITH CHECK.
-- El cliente escribe directo (no hay Edge Function de por medio).

ALTER TABLE srs_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE srs_reviews  ENABLE ROW LEVEL SECURITY;


-- ── srs_sessions ──────────────────────────────────────────────────────────────
CREATE POLICY "srs_sessions_select_own"
  ON srs_sessions FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "srs_sessions_insert_own"
  ON srs_sessions FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "srs_sessions_update_own"
  ON srs_sessions FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);


-- ── srs_reviews ───────────────────────────────────────────────────────────────
-- Ownership vía el parent srs_session (subquery cacheada).
CREATE POLICY "srs_reviews_select_own"
  ON srs_reviews FOR SELECT TO authenticated
  USING (
    srs_session_id IN (
      SELECT id FROM srs_sessions WHERE user_id = (SELECT auth.uid())
    )
  );

CREATE POLICY "srs_reviews_insert_own"
  ON srs_reviews FOR INSERT TO authenticated
  WITH CHECK (
    srs_session_id IN (
      SELECT id FROM srs_sessions WHERE user_id = (SELECT auth.uid())
    )
  );


-- ─── VISTA DE AGREGADOS (derivados, no duplicados) ───────────────────────────
-- Métricas por sentada de repaso sin almacenar contadores redundantes.
-- security_invoker = true → la vista respeta el RLS de las tablas base según el
-- usuario que consulta (NO el owner). Imprescindible: sin esto la vista bypasea RLS.
CREATE VIEW srs_session_stats
  WITH (security_invoker = true) AS
SELECT
  s.id                                   AS srs_session_id,
  s.user_id,
  s.started_at,
  s.ended_at,
  COUNT(r.id)                            AS cards_answered,
  COUNT(DISTINCT r.tracked_item_id)      AS cards_distinct,
  COALESCE(bool_or(r.used_tts), false)     AS used_tts,
  COALESCE(bool_or(r.used_history), false) AS used_history
FROM srs_sessions s
LEFT JOIN srs_reviews r ON r.srs_session_id = s.id
GROUP BY s.id, s.user_id, s.started_at, s.ended_at;
