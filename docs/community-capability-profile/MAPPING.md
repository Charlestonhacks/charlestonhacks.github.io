# 3. Mapping existing data to the specification

Sources are Innovation Engine tables unless noted. "Rule" is enforced in the database
(`sql/002_capability_profile_snapshot.sql`), not in the Worker.

## Identity

| Spec field | Source | Status |
|---|---|---|
| `identity.*` | Hand-written. Draft text (from the home page's mission and values) is the `identity` block in `examples/charlestonhacks.sample.json`; it becomes `identity.json` in the website repo in Phase 2 | **Needs review and approval.** Not stored in the database. |
| `accessibility.*` | Same file | Needs the planned pages (`/community`, `/agents.html`, `/privacy.html`) to exist |

## Capabilities

| Spec field | Source | Rule |
|---|---|---|
| `capabilities[].label`, `id` | `community.skills` split on `,`/`;`, lower-cased, "(level)" removed | Only skills held by ≥ k eligible members |
| `evidence.declared` | Distinct eligible members listing the skill | Banded, k-suppressed |
| `evidence.endorsed` | `endorsements` where `endorsed_community_id` is eligible; self-endorsements ignored | Banded, k-suppressed |
| `evidence.demonstrated` | Member declares the skill **and** created or joined a `completed` project whose `required_skills` includes it | Banded, k-suppressed |
| `evidence.available` | Member declares the skill and `availability` ∈ {Available now, Available for mentoring, Looking for opportunities, Available, Open to opportunities, Limited availability} | Banded, k-suppressed |
| — | `total_xp`, `level`, streaks, `user_achievements`, attendance | **Never used** as evidence |

Eligible member: `is_hidden` false, `is_disabled` false, and `include_in_aggregates`
(no consent row = default, decision D1).

## Intent

| Spec field | Source |
|---|---|
| `intent.has` | Top published capabilities (Worker builds references) |
| `intent.building` | Published projects |
| `intent.exploring` | Active themes |
| `intent.needs` | Skills needed by published projects; hand-written needs in `identity.json` |
| `intent.offers`, `intent.openTo` | Hand-written in `identity.json` |

## Items

| Spec section | Source | Included when | Never included |
|---|---|---|---|
| `projects` | `projects` | `discovery_visibility = 'public'` (new, default private) and status open/active/completed | creator, members, budget, timeline, view/bid counts |
| `projects[].evidence` | Highest `capability_packages.evidence_status` with `permission_mode = 'community'` | Project is public | Package contents |
| `opportunities` | `opportunities` | `discovery_visibility = 'public'` (new, default private), `status = 'open'`, deadline not passed | `contact_email`, `posted_by`, compensation, counters, non-https URLs |
| `themes` | `theme_circles` + `theme_participants` | Active and unexpired; participant count banded | Participant identities |
| `partners` | `organizations` | `status = 'active'` and `verified = true` (decision D3) | Members, social links |
| `activities` | Website events feed (Meetup iCal via `events-worker`) | Already public | — |

## Named individuals (future)

`member_discovery_consent` holds per-field opt-ins (`named_profile`, `share_skills`, `share_bio`,
`share_availability`, `share_endorsements`, `accept_introductions`). **v0.1 publishes no individuals**;
the flags exist so members can choose ahead of the named-profile phase, and so
collaboration requests (Phase 5) can be routed only to members who accept introductions.
