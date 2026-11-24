-- Community Capability Profile privacy tests.
-- Run by run-tests.sh against a throwaway local PostgreSQL cluster only.
\set ON_ERROR_STOP 1

CREATE SCHEMA test;
GRANT USAGE ON SCHEMA test TO anon, authenticated, service_role;
CREATE FUNCTION test.ok(cond boolean, msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAIL: %', msg; END IF;
  RAISE NOTICE 'ok - %', msg;
END $$;
GRANT EXECUTE ON FUNCTION test.ok(boolean, text) TO anon, authenticated, service_role;

-- ---------------------------------------------------------------- seed data
-- Members m01..m14 (community ids 00..0e), auth users a1..ae.
INSERT INTO public.community (id, user_id, name, email, skills, availability, bio, is_hidden, is_disabled, user_role) VALUES
 ('00000000-0000-0000-0000-000000000001','a0000000-0000-0000-0000-000000000001','Alice Example','alice@example.com','Python, Rust, Design','Available now','Alice private bio',false,false,'Member'),
 ('00000000-0000-0000-0000-000000000002','a0000000-0000-0000-0000-000000000002','Bob Example','bob@example.com','python (expert), Rust; Design','Available now',null,false,false,'Member'),
 ('00000000-0000-0000-0000-000000000003','a0000000-0000-0000-0000-000000000003','Cara Example','cara@example.com','Python,Rust,Design','Available now',null,false,false,'Member'),
 ('00000000-0000-0000-0000-000000000004','a0000000-0000-0000-0000-000000000004','Dan Example','dan@example.com','Python, Rust, Design','Available now',null,false,false,'Member'),
 ('00000000-0000-0000-0000-000000000005','a0000000-0000-0000-0000-000000000005','Eve Example','eve@example.com','Python, Design','Available now',null,false,false,'Member'),
 ('00000000-0000-0000-0000-000000000006','a0000000-0000-0000-0000-000000000006','Finn Example','finn@example.com','Python, Secret Unique Skill Zeta','Busy',null,false,false,'Member'),
 ('00000000-0000-0000-0000-000000000007','a0000000-0000-0000-0000-000000000007','Gia Example','gia@example.com','Python',null,null,false,false,'Member'),
 ('00000000-0000-0000-0000-000000000008','a0000000-0000-0000-0000-000000000008','Hal Example','hal@example.com','Python',null,null,false,false,'Admin'),
 ('00000000-0000-0000-0000-000000000009','a0000000-0000-0000-0000-000000000009','Hidden Person','hidden@example.com','Python, Rust','Available now',null,true,false,'Member'),
 ('00000000-0000-0000-0000-00000000000a','a0000000-0000-0000-0000-00000000000a','Disabled Person','disabled@example.com','Python, Rust','Available now',null,false,true,'Member'),
 ('00000000-0000-0000-0000-00000000000b','a0000000-0000-0000-0000-00000000000b','Opted Out Person','optout@example.com','Python, Rust','Available now',null,false,false,'Member'),
 ('00000000-0000-0000-0000-00000000000c','a0000000-0000-0000-0000-00000000000c','Quiet Member','quiet@example.com',null,null,null,false,false,'Member');

-- Opt-out uses the member's own row (inserted as postgres for setup).
INSERT INTO public.member_discovery_consent (community_id, include_in_aggregates)
VALUES ('00000000-0000-0000-0000-00000000000b', false);

INSERT INTO public.endorsements (endorser_community_id, endorsed_community_id, skill)
SELECT '00000000-0000-0000-0000-000000000007', c.id, 'Python'
FROM public.community c WHERE c.id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000009');
INSERT INTO public.endorsements (endorser_community_id, endorsed_community_id, skill)
SELECT '00000000-0000-0000-0000-000000000007', c.id, 'Rust'
FROM public.community c WHERE c.id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004');

INSERT INTO public.theme_circles (id, title, description, tags, status, expires_at) VALUES
 ('10000000-0000-0000-0000-000000000001','AI for Flood Resilience','Exploring sensors and models','{ai,flooding}','active', now() + interval '30 days'),
 ('10000000-0000-0000-0000-000000000002','Expired Theme Title','old','{}','active', now() - interval '1 day'),
 ('10000000-0000-0000-0000-000000000003','Tiny Theme','two people','{}','active', now() + interval '30 days');
INSERT INTO public.theme_participants (theme_id, community_id)
SELECT '10000000-0000-0000-0000-000000000001', id FROM public.community
WHERE id IN ('00000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000004','00000000-0000-0000-0000-000000000005','00000000-0000-0000-0000-000000000006','00000000-0000-0000-0000-000000000007');
INSERT INTO public.theme_participants (theme_id, community_id) VALUES
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000001'),
 ('10000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000002');

INSERT INTO public.projects (id, creator_id, title, description, required_skills, status, budget, theme_id) VALUES
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','Private Completed Project Title','done','{Python}','completed','BUDGET-SECRET-1',null),
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Public Flood Sensors','Low-cost sensors for tidal flooding','{Embedded,Python}','active','BUDGET-SECRET-2','10000000-0000-0000-0000-000000000001'),
 ('20000000-0000-0000-0000-000000000003','00000000-0000-0000-0000-000000000003','Private Open Project Title','not for agents','{Rust}','open',null,null);
INSERT INTO public.project_members (project_id, user_id) VALUES
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000002'),
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000003'),
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000004'),
 ('20000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000005');
INSERT INTO public.capability_packages (project_id, creator_id, title, goal, permission_mode, evidence_status) VALUES
 ('20000000-0000-0000-0000-000000000002','00000000-0000-0000-0000-000000000002','Package Secret Title','goal','community','proven');

INSERT INTO public.organizations (id, name, slug, description, website, verified, status) VALUES
 ('30000000-0000-0000-0000-000000000001','Lowcountry Labs','lowcountry-labs','Makerspace','https://lowcountrylabs.example',true,'active'),
 ('30000000-0000-0000-0000-000000000002','Unverified Org','unverified-org','?','https://u.example',false,'active');
INSERT INTO public.opportunities (title, opportunity_type, summary, organization_id, posted_by, status, url, contact_email, skills, application_deadline, is_public) VALUES
 ('Explore Only Opportunity','volunteer','members only','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','open','https://x.example',null,'[]',null,true),
 ('Public Mentor Role','mentorship','Mentor teams at HarborHack','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','open','http://insecure.example','recruiter@private.example','["Python"]',null,true),
 ('Closed Public Role','job','closed','30000000-0000-0000-0000-000000000001','00000000-0000-0000-0000-000000000001','closed','https://x.example',null,'[]',null,true),
 ('Expired Public Role','job','expired',null,'00000000-0000-0000-0000-000000000001','open','https://x.example',null,'[]',now() - interval '1 day',true);

-- Owners publish (simulated as postgres; owner-path tested below).
UPDATE public.projects SET discovery_visibility = 'public' WHERE id = '20000000-0000-0000-0000-000000000002';
UPDATE public.opportunities SET discovery_visibility = 'public'
WHERE title IN ('Public Mentor Role','Closed Public Role','Expired Public Role');

-- ------------------------------------------------- 1. refresh and read snapshot
SET ROLE service_role;
SELECT test.ok(public.refresh_community_capability_snapshot() > 0, 'service role can refresh a snapshot');
RESET ROLE;

SET ROLE anon;
SELECT public.get_community_capability_snapshot()::text AS snap \gset
RESET ROLE;
CREATE TABLE test.snap AS SELECT :'snap'::jsonb AS j;

SELECT test.ok((SELECT j ? 'generatedAt' AND j->>'specVersion' = '0.1.0' FROM test.snap), 'anon receives a dated, versioned snapshot');

-- ------------------------------------------------- 2. nothing individual leaks
SELECT test.ok(
  NOT EXISTS (
    SELECT 1 FROM test.snap, public.community c
    WHERE position(lower(c.name) IN lower(j::text)) > 0
       OR position(lower(c.email) IN lower(j::text)) > 0
       OR position(c.id::text IN j::text) > 0
       OR position(c.user_id::text IN j::text) > 0
       OR (c.bio IS NOT NULL AND position(lower(c.bio) IN lower(j::text)) > 0)
  ), 'no member names, emails, ids, auth ids or bios in the snapshot');
SELECT test.ok((SELECT position('example.com' IN j::text) = 0 AND position('recruiter@' IN j::text) = 0 FROM test.snap), 'no email addresses (including opportunity contact_email)');
SELECT test.ok((SELECT position('Secret Unique Skill Zeta' IN j::text) = 0 AND position('secret unique' IN lower(j::text)) = 0 FROM test.snap), 'a skill held by one person is not published');
SELECT test.ok((SELECT position('BUDGET-SECRET' IN j::text) = 0 AND position('Package Secret Title' IN j::text) = 0 FROM test.snap), 'project budgets and package contents are not published');
SELECT test.ok((SELECT j::text !~ '"(xp|total_xp|streak|login|attendance)' FROM test.snap), 'no engagement metrics in the snapshot');

-- ------------------------------------------------- 3. aggregation and suppression
CREATE VIEW test.caps AS SELECT c FROM test.snap, jsonb_array_elements(j->'capabilities') c;
SELECT test.ok((SELECT c->'evidence'->'declared'->>'band' FROM test.caps WHERE c->>'id' = 'cap:python') = '5-10',
  'Python declared band is 5-10: hidden, disabled and opted-out members are excluded (else 11-25)');
SELECT test.ok((SELECT c->'evidence'->'endorsed'->>'band' FROM test.caps WHERE c->>'id' = 'cap:python') = '5-10',
  'Python endorsed band counts only eligible endorsed members');
SELECT test.ok((SELECT c->'evidence'->'demonstrated'->>'band' FROM test.caps WHERE c->>'id' = 'cap:python') = '5-10',
  'Python demonstrated from completed project work');
SELECT test.ok((SELECT c->'evidence'->'available'->>'band' FROM test.caps WHERE c->>'id' = 'cap:python') = '5-10',
  'Python available from availability values');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM test.caps WHERE c->>'id' = 'cap:rust'), 'Rust (4 eligible holders) is suppressed at k=5');
