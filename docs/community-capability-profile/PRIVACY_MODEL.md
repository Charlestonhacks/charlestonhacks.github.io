# 4. Privacy, consent, and visibility model

**Discover capabilities, not individuals. Connect individuals through consent, not exposure.**
An outside agent can learn that CharlestonHacks has Python experience; it cannot learn who has it.

## Tiers of disclosure

| Tier | What | Default | Who decides |
|---|---|---|---|
| 0. Private | Everything about a member | Always | — |
| 1. Counted | Member included, anonymously, in banded capability totals | **On** (decision D1) | Member can opt out at any time |
| 2. Named profile | Name appears in the public profile | Off | Member opt-in |
| 3. Shared details | Skills, bio, availability, endorsements, each separately | Off; requires tier 2 | Member opt-in per field |
| 4. Introductions | Agents may route collaboration requests to the member | Off | Member opt-in; each introduction also needs the member's yes |

v0.1 publishes tiers 0–1 only. Tiers 2–4 are stored but not yet published.

Contact details (email, phone) are **never** published at any tier. Introductions are routed
by the community, not by handing out contact information.

## Items

| Item | Default | Rule |
|---|---|---|
| Projects | Private | Owner sets `discovery_visibility = 'public'`. Existing projects are not backfilled. |
| Opportunities | Private | Poster sets `discovery_visibility = 'public'`. `is_public` (Explore) is ignored for outside publication because it defaults to true. |
| Themes | Public if active | Already public today; participant counts banded |
| Organizations | Public if verified and active | Decision D3 |

A published project's description is the owner's own text. The UI should warn owners not to
include other people's names or contact details before publishing.

## Re-identification safeguards

1. **Minimum group size k = 5.** Any count below 5 is omitted, never shown as "1" or "under 5".
2. **Bands, not numbers:** 5-10, 11-25, 26-50, 51+. Small changes rarely move a band.
3. **Snapshots, not queries.** Visitors get the latest stored snapshot from a function with no
   arguments. There is no way to filter by skill, theme, date, or member group, so narrow or
   repeated queries can't be combined to isolate a person.
4. **Daily refresh at most.** Comparing two snapshots can reveal a change of at most one band;
   bands plus k make a single person's change rarely visible. Phase 2 measures this before
   increasing the refresh rate.
5. **Rare skill names stay hidden.** A skill string held by fewer than k members never appears, so
   unusual self-descriptions ("Founder of Acme Corp") can't identify anyone.
6. **Allowlists in the database.** The snapshot builder selects named columns only. The visitor
   role cannot read the snapshot table, call the builder (for example with a smaller k), or
   trigger a refresh.

## Member controls

- Review: members read their own consent row and its full change history.
- Change and revoke: members update or delete their own row; deleting restores defaults.
- Effect of revocation: the member is excluded from the **next** snapshot (within 24 hours).
  Already-retrieved copies held by third parties cannot be recalled; the profile says so.
- Admins can read consent rows for support but cannot change them (no admin write policy).

## External communities (Phase 3)

- Use only legitimately accessible public sources; respect `robots.txt`, terms, and logins.
- Describe communities, never compile profiles of individuals.
- Mark every record `inferred`, with sources, retrieval time, and confidence.
- Always `participation: not-confirmed` until the community publishes its own profile.

## Verified by tests

`tests/run-tests.sh` runs 40 checks against a throwaway Postgres copy of the production table
shapes and access rules, including: no names, emails, ids, bios, budgets or rare skills in the
snapshot; hidden, disabled and opted-out members excluded; suppression at exactly k; visitors
blocked from everything but the snapshot; members limited to their own consent; owner-only
publishing; revocation taking effect in the next snapshot.
