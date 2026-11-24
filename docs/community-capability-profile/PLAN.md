# Plan

## Decisions

- No member-derived public data of any kind, including aggregated or anonymized statistics.
- Partners: verified, active organizations that organizers confirm for public listing.
- Database migrations and their tests live in the Innovation Engine repository.
- The existing events Worker remains the public events source, with no new permissions.

## Steps

| Step | What | Status |
|---|---|---|
| 1 | Complete and verify the Innovation Engine security work | Done 2026-11-24 (signed-out access verified live) |
| 2 | Organizers approve the profile text, needs and partners | Approved in principle 2026-11-24 |
| 3 | Publish `/.well-known/community-profile.json`, the GitHub Pages include and a discovery link | Live 2026-11-24 (#556); schema live (#557) |
| 4 | Final review: accuracy corrections, past vs current wording, partner evidence, discoverability, adoption guide | Prepared for approval |
| 5 | Agent check (see [TESTING_DISCOVERY.md](TESTING_DISCOVERY.md)) | After step 4 |

## Later

Consent-based collaboration requests routed inside Innovation Engine; discovery of other
communities' self-published or public information, marked with provenance.