SELECT test.ok((SELECT c->'evidence'->'declared'->>'band' FROM test.caps WHERE c->>'id' = 'cap:design') = '5-10', 'Design (exactly 5) is published');
SELECT test.ok(NOT EXISTS (SELECT 1 FROM test.caps WHERE c->'evidence'->'declared'->>'band' = '3-4'), 'no band below k is ever used');

-- ------------------------------------------------- 4. item visibility
SELECT test.ok((SELECT jsonb_array_length(j->'projects') = 1 AND j->'projects'->0->>'title' = 'Public Flood Sensors' FROM test.snap),
  'only the project its owner marked public is listed');
SELECT test.ok((SELECT j->'projects'->0->>'evidence' = 'proven' AND j->'projects'->0->'themes'->>0 = 'theme:10000000-0000-0000-0000-000000000001' FROM test.snap),
  'public project carries evidence label and theme reference');
SELECT test.ok((SELECT position('Private Completed Project Title' IN j::text) = 0 AND position('Private Open Project Title' IN j::text) = 0 FROM test.snap),
  'private projects are not listed (even though they count as evidence)');
SELECT test.ok((SELECT jsonb_array_length(j->'opportunities') = 1 AND j->'opportunities'->0->>'title' = 'Public Mentor Role' FROM test.snap),
  'only open, unexpired, explicitly public opportunities; Explore-only (is_public) ones excluded');
