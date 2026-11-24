# Community Capability Profile

Making CharlestonHacks discoverable and interoperable, through Innovation Engine (formerly
Buildspace), **without making its members more exposed**.

**Status (revised 2026-11-24):** design only. Nothing deployed; no database changed.

| Document | |
|---|---|
| [SPEC.md](SPEC.md) | Spec v0.2: organizer-approved, public-only content; member-derived data forbidden |
| [schema/](schema/community-capability-profile.v0.2.schema.json) | JSON Schema (rejects counts and member fields) |
| [examples/charlestonhacks.draft.json](examples/charlestonhacks.draft.json) | Draft profile for organizer review |
| [PRIVACY_MODEL.md](PRIVACY_MODEL.md) | Requirements and how the design meets them |
| [ASSESSMENT.md](ASSESSMENT.md) | Live audit of what signed-out visitors can read |
| [ARCHITECTURE.md](ARCHITECTURE.md) | Static curated profile; Innovation Engine stays private |
| [PLAN.md](PLAN.md) | Phase 2 steps, gates and remaining privacy risks |

The database fix for existing exposure is in
[Innovation Engine PR #362](https://github.com/deckerd451/innovation-engine/pull/362).

The v0.1 draft (member statistics, consent table, snapshot function) is superseded and was never applied.
