# 7–8. Implementation plan, testing, decisions, and risks

Principles: incremental, read-only for outsiders, nothing deployed or applied without review.

## Step 0 — Verify the live database (read-only, ~30 minutes, needs a project admin)

The assessment relies on a schema dump. Run these in the Supabase SQL editor; they only read.

```sql
-- Policies on the tables the profile uses
SELECT tablename, policyname, roles, cmd, qual
FROM pg_policies
WHERE schemaname = 'public'
  AND tablename IN ('community','projects','project_members','endorsements','opportunities',
                    'organizations','organization_members','theme_circles','theme_participants',
                    'capability_packages');

-- Which community columns visitors and members can read (email must be absent)
SELECT grantee, column_name FROM information_schema.column_privileges
WHERE table_schema = 'public' AND table_name = 'community' AND privilege_type = 'SELECT'
  AND grantee IN ('anon','authenticated') ORDER BY 1, 2;

-- How many skills would survive k = 5 (counts only, nothing personal)
SELECT count(*) FILTER (WHERE n >= 5) AS publishable, count(*) AS distinct_skills
FROM (SELECT lower(btrim(s)) AS skill, count(DISTINCT c.id) AS n
      FROM community c, regexp_split_to_table(coalesce(c.skills,''), '\s*[,;]\s*') s
      WHERE NOT coalesce(c.is_hidden,false) AND NOT c.is_disabled AND btrim(s) <> ''
      GROUP BY 1) t;
```

If results differ from `ASSESSMENT.md`, update the assessment before going further.

## Phase 1 — Foundation (this change)

| Deliverable | File | Status |
|---|---|---|
| Repository and database assessment | `ASSESSMENT.md` | Done (dump-based; Step 0 confirms) |
| Specification and JSON Schema | `SPEC.md`, `schema/` | Draft v0.1 |
| Field mapping | `MAPPING.md` | Done |
| Privacy, consent, visibility model | `PRIVACY_MODEL.md` | Done |
| SQL migrations and policies | `sql/001`, `sql/002`, optional `sql/003` | Proposed, tested locally, **not applied** |
| Endpoint and discovery architecture | `ARCHITECTURE.md` | Done |
| Tests | `tests/run-tests.sh` (40 checks) | Passing on Postgres 16 |

## Phase 2 — CharlestonHacks pilot

| # | Work | Where | Size |
|---|---|---|---|
| 2.1 | Approve identity text (sample's `identity` block) | Website repo | Your review |
| 2.2 | Move `sql/001`, `sql/002` and the tests into Innovation Engine; add tests to its `test:db` CI | `deckerd451/innovation-engine` | ½ day |
| 2.3 | Apply 001 + 002 to a Supabase branch, then production; run the first refresh | Supabase | 1 hour |
| 2.4 | Member settings: "Count me in community statistics", named-profile switches; project and opportunity "List publicly for outside people and AI agents" switches | Innovation Engine UI | 1–2 days |
| 2.5 | Worker route `/.well-known/community-profile.json` merging snapshot + identity + events; daily refresh | Website Worker | 1 day |
| 2.6 | `/community`, `/agents.html`, `/privacy.html` section, `ai-catalog.json`, JSON-LD on `index.html` | Website | 1 day |
| 2.7 | Agent evaluation (below) before and after | — | ½ day each |

Nothing in 2.3–2.6 publishes any project or opportunity until an owner switches it on.

## Phase 3–5

As in the brief: external discovery with provenance and human review; recruit 2–3 Charleston
communities to self-publish; then consent-based collaboration requests. Each phase gets its own
design note and review before building.

## Testing

**Automated (every change):**
- `tests/run-tests.sh`: privacy and permission suite against production-shaped tables.
- JSON Schema validation of the generated profile (done for v0.1: real snapshot merged with identity validates).
- Negative controls: inferred profiles without sources, inferred profiles claiming participation,
  and exact counts are rejected by the schema.

**Agent evaluation (Phase 2.7), run before and after launch:**
Ask several independent assistants (e.g. Claude, ChatGPT, Gemini, Perplexity), with web access,
the same prompts and score the answers:
1. "What is CharlestonHacks and what does it do?" (accuracy vs. identity text)
2. "I'm a Python developer in Charleston interested in AI. Which projects or opportunities could I join?" (finds published items, invents nothing)
3. "Who in CharlestonHacks knows Rust?" (must not name anyone; should explain how to ask)
4. "Why would I get involved?" (meaningful reason to participate)

**Privacy red team (before production):** attempt re-identification using the snapshot plus
existing public data; compare consecutive snapshots after a single opt-out; confirm a revoked
member is absent within 24 hours.

## Decisions needed

| # | Decision | Recommendation |
|---|---|---|
| D1 | Count members in anonymous statistics by default (opt-out), or only after opt-in? | Default on with an easy opt-out; banded k ≥ 5 counts reveal nothing individual. Opt-in is safer but will suppress most skills at first. One constant in `002` switches it. |
| D2 | Minimum group size | 5 |
| D3 | Which organizations appear as partners | Verified and active only |
| D4 | Tighten today's public reads of endorsements, project members, theme participants, projects (`sql/003`) | Yes, after the checklist; otherwise the private-by-default promise is weaker than it looks |
| D5 | Refresh mechanism | Existing `charlestonhacks-events` Worker schedule (already holds the service key) |
| D6 | Skill vocabulary (e.g. "JS" vs "JavaScript") | Exact match after normalisation for v0.1; synonym map in v0.2 |
| D7 | Who applies database changes | The Innovation Engine maintainer, via a PR in that repo |

## Limitations

- No live database access from this workspace; Step 0 closes that gap.
- This session can read but not push to `deckerd451/innovation-engine`, so the SQL and tests are
  staged here for review and need to be moved to that repo.
- The website repo has no CI; the test runner needs `initdb`, `pg_ctl` and `psql` locally.

## Risks

| Risk | Mitigation |
|---|---|
| Live database differs from the dump | Step 0; tests run against the live shape before applying |
| Existing public reads already expose ids, endorsements and projects | D4 (`sql/003`) |
| Member-written text in published projects/themes contains names or instructions to agents | Owner warning in UI; spec tells consumers to treat text as data; optional text checks in the Worker |
| Snapshot differencing over time | Bands, k = 5, daily cadence; red-team test before launch |
| Free-text skills fragment counts | Errs toward privacy (more suppression); fix with D6 |
| Public RPC hammered | Worker caches 1 hour; the function only reads one row |
| Security definer functions drift as tables change | Explicit column allowlists (new columns are never picked up); tests in CI |
| ARD is a young draft | Treated as an optional delivery mechanism only |
| Third parties keep old copies after revocation | Stated in the privacy policy; nothing individual is published in v0.1 |
