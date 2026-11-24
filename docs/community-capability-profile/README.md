# Community Capability Profile — Phase 1 design package

Innovation Engine (formerly Buildspace) as agent-ready community infrastructure, with
CharlestonHacks as the first implementation.

**Status:** design and proposed migrations for review. Nothing here is deployed, and no database has
been changed. Everything is read-only for outsiders.

| # | Deliverable | File |
|---|---|---|
| 1 | Repository and database assessment | [ASSESSMENT.md](ASSESSMENT.md) |
| 2 | Specification and JSON Schema | [SPEC.md](SPEC.md), [schema/](schema/community-capability-profile.v0.1.schema.json), [example](examples/charlestonhacks.sample.json) |
| 3 | Mapping of existing fields | [MAPPING.md](MAPPING.md) |
| 4 | Privacy, consent, and visibility model | [PRIVACY_MODEL.md](PRIVACY_MODEL.md) |
| 5 | SQL migrations and security policies | [sql/](sql/) |
| 6 | Endpoint and external discovery architecture | [ARCHITECTURE.md](ARCHITECTURE.md) |
| 7–8 | Plan, testing, decisions, limitations, risks | [PLAN.md](PLAN.md) |

## Key findings

- Innovation Engine already holds most of what a profile needs: skills, endorsements, completed
  projects with required skills, evidence-graded capability packages, themes, organizations and
  opportunities.
- Logged-out visitors cannot read member profiles, and nobody can read member emails. Good.
- Logged-out visitors **can** read every endorsement, project membership, theme membership and
  open project today. This predates this work; `sql/003` proposes closing it.
- `opportunities.is_public` defaults to true and means "show in Explore", so it can't be treated as
  consent to outside publication. Projects have no visibility setting. Both get a new
  `discovery_visibility` flag that defaults to private.

## Running the tests

```bash
docs/community-capability-profile/tests/run-tests.sh   # needs initdb, pg_ctl, psql (PostgreSQL 14+)
```

They create a throwaway local cluster with production-shaped tables and access rules, apply the
migrations twice, and run 40 privacy and permission checks. They never touch Supabase.

## Next

The decisions in [PLAN.md](PLAN.md#decisions-needed), then Step 0 (read-only checks on the live
database), then Phase 2. The SQL and tests belong in `deckerd451/innovation-engine`.
