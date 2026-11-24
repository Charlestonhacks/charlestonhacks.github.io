-- Test fixture: the production shape of the tables the profile reads.
-- Column types, RLS policies and grants copied from the Innovation Engine
-- schema dump (supabase/sql/reference/buildspace_schema.sql, 2026-11-22),
-- reduced to the columns that matter. Runs only against a throwaway cluster.

CREATE EXTENSION IF NOT EXISTS pgcrypto;
DO $$ BEGIN CREATE ROLE anon NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE authenticated NOLOGIN; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE ROLE service_role NOLOGIN BYPASSRLS; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE SCHEMA IF NOT EXISTS auth;
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
GRANT USAGE ON SCHEMA auth TO anon, authenticated, service_role;
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

-- Supabase default privileges: new public tables/functions/sequences are
-- granted to the API roles. The migrations must revoke where needed.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT EXECUTE ON FUNCTIONS TO anon, authenticated, service_role;

CREATE TABLE public.community (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  name text NOT NULL,
  email text,
  skills text,
  interests text[],
  availability text,
  bio text,
  user_role text DEFAULT 'Member',
  is_hidden boolean DEFAULT false,
  is_disabled boolean DEFAULT false NOT NULL,
  total_xp integer DEFAULT 0
);

CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
CREATE OR REPLACE FUNCTION private.is_admin() RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT EXISTS (SELECT 1 FROM public.community c WHERE c.user_id = auth.uid() AND c.user_role = 'Admin') $$;
GRANT USAGE ON SCHEMA private TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin() TO authenticated;

CREATE TABLE public.theme_circles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, description text, tags text[] DEFAULT '{}',
  status text DEFAULT 'active', expires_at timestamptz NOT NULL,
  created_by uuid REFERENCES public.community(id), last_activity_at timestamptz DEFAULT now()
);
CREATE TABLE public.projects (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  creator_id uuid NOT NULL REFERENCES public.community(id),
  title text, description text, tags text[] DEFAULT '{}',
  required_skills text[] DEFAULT '{}' NOT NULL, status text DEFAULT 'open',
  budget text, timeline text, theme_id uuid REFERENCES public.theme_circles(id),
  created_at timestamptz DEFAULT now(), updated_at timestamptz DEFAULT now()
);
CREATE TABLE public.project_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id), user_id uuid NOT NULL REFERENCES public.community(id),
  role text DEFAULT 'member', left_at timestamptz
);
CREATE TABLE public.endorsements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  endorser_id uuid, endorser_community_id uuid REFERENCES public.community(id),
  endorsed_id uuid, endorsed_community_id uuid REFERENCES public.community(id),
  skill text NOT NULL, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL, slug text NOT NULL UNIQUE, description text, website text,
  verified boolean DEFAULT false, status text DEFAULT 'active'
);
CREATE TABLE public.opportunities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL, opportunity_type text NOT NULL, summary text, description text,
  organization_id uuid REFERENCES public.organizations(id), posted_by uuid REFERENCES public.community(id),
  location_type text, status text DEFAULT 'open' NOT NULL, url text, contact_email text,
  skills jsonb DEFAULT '[]', application_deadline timestamptz, is_public boolean DEFAULT true,
  commitment text, created_at timestamptz DEFAULT now()
);
CREATE TABLE public.theme_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  theme_id uuid REFERENCES public.theme_circles(id), community_id uuid REFERENCES public.community(id),
  engagement_level text DEFAULT 'observer'
);
CREATE TABLE public.capability_packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid NOT NULL REFERENCES public.projects(id), creator_id uuid NOT NULL REFERENCES public.community(id),
  title text NOT NULL, goal text NOT NULL,
  permission_mode text NOT NULL DEFAULT 'private', evidence_status text NOT NULL DEFAULT 'untested'
);

-- Production grants on community: no table-level SELECT; column SELECT on all but email.
REVOKE SELECT ON public.community FROM anon, authenticated;
GRANT SELECT (id, user_id, name, skills, interests, availability, bio, user_role, is_hidden, is_disabled, total_xp)
  ON public.community TO anon, authenticated;

-- Production RLS (subset that matters here).
ALTER TABLE public.community ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view profiles and presence" ON public.community FOR SELECT TO authenticated
  USING ((is_hidden IS NULL) OR (is_hidden = false) OR (user_id = (SELECT auth.uid())) OR (SELECT private.is_admin()));
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view open/active projects" ON public.projects FOR SELECT
  USING (status = ANY (ARRAY['open', 'active', 'completed']));
CREATE POLICY projects_update_creator_only ON public.projects FOR UPDATE TO authenticated
  USING (creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()))
  WITH CHECK (creator_id IN (SELECT id FROM public.community WHERE user_id = auth.uid()));
ALTER TABLE public.project_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view project members" ON public.project_members FOR SELECT USING (true);
ALTER TABLE public.endorsements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view endorsements" ON public.endorsements FOR SELECT USING (true);
ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organizations are viewable by everyone" ON public.organizations FOR SELECT USING (status = 'active');
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can read opportunities" ON public.opportunities FOR SELECT TO authenticated USING (true);
ALTER TABLE public.theme_circles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to active themes" ON public.theme_circles FOR SELECT USING (status = 'active');
ALTER TABLE public.theme_participants ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public read access to participants" ON public.theme_participants FOR SELECT USING (true);
ALTER TABLE public.capability_packages ENABLE ROW LEVEL SECURITY;
