-- Community Capability Profile — 003 (OPTIONAL): tighten existing public reads
-- STATUS: PROPOSAL ONLY. DO NOT RUN until decision D4 is made and the
-- checklist below is complete. Independent of 001 and 002.
--
-- Today (per the schema dump) logged-out visitors can read every row of
-- endorsements, project_members and theme_participants, and every column of
-- open/active/completed projects. That predates this project and conflicts
-- with "member projects private by default". These changes limit those reads
-- to signed-in members; the public profile then becomes the only outside view.
--
-- Checklist before running:
--   [ ] Confirm the live policies match the dump (pg_policies query in PLAN.md).
--   [ ] Confirm no logged-out page reads these tables. Repo search (2026-11-24)
--       found them used only by signed-in Innovation Engine dashboard code.
--   [ ] Test logged out on charlestonhacks.com and the Innovation Engine pages.
--   [ ] Run on a Supabase branch or staging project first.

BEGIN;

ALTER POLICY "Anyone can view endorsements" ON public.endorsements TO authenticated;
ALTER POLICY "Anyone can view project members" ON public.project_members TO authenticated;
ALTER POLICY "Project members are viewable by everyone" ON public.project_members TO authenticated;
ALTER POLICY "Public read access to participants" ON public.theme_participants TO authenticated;
ALTER POLICY "Anyone can view open/active projects" ON public.projects TO authenticated;

-- organization_members: "allow_select USING (true)" makes every membership
-- (including member titles and bios) public, overriding the narrower policies.
-- Organization pages may be viewed logged out, so confirm before enabling:
-- DROP POLICY IF EXISTS allow_select ON public.organization_members;

COMMIT;
