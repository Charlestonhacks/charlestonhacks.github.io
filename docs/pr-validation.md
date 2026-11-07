# Pull-request checks

`.github/workflows/site-pr-checks.yml` runs on pull requests targeting `main`. It has read-only repository permissions, installs no application packages, and does not deploy. New pushes cancel an older check run for the same PR, not Pages publishing. It checks the proposed merge using Node 24 and Python 3.12.

The job runs:

```sh
node tests/homepage-events.test.mjs
PYTHONDONTWRITEBYTECODE=1 python3 -m unittest discover -s tests -p 'test_*.py'
python3 scripts/check_media_manifest.py
python3 scripts/check_local_assets.py --base-ref <base-commit>
```

The checkout is shallow. The workflow fetches only the PR base commit for comparison rather than downloading the repository's full media history. It needs no deployment credentials or third-party API keys.

## Local paths

`check_local_assets.py` checks tracked HTML `src`, `href`, `poster`, `data-src`, and ordinary `srcset` references; inline/style-file CSS URLs and imports; and static relative/root JavaScript module imports. It resolves paths relative to the source document or stylesheet, decodes URL escapes, ignores query/fragment suffixes, and checks exact tracked filename casing. A directory target requires an index.html.

For a strict inventory of unresolved references, run:

```sh
python3 scripts/check_local_assets.py
```

The strict check currently reports 39 existing unresolved paths, including legacy/demo routes and code. These are not permanent exemptions. A PR comparison computes errors in both Git versions and fails only for new errors. Deleting a still-referenced asset is therefore caught even when the referencing page is unchanged. Fixes stop appearing in subsequent base snapshots.

For the same regression check locally, fetch the intended base and run:

```sh
git fetch origin main
python3 scripts/check_local_assets.py --base-ref origin/main
```

This is a static path checker, not a browser test or complete JavaScript parser. It does not request external URLs, validate fragment IDs, inspect authenticated states, or execute dynamically constructed paths. It may need extending when new template or module syntax is introduced. External link failures and visual regressions still need appropriate review. Untracked assets must be staged before they count as published files.

## Media inventory

The manifest check fails on missing assets, missing/duplicate records, or stale sizes. Update its inventory intentionally when changing media; see [media maintenance](reference/MEDIA_OPTIMIZATION_2026-11.md#maintaining-the-inventory). Do not automatically classify or delete assets to satisfy a check.

## GitHub setup

After this workflow is merged, open or update a PR to confirm its first hosted run succeeds. Adding a workflow does not make the check mandatory: an administrator can separately add the resulting check to branch rules after confirming its name and behavior. No branch rules or deployment settings are changed by this PR.
