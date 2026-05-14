-- 005_fix_analytics_access.sql
--
-- Las vistas materializadas en PostgreSQL NO soportan RLS nativo.
-- session_analytics es accesible directamente por cualquier usuario autenticado
-- (verían filas de otros users si supieran el nombre de la vista).
--
-- Solución: revocar acceso directo + exponer vía función SECURITY DEFINER
-- que filtra automáticamente por (SELECT auth.uid()).

-- ─── 1. REVOCAR acceso directo a la vista ────────────────────────────
REVOKE SELECT ON session_analytics FROM anon;
REVOKE SELECT ON session_analytics FROM authenticated;

-- ─── 2. FUNCIÓN SEGURA ───────────────────────────────────────────────
-- SET search_path = public → previene search_path hijacking (Supabase Advisor: high severity)
-- SECURITY DEFINER         → corre con privilegios del owner para leer la mat. view
-- (SELECT auth.uid())      → patrón cacheado, consistente con políticas RLS
CREATE OR REPLACE FUNCTION get_my_session_analytics()
RETURNS TABLE (
  week_start    timestamptz,
  session_count bigint,
  total_minutes int,
  avg_minutes   int
)
SECURITY DEFINER
SET search_path = public
LANGUAGE sql
AS $$
  SELECT week_start, session_count, total_minutes, avg_minutes
  FROM   session_analytics
  WHERE  user_id = (SELECT auth.uid());
$$;

-- ─── 3. PERMISOS DE EJECUCIÓN ────────────────────────────────────────
GRANT  EXECUTE ON FUNCTION get_my_session_analytics() TO authenticated;
REVOKE EXECUTE ON FUNCTION get_my_session_analytics() FROM anon;
