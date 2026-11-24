# 1. Repository and database assessment

Date: 2026-11-24. **No live database access was available.** Findings are marked:

- **Verified (repo):** read directly from code or SQL in a repository.
- **Verified (dump):** from the production schema dump `supabase/sql/reference/buildspace_schema.sql`
  in `deckerd451/innovation-engine` (last committed 2026-11-22). Innovation Engine's own docs warn that
  repository definitions are not proof of what is deployed, so every item below should be confirmed
  against the live project before migrations run (see `PLAN.md`, step 0).
- **Assumption:** inferred, not checked.

## Systems

| System | Repo | Role | Database |
|---|---|---|---|
| CharlestonHacks website | `Charlestonhacks/charlestonhacks.github.io` (GitHub Pages) | Public site, BBS chat, member portal (`hub.html`), events feed | Reads Innovation Engine Supabase for chat/members |
| Innovation Engine (formerly Buildspace) | `deckerd451/innovation-engine` (GitHub Pages at `/innovation-engine/`) | Members, projects, organizations, opportunities, themes, endorsements, capability memory | Supabase `mqbsjlgnsirqsmfnreqd` |
| Nearify | separate | Event presence, saved people, follow-up | Separate Supabase project `unndeygygkgodmmdnlup`; IDs must never be mixed (`SYSTEM_BOUNDARIES.md`) |
| Events worker | `workers/events-worker.js` in the website repo (Cloudflare) | Merges Meetup iCal feeds (CharlestonHacks, CHS AWS, TechYeet, First Friday, CHS InfoSec) into `external_events` | Writes with the service role key |

The website embeds Innovation Engine in an iframe and still uses `buildspace` in internal identifiers
(`portal-buildspace-frame`, `ch:portal-return-to-buildspace`, …). These are not user-visible and are left
as is; renaming them would break saved state and the cross-frame auth bridge. One user-visible label
("Follow up in Buildspace" on the events feed) is renamed in a separate change.

## Data relevant to the profile (Verified: dump)

| Table | Useful columns | Notes |
|---|---|---|
| `community` | `skills` (comma-separated text, optional "(level)" suffix), `interests` (text[]), `availability` (text from a fixed list), `bio`, `is_hidden`, `is_disabled` | Also holds `email`, XP, streaks, login times. Must never be exposed. |
| `endorsements` | `endorsed_community_id`, `endorser_community_id`, `skill` | Member-to-member attestations |
| `projects` | `title`, `description`, `status` (`open/active/completed/…`), `required_skills` (text[]), `tags`, `theme_id`, `creator_id` | **No visibility field.** Also `budget`, `timeline`. |
| `project_members` | `project_id`, `user_id` (= `community.id`), `left_at` | Basis for "demonstrated" evidence |
| `capability_packages` | `project_id`, `evidence_status` (`untested/tested/proven`), `permission_mode` (`private/community`) | Existing evidence model from real project work |
| `theme_circles` / `theme_participants` | title, description, tags, status, expiry / membership | Areas being explored |
| `organizations` | `name`, `slug`, `website`, `description`, `verified`, `status` | |
| `opportunities` | `title`, `opportunity_type`, `summary`, `skills` (jsonb), `status`, `application_deadline`, `url`, `is_public`, **`contact_email`** | `is_public` **defaults to true** and controls the members' Explore list. It is not consent to outside publication. |
| `skills` | `name`, `category`, `usage_count` | Partial vocabulary |
| `user_achievements`, XP fields | | Engagement, not competence: excluded by design |

Not in the database: the community's identity (mission, values, culture). It lives only in page text.

## Current public (logged-out) access (Verified: dump; confirm live)

What an anonymous visitor using the website's public key can read today:

| Data | Logged-out access | Assessment |
|---|---|---|
| Member profiles (`community`) | **None.** RLS allows `authenticated` only; `email` has no column grant to anyone. | Good. Hardened 2026-10-27. |
| `endorsements` | **All rows** (`USING (true)`): endorser and endorsed member ids plus skill | Pseudonymous, but reveals individual skill attestations |
| `project_members` | **All rows** | Reveals who works on what (by id) |
| `theme_participants` | **All rows** | Reveals who follows which theme (by id) |
| `projects` | **All open/active/completed projects**, every column including `creator_id`, `budget`, `timeline` | Conflicts with "projects private by default" |
| `organizations`, `organization_members` | Active organizations; all memberships (`allow_select USING (true)`), including member titles/bios | Organization data is reasonably public; member rows less so |
| `theme_circles` | Active themes | Fine |
| `opportunities` | **None** (authenticated only) | Fine |

The ids above can be joined across tables, so the exposure is wider than any single table suggests.
These rules predate this project; they are not changed by the proposed migrations. Tightening them is
offered separately in `sql/003_optional_tighten_public_access.PROPOSAL.sql` (decision D4).

Supabase grants table-level privileges (including `TRUNCATE`) to `anon` by default and relies on RLS.
`TRUNCATE` is not reachable through the REST API, so this is a hardening note, not an exposure.

## Gaps for the profile

1. No member consent for outside discovery.
2. No project visibility setting; the opportunity flag means something else.
3. No structured identity statement.
4. Skills are free text, so the same skill appears in many spellings.
5. No public read path that returns aggregates without reading raw rows.

All five are addressed by the proposed specification, migrations, and endpoint.
