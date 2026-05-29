-- =============================================================
-- get_pulse_metrics()
-- Public aggregate counts for the homepage "Network at a Glance"
-- pulse section.
--
-- Runs as SECURITY DEFINER so it bypasses RLS and can count rows
-- that the anon role cannot SELECT directly.  Only aggregate
-- numbers are returned — no individual row data is exposed.
--
-- Usage (JavaScript):
--   const { data } = await supabase.rpc('get_pulse_metrics');
--   // data → { members: 42, connections: 380, active_projects: 7 }
-- =============================================================

CREATE OR REPLACE FUNCTION get_pulse_metrics()
RETURNS json
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT json_build_object(
    'members',         (SELECT count(*)::int FROM community
                        WHERE is_hidden IS NULL OR is_hidden = false),
    'connections',     (SELECT count(*)::int FROM connections),
    'active_projects', (SELECT count(*)::int FROM projects
                        WHERE status = 'active')
  );
$$;

-- Allow the anonymous (public) role to call this function
GRANT EXECUTE ON FUNCTION get_pulse_metrics() TO anon;
GRANT EXECUTE ON FUNCTION get_pulse_metrics() TO authenticated;