SELECT test.ok((SELECT NOT (j->'opportunities'->0 ? 'applyUrl') AND j->'opportunities'->0->>'organization' = 'partner:lowcountry-labs' FROM test.snap),
  'non-https apply URLs dropped; verified organization referenced');
SELECT test.ok((SELECT jsonb_array_length(j->'partners') = 1 AND j->'partners'->0->>'name' = 'Lowcountry Labs' FROM test.snap), 'only verified, active organizations are partners');
SELECT test.ok((SELECT position('Expired Theme Title' IN j::text) = 0 FROM test.snap), 'expired themes are excluded');
SELECT test.ok((SELECT t->>'participants' FROM test.snap, jsonb_array_elements(j->'themes') t WHERE t->>'title' = 'AI for Flood Resilience') = '5-10', 'theme participant count is banded');
SELECT test.ok((SELECT NOT (t ? 'participants') FROM test.snap, jsonb_array_elements(j->'themes') t WHERE t->>'title' = 'Tiny Theme'), 'small theme participant count is suppressed');

-- ------------------------------------------------- 5. visitors can't reach anything else
SET ROLE anon;
DO $$ BEGIN PERFORM 1 FROM capability_profile.snapshots; RAISE EXCEPTION 'FAIL: anon read snapshots table';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - anon cannot read the snapshots table directly'; END $$;
DO $$ BEGIN PERFORM capability_profile.build(3); RAISE EXCEPTION 'FAIL: anon ran build';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - anon cannot run build() (e.g. with a smaller k)'; END $$;
DO $$ BEGIN PERFORM public.refresh_community_capability_snapshot(); RAISE EXCEPTION 'FAIL: anon refreshed';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - anon cannot trigger a refresh'; END $$;
DO $$ BEGIN PERFORM 1 FROM public.member_discovery_consent; RAISE EXCEPTION 'FAIL: anon read consent';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - anon cannot read consent rows'; END $$;
DO $$ BEGIN PERFORM 1 FROM public.member_discovery_consent_events; RAISE EXCEPTION 'FAIL: anon read consent history';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - anon cannot read consent history'; END $$;
DO $$ BEGIN PERFORM email FROM public.community; RAISE EXCEPTION 'FAIL: anon selected email';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - (baseline) anon cannot select the email column'; END $$;
SELECT test.ok((SELECT count(*) = 0 FROM public.community), '(baseline) anon sees zero member rows');
RESET ROLE;

