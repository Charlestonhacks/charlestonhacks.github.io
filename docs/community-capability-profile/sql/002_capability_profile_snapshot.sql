-- Community Capability Profile — 002: privacy-preserving profile snapshots
-- STATUS: PROPOSED. Not applied to any database. Requires 001.
-- Target: Innovation Engine Supabase project. Belongs in deckerd451/innovation-engine.
--
-- Design:
--   * capability_profile.build() reads member data with an explicit field
--     allowlist and returns ONLY banded, k-suppressed aggregates plus items
--     whose owners chose discovery_visibility = 'public'.
--   * capability_profile.refresh() stores a snapshot (service role only).
--   * public.get_community_capability_snapshot() is the ONLY object visitors
--     can use. It returns the latest stored snapshot and takes no arguments,
--     so repeated or narrowed queries cannot be used to single anyone out.
--   * The privacy boundary is in the database. The Cloudflare Worker that
--     serves the file adds identity/events but never sees member rows.

BEGIN;

CREATE SCHEMA IF NOT EXISTS capability_profile;
REVOKE ALL ON SCHEMA capability_profile FROM PUBLIC, anon, authenticated;

CREATE TABLE IF NOT EXISTS capability_profile.snapshots (
  id bigserial PRIMARY KEY,
  generated_at timestamptz NOT NULL DEFAULT now(),
  spec_version text NOT NULL,
  min_group_size integer NOT NULL,
  profile jsonb NOT NULL
);
REVOKE ALL ON capability_profile.snapshots FROM PUBLIC, anon, authenticated;

-- Count -> band. Below k returns NULL (suppressed). No band starts below k.
CREATE OR REPLACE FUNCTION capability_profile.band(n bigint, k integer)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT CASE
    WHEN n IS NULL OR n < GREATEST(k, 3) THEN NULL
    WHEN n <= 4 THEN '3-4'
    WHEN n <= 10 THEN '5-10'
    WHEN n <= 25 THEN '11-25'
    WHEN n <= 50 THEN '26-50'
    ELSE '51+'
  END
$$;

