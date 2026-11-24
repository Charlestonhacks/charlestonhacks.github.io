-- Community Capability Profile — 001: member consent and item visibility
-- STATUS: PROPOSED. Not applied to any database. Review before running.
-- Target: Innovation Engine Supabase project (mqbsjlgnsirqsmfnreqd).
-- Belongs in deckerd451/innovation-engine once approved.
--
-- Additive only: creates one table and one history table, adds two columns
-- with private defaults. Nothing becomes more visible by running this.

BEGIN;

-- 1. Per-member discovery consent -------------------------------------------
-- A missing row means "defaults": counted in banded aggregates only
-- (see DEFAULT_INCLUDE_IN_AGGREGATES in 002), nothing individual published.
CREATE TABLE IF NOT EXISTS public.member_discovery_consent (
  community_id uuid PRIMARY KEY REFERENCES public.community(id) ON DELETE CASCADE,
  -- Counted (anonymously, banded, k-suppressed) in community capability totals.
  include_in_aggregates boolean NOT NULL DEFAULT true,
  -- Individual disclosure: every flag is off until the member turns it on.
  named_profile boolean NOT NULL DEFAULT false,
  share_skills boolean NOT NULL DEFAULT false,
  share_bio boolean NOT NULL DEFAULT false,
  share_availability boolean NOT NULL DEFAULT false,
  share_endorsements boolean NOT NULL DEFAULT false,
  accept_introductions boolean NOT NULL DEFAULT false,
  consent_version text NOT NULL DEFAULT 'ccp-0.1',
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- Sharing details implies a named profile.
  CONSTRAINT member_discovery_consent_named_required CHECK (
    named_profile OR NOT (share_skills OR share_bio OR share_availability OR share_endorsements)
  )
);

COMMENT ON TABLE public.member_discovery_consent IS
  'Community Capability Profile consent. Private by default; members review, change and revoke their own row.';

-- 2. History, so members (and admins) can review what was consented and when.
CREATE TABLE IF NOT EXISTS public.member_discovery_consent_events (
  id bigserial PRIMARY KEY,
  community_id uuid NOT NULL REFERENCES public.community(id) ON DELETE CASCADE,
  changed_at timestamptz NOT NULL DEFAULT now(),
  changed_by uuid,               -- auth.users.id of the actor
  previous jsonb,
  current jsonb
);
CREATE INDEX IF NOT EXISTS member_discovery_consent_events_member_idx
  ON public.member_discovery_consent_events (community_id, changed_at DESC);

CREATE OR REPLACE FUNCTION private.record_discovery_consent_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    NEW.updated_at := now();
  END IF;
  INSERT INTO public.member_discovery_consent_events (community_id, changed_by, previous, current)
  VALUES (
    COALESCE(NEW.community_id, OLD.community_id),
    auth.uid(),
    CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END,
    CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END
  );
  RETURN COALESCE(NEW, OLD);
END;
$$;
REVOKE ALL ON FUNCTION private.record_discovery_consent_change() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS member_discovery_consent_history ON public.member_discovery_consent;
CREATE TRIGGER member_discovery_consent_history
BEFORE INSERT OR UPDATE OR DELETE ON public.member_discovery_consent
FOR EACH ROW EXECUTE FUNCTION private.record_discovery_consent_change();

-- 3. Access: members manage only their own row; admins can read. No visitors.
ALTER TABLE public.member_discovery_consent ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_discovery_consent_events ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.member_discovery_consent FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.member_discovery_consent_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_discovery_consent TO authenticated;
GRANT SELECT ON public.member_discovery_consent_events TO authenticated;
REVOKE ALL ON SEQUENCE public.member_discovery_consent_events_id_seq FROM PUBLIC, anon, authenticated;

DROP POLICY IF EXISTS discovery_consent_own ON public.member_discovery_consent;
CREATE POLICY discovery_consent_own ON public.member_discovery_consent
  FOR ALL TO authenticated
  USING (community_id IN (SELECT c.id FROM public.community c WHERE c.user_id = (SELECT auth.uid())))
  WITH CHECK (community_id IN (SELECT c.id FROM public.community c WHERE c.user_id = (SELECT auth.uid())));

DROP POLICY IF EXISTS discovery_consent_admin_read ON public.member_discovery_consent;
CREATE POLICY discovery_consent_admin_read ON public.member_discovery_consent
  FOR SELECT TO authenticated
  USING ((SELECT private.is_admin()));

DROP POLICY IF EXISTS discovery_consent_events_own_or_admin ON public.member_discovery_consent_events;
CREATE POLICY discovery_consent_events_own_or_admin ON public.member_discovery_consent_events
  FOR SELECT TO authenticated
  USING (
    community_id IN (SELECT c.id FROM public.community c WHERE c.user_id = (SELECT auth.uid()))
    OR (SELECT private.is_admin())
  );

-- 4. Item visibility. Defaults to private; existing rows are NOT backfilled,
-- so nothing already in the database is published by this migration.
-- Owners change these through the existing creator UPDATE policies.
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS discovery_visibility text NOT NULL DEFAULT 'private';
ALTER TABLE public.projects DROP CONSTRAINT IF EXISTS projects_discovery_visibility_check;
ALTER TABLE public.projects ADD CONSTRAINT projects_discovery_visibility_check
  CHECK (discovery_visibility IN ('private', 'public'));

-- opportunities.is_public already exists but defaults to true and controls the
-- members' Explore list, so it is not consent to outside publication.
ALTER TABLE public.opportunities
  ADD COLUMN IF NOT EXISTS discovery_visibility text NOT NULL DEFAULT 'private';
ALTER TABLE public.opportunities DROP CONSTRAINT IF EXISTS opportunities_discovery_visibility_check;
ALTER TABLE public.opportunities ADD CONSTRAINT opportunities_discovery_visibility_check
  CHECK (discovery_visibility IN ('private', 'public'));

COMMENT ON COLUMN public.projects.discovery_visibility IS
  'Community Capability Profile: public = listed for outside people and AI agents. Set only by the project owner.';
COMMENT ON COLUMN public.opportunities.discovery_visibility IS
  'Community Capability Profile: public = listed for outside people and AI agents. Independent of is_public (Explore).';

COMMIT;
