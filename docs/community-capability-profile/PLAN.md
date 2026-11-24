# Plan (revised 2026-11-24)

## Decisions applied

| # | Decision | Effect |
|---|---|---|
| Privacy | No member-derived public data of any kind | D1 (opt-in) and D2 (k=5) are **moot**: nothing member-derived is published |
| D3 | Only verified, active organizations confirmed suitable for public listing | `partners` is hand-curated in the profile file; empty until organizers approve entries |
| D4 | Tighten existing anonymous access first | [Innovation Engine PR #362](https://github.com/deckerd451/innovation-engine/pull/362) |
| D5 | Reuse the existing Worker | As the public events source only; no new permissions |
| D6 | Simple skill normalization | Moot for the public profile (no skills published) |
| D7 | Database migrations and tests in Innovation Engine | PR #362 |

## Phase 1 (this revision): design

Spec v0.2, schema, draft profile, assessment, privacy model, architecture. Docs only.

## Phase 2 (prepared, not deployed)

| Step | What | Gate |
|---|---|---|
| 2.1 | Live policy check (admin, read-only SQL in PR #362) | Results reviewed |
| 2.2 | Apply PR #362 on a Supabase branch; test signed out and signed in (org pages, org admin approvals, projects, endorsements, idea teams, dashboard) | Tests pass |
| 2.3 | Apply PR #362 to production | Your approval |
| 2.4 | Classify the remaining public tables (`ideas`, comments, upvotes, `signals`, `theme_actions`, `swag_votes`, `zork_events`, `cynq_cards`) and close any unintended ones | Owner decision per table |
| 2.5 | Fix `zork_saves` (any visitor can read/overwrite/delete any guest save): random per-browser save key and a narrow function, website and database change together | Review |
| 2.6 | Organizers approve the profile text (`examples/charlestonhacks.draft.json`), partners and needs | Organizer approval |
| 2.7 | Publish `/.well-known/community-profile.json`, the Jekyll include and the discovery link | Preview check, your approval |
| 2.8 | Agent check: ask several AI assistants about CharlestonHacks before and after; confirm accurate answers and that none name members | — |

## Remaining privacy risks

| Risk | Status |
|---|---|
| Member data readable by signed-out visitors (endorsements, project members, projects, org members incl. bios, followers, team join messages) | **Open until PR #362 is applied** |
| Any visitor can read, overwrite or delete guest Zork saves | Open (2.5) |
| Other public tables with member-generated content and unclear intent | Open (2.4) |
| Signed-in members can read every other member's endorsements, project memberships, org bios, join messages | Existing, by design of the app; outside this pilot. Worth a separate review of what members see of each other. |
| `organizations.follower_count` and `opportunity_count` are public | Organization-level counts derived from member activity; decide whether to keep public |
| `get_unread_notification_count(user_id)` accepts any user id (signed-in callers) | Low; restrict to the caller's own id |
| Free text in the curated profile could name people | Pull-request review; profile contains no member data by rule |
| The schema copy in the repo is older than the live database | Use live checks before each change |
| These docs and PR #362 are in public repos and describe open exposures | Close #362 promptly after review |