-- Normalised skill key: lower case, trimmed, "(level)" suffix removed.
CREATE OR REPLACE FUNCTION capability_profile.skill_key(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT NULLIF(left(regexp_replace(lower(btrim(regexp_replace(coalesce(raw, ''), '\(.*\)\s*$', ''))), '\s+', ' ', 'g'), 60), '')
$$;

-- Stable, non-reversible public id for a skill (cap:<slug>).
CREATE OR REPLACE FUNCTION capability_profile.slug(raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
  SELECT left(btrim(regexp_replace(lower(coalesce(raw, '')), '[^a-z0-9]+', '-', 'g'), '-'), 60)
$$;

CREATE OR REPLACE FUNCTION capability_profile.build(k integer DEFAULT 5)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  -- DECISION POINT: members with no consent row are counted in banded
  -- aggregates (true) or excluded until they opt in (false).
  DEFAULT_INCLUDE_IN_AGGREGATES constant boolean := true;
  AVAILABLE_VALUES constant text[] := ARRAY[
    'available now', 'available for mentoring', 'looking for opportunities',
    'available', 'open to opportunities', 'limited availability'
  ];
  result jsonb;
BEGIN
  IF k < 3 THEN
    RAISE EXCEPTION 'minimum group size must be at least 3';
  END IF;

  WITH eligible AS (
    -- Field allowlist: id (join key only, never output), skills, availability.
    SELECT c.id, c.skills, c.availability
    FROM public.community c
    LEFT JOIN public.member_discovery_consent mc ON mc.community_id = c.id
    WHERE COALESCE(c.is_hidden, false) = false
      AND COALESCE(c.is_disabled, false) = false
      AND COALESCE(mc.include_in_aggregates, DEFAULT_INCLUDE_IN_AGGREGATES)
  ),
  declared AS (
    SELECT DISTINCT e.id AS member_id, capability_profile.skill_key(s) AS skill
    FROM eligible e
    CROSS JOIN LATERAL regexp_split_to_table(coalesce(e.skills, ''), '\s*[,;]\s*') AS s
    WHERE capability_profile.skill_key(s) IS NOT NULL
  ),
  endorsed AS (
    SELECT DISTINCT en.endorsed_community_id AS member_id, capability_profile.skill_key(en.skill) AS skill
    FROM public.endorsements en
    JOIN eligible e ON e.id = en.endorsed_community_id
    WHERE en.endorser_community_id IS DISTINCT FROM en.endorsed_community_id
      AND capability_profile.skill_key(en.skill) IS NOT NULL
  ),
  completed_work AS (
    -- Members (creator or member) of completed projects, with the skills those projects required.
    SELECT p.creator_id AS member_id, capability_profile.skill_key(rs) AS skill
    FROM public.projects p CROSS JOIN LATERAL unnest(p.required_skills) rs
    WHERE p.status = 'completed'
    UNION
    SELECT pm.user_id, capability_profile.skill_key(rs)
    FROM public.project_members pm
    JOIN public.projects p ON p.id = pm.project_id
    CROSS JOIN LATERAL unnest(p.required_skills) rs
    WHERE p.status = 'completed'
  ),
  demonstrated AS (
    -- Declared AND used on completed project work. XP/streaks/attendance are never evidence.
    SELECT DISTINCT d.member_id, d.skill
    FROM declared d
    JOIN completed_work w ON w.member_id = d.member_id AND w.skill = d.skill
  ),
  available AS (
    SELECT DISTINCT d.member_id, d.skill
    FROM declared d
    JOIN eligible e ON e.id = d.member_id
    WHERE lower(btrim(coalesce(e.availability, ''))) = ANY (AVAILABLE_VALUES)
  ),
  counts AS (
    SELECT d.skill,
      (SELECT count(*) FROM declared x WHERE x.skill = d.skill) AS n_declared,
      (SELECT count(*) FROM endorsed x WHERE x.skill = d.skill) AS n_endorsed,
      (SELECT count(*) FROM demonstrated x WHERE x.skill = d.skill) AS n_demonstrated,
      (SELECT count(*) FROM available x WHERE x.skill = d.skill) AS n_available
    FROM (SELECT DISTINCT skill FROM declared) d
  ),
  capabilities AS (
    SELECT jsonb_agg(
      jsonb_build_object(
        'id', 'cap:' || capability_profile.slug(skill),
        'label', initcap(skill),
        'evidence', jsonb_strip_nulls(jsonb_build_object(
          'declared', CASE WHEN capability_profile.band(n_declared, k) IS NOT NULL
                           THEN jsonb_build_object('band', capability_profile.band(n_declared, k)) END,
          'endorsed', CASE WHEN capability_profile.band(n_endorsed, k) IS NOT NULL
                           THEN jsonb_build_object('band', capability_profile.band(n_endorsed, k)) END,
          'demonstrated', CASE WHEN capability_profile.band(n_demonstrated, k) IS NOT NULL
                           THEN jsonb_build_object('band', capability_profile.band(n_demonstrated, k)) END,
          'available', CASE WHEN capability_profile.band(n_available, k) IS NOT NULL
                           THEN jsonb_build_object('band', capability_profile.band(n_available, k)) END
        )),
        'observedAt', to_jsonb(now())
      ) ORDER BY n_declared DESC, skill
    ) AS j
    FROM counts
    WHERE capability_profile.band(n_declared, k) IS NOT NULL
      AND capability_profile.slug(skill) <> ''
  ),
  public_projects AS (
    -- Allowlist: no creator, no members, no budget/timeline.
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', 'project:' || p.id::text,
      'title', left(p.title, 200),
      'summary', left(p.description, 1000),
      'status', p.status,
      'skillsNeeded', to_jsonb(p.required_skills),
      'themes', CASE WHEN t.id IS NOT NULL THEN jsonb_build_array('theme:' || t.id::text) END,
      'evidence', (
        SELECT CASE max(CASE cp.evidence_status WHEN 'proven' THEN 3 WHEN 'tested' THEN 2 ELSE 1 END)
                 WHEN 3 THEN 'proven' WHEN 2 THEN 'tested' WHEN 1 THEN 'untested' END
        FROM public.capability_packages cp
        WHERE cp.project_id = p.id AND cp.permission_mode = 'community'
      ),
      'updatedAt', to_jsonb(p.updated_at)
    )) ORDER BY p.updated_at DESC NULLS LAST) AS j
    FROM public.projects p
    LEFT JOIN public.theme_circles t
      ON t.id = p.theme_id AND t.status = 'active' AND t.expires_at > now()
    WHERE p.discovery_visibility = 'public'
      AND p.status IN ('open', 'active', 'completed')
      AND p.title IS NOT NULL
  ),
  public_opportunities AS (
    -- Allowlist: never contact_email, posted_by, compensation details or counters.
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', 'opp:' || o.id::text,
      'title', left(o.title, 200),
      'type', o.opportunity_type,
      'summary', left(coalesce(o.summary, o.description), 1000),
      'skills', CASE WHEN jsonb_typeof(o.skills) = 'array' THEN o.skills END,
      'locationType', o.location_type,
      'commitment', o.commitment,
      'deadline', to_jsonb(o.application_deadline),
      'organization', CASE WHEN org.id IS NOT NULL THEN 'partner:' || org.slug END,
      'applyUrl', CASE WHEN o.url ~* '^https://' THEN o.url END
    )) ORDER BY o.created_at DESC) AS j
    FROM public.opportunities o
    LEFT JOIN public.organizations org
      ON org.id = o.organization_id AND org.status = 'active' AND org.verified = true
    WHERE o.discovery_visibility = 'public'
      AND o.status = 'open'
      AND (o.application_deadline IS NULL OR o.application_deadline > now())
  ),
  themes AS (
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', 'theme:' || t.id::text,
      'title', left(t.title, 200),
      'description', left(t.description, 1000),
      'tags', to_jsonb(t.tags),
      'participants', capability_profile.band((
        SELECT count(DISTINCT tp.community_id)
        FROM public.theme_participants tp
        JOIN eligible e ON e.id = tp.community_id
        WHERE tp.theme_id = t.id
      ), k)
    )) ORDER BY t.last_activity_at DESC NULLS LAST) AS j
    FROM public.theme_circles t
    WHERE t.status = 'active' AND t.expires_at > now()
  ),
  partners AS (
    SELECT jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
      'id', 'partner:' || org.slug,
      'name', org.name,
      'url', CASE WHEN org.website ~* '^https://' THEN org.website END,
      'description', left(org.description, 1000),
      'relationship', 'Organization in the CharlestonHacks Innovation Engine network',
      'verified', true
    )) ORDER BY org.name) AS j
    FROM public.organizations org
    WHERE org.status = 'active' AND org.verified = true
  )
  SELECT jsonb_build_object(
    'capabilities', COALESCE((SELECT j FROM capabilities), '[]'::jsonb),
    'projects', COALESCE((SELECT j FROM public_projects), '[]'::jsonb),
    'opportunities', COALESCE((SELECT j FROM public_opportunities), '[]'::jsonb),
    'themes', COALESCE((SELECT j FROM themes), '[]'::jsonb),
    'partners', COALESCE((SELECT j FROM partners), '[]'::jsonb),
    'privacy', jsonb_build_object(
      'minimumGroupSize', k,
      'countsAreBanded', true,
      'individualDisclosure', 'none'
    )
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION capability_profile.refresh(k integer DEFAULT 5)
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  new_id bigint;
BEGIN
  INSERT INTO capability_profile.snapshots (spec_version, min_group_size, profile)
  VALUES ('0.1.0', k, capability_profile.build(k))
  RETURNING id INTO new_id;
  -- Keep a short history for auditing; older snapshots are deleted.
  DELETE FROM capability_profile.snapshots
  WHERE id NOT IN (SELECT id FROM capability_profile.snapshots ORDER BY generated_at DESC, id DESC LIMIT 30);
  RETURN new_id;
END;
$$;

-- The only visitor-facing entry point. No arguments, latest snapshot only.
CREATE OR REPLACE FUNCTION public.get_community_capability_snapshot()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT jsonb_build_object('generatedAt', s.generated_at, 'specVersion', s.spec_version) || s.profile
  FROM capability_profile.snapshots s
  ORDER BY s.generated_at DESC, s.id DESC
  LIMIT 1
$$;

-- PostgREST only exposes the public schema, so the scheduled refresh calls
-- this wrapper. Service role only.
CREATE OR REPLACE FUNCTION public.refresh_community_capability_snapshot()
RETURNS bigint
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$ SELECT capability_profile.refresh(5) $$;
REVOKE ALL ON FUNCTION public.refresh_community_capability_snapshot() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_community_capability_snapshot() TO service_role;

REVOKE ALL ON FUNCTION capability_profile.band(bigint, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capability_profile.skill_key(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capability_profile.slug(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capability_profile.build(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION capability_profile.refresh(integer) FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA capability_profile TO service_role;
GRANT EXECUTE ON FUNCTION capability_profile.refresh(integer) TO service_role;

REVOKE ALL ON FUNCTION public.get_community_capability_snapshot() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_community_capability_snapshot() TO anon, authenticated, service_role;

COMMIT;

-- Scheduling (choose one, after review):
--   * pg_cron, if enabled:  SELECT cron.schedule('ccp-refresh', '17 6 * * *', 'SELECT capability_profile.refresh(5)');
--   * or the Cloudflare Worker's scheduled trigger calling refresh with the service role key.
