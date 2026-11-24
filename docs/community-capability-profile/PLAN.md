# Plan

## Decisions

- No member-derived public data of any kind, including aggregated or anonymized statistics.
- Partners: verified, active organizations that organizers confirm for public listing.
- Database migrations and their tests live in the Innovation Engine repository.
- The existing events Worker remains the public events source, with no new permissions.

## Steps

| Step | What | Gate |
|---|---|---|
| 1 | Complete and verify the Innovation Engine security work | Maintainer approval, live verification |
| 2 | Organizers approve the profile text (`examples/charlestonhacks.draft.json`), needs and partners | Organizer approval |
| 3 | Publish `/.well-known/community-profile.json`, the GitHub Pages include and a discovery link on a branch; check the preview | Preview check |
| 4 | Merge | Approval |
| 5 | Agent check: ask several AI assistants about CharlestonHacks; confirm accurate answers and that none name members | — |

## Later

Consent-based collaboration requests routed inside Innovation Engine; discovery of other
communities' self-published or public information, marked with provenance.
