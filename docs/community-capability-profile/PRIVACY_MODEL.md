# Privacy model (revised)

**Make communities discoverable and interoperable without making their members more exposed.**

## Requirements

1. No public member-derived statistics: no aggregated or anonymized skills, endorsements,
   availability, participation or membership counts.
2. No new public access to individual member data, including opt-in public profiles, during the pilot.
3. Public profiles contain only organization-approved information and information already
   intentionally published for external audiences.
4. Member intelligence, capability matching and relationship data stay inside Innovation Engine.
5. External collaboration requests, when built, are routed internally; individuals decide whether
   to respond and what to disclose.
6. Private member data is not sent to external AI services.
7. Existing unintended public database access is audited and corrected first.
8. Existing functionality is preserved; nothing is deployed or changed in production without approval.

## How the design meets them

| Requirement | Design |
|---|---|
| 1, 2, 3 | The public profile is a **static, organizer-curated file** reviewed in a pull request. It never reads the database. The v0.2 schema has no fields for counts or member data, and rejects them. |
| 4 | No public database function, view or endpoint is added. Matching stays in Innovation Engine's signed-in app. |
| 5 | Phase 5 only: an organizational request form stored inside Innovation Engine, shown to members who choose to look. No member is named or contacted automatically. |
| 6 | Neither repo calls an external AI service today. New code must not send member data to one; the public profile is the only thing AI agents receive. |
| 7 | Public database access is reviewed and corrected in Innovation Engine before the profile is published; findings are kept private. |
| 8 | Signed-in access is unchanged and tested; every database change ships with a rollback and a review gate. |

## What changed from the Phase 1 draft

Removed: member consent table, project/opportunity outside-visibility flags, k-anonymity bands,
the snapshot builder, the public snapshot function and the Worker's database access. None of these
were applied anywhere.