-- ------------------------------------------------- 6. member consent is own-row only
SET ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000005', false);
INSERT INTO public.member_discovery_consent (community_id, named_profile) VALUES ('00000000-0000-0000-0000-000000000005', false);
SELECT test.ok((SELECT count(*) = 1 FROM public.member_discovery_consent), 'a member sees only their own consent row');
DO $$ BEGIN
  INSERT INTO public.member_discovery_consent (community_id) VALUES ('00000000-0000-0000-0000-000000000006');
  RAISE EXCEPTION 'FAIL: wrote another member''s consent';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok - a member cannot write another member''s consent'; END $$;
DO $$ BEGIN
  UPDATE public.member_discovery_consent SET share_skills = true WHERE community_id = '00000000-0000-0000-0000-000000000005';
  RAISE EXCEPTION 'FAIL: share without named profile';
EXCEPTION WHEN check_violation THEN RAISE NOTICE 'ok - sharing details requires a named profile'; END $$;
-- Revoke: leave community statistics.
UPDATE public.member_discovery_consent SET include_in_aggregates = false WHERE community_id = '00000000-0000-0000-0000-000000000005';
SELECT test.ok((SELECT count(*) = 2 FROM public.member_discovery_consent_events), 'member can review their consent history (2 changes)');
-- Owner publishing path: Cara (m03) owns "Private Open Project Title".
SELECT set_config('request.jwt.claim.sub', 'a0000000-0000-0000-0000-000000000003', false);
UPDATE public.projects SET discovery_visibility = 'public' WHERE id = '20000000-0000-0000-0000-000000000003';
-- ...but cannot change Bob's project.
UPDATE public.projects SET discovery_visibility = 'private' WHERE id = '20000000-0000-0000-0000-000000000002';
RESET ROLE;
SELECT test.ok((SELECT discovery_visibility = 'public' FROM public.projects WHERE id = '20000000-0000-0000-0000-000000000003'), 'a project owner can publish their own project');
SELECT test.ok((SELECT discovery_visibility = 'public' FROM public.projects WHERE id = '20000000-0000-0000-0000-000000000002'), 'a non-owner cannot change another project''s visibility');
SELECT test.ok((SELECT count(*) = 0 FROM public.member_discovery_consent_events WHERE community_id = '00000000-0000-0000-0000-000000000006'), 'no consent row was created for another member');

-- ------------------------------------------------- 7. revocation takes effect in the next snapshot
SET ROLE service_role;
SELECT public.refresh_community_capability_snapshot();
RESET ROLE;
SET ROLE anon;
SELECT public.get_community_capability_snapshot()::text AS snap2 \gset
RESET ROLE;
SELECT test.ok(NOT EXISTS (SELECT 1 FROM jsonb_array_elements((:'snap2'::jsonb)->'capabilities') c WHERE c->>'id' = 'cap:design'),
  'after Eve opts out, Design drops to 4 and is suppressed in the next snapshot');
SELECT test.ok((SELECT c->'evidence'->'declared'->>'band' FROM jsonb_array_elements((:'snap2'::jsonb)->'capabilities') c WHERE c->>'id' = 'cap:python') = '5-10',
  'Python still published after one opt-out');
SELECT test.ok(EXISTS (SELECT 1 FROM jsonb_array_elements((:'snap2'::jsonb)->'projects') p WHERE p->>'title' = 'Private Open Project Title'),
  'a project appears once its owner publishes it');

\echo 'ALL CAPABILITY PROFILE TESTS PASSED'
