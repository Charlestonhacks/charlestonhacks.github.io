# Innovation Engine production deployment

## Topology

- `deckerd451/innovation-engine` is the canonical application source. Production releases are immutable commits from that repository.
- `Charlestonhacks/charlestonhacks.github.io` is the GitHub Pages host for `charlestonhacks.com`. Its `main` branch remains the legacy HarborHack/public-site rollback source and is not synchronized with or replaced by the Innovation Engine history.
- `.github/workflows/deploy-innovation-engine-pages.yml` promotes one explicit, full Innovation Engine commit SHA. It never deploys files from this repository's `main` branch.

## Manual promotion

1. Verify the proposed commit in `deckerd451/innovation-engine`, including its tests, `CNAME`, cache identifiers, and release contents.
2. Record the full lowercase 40-character commit SHA. Do not use a branch or tag name.
3. In this repository's **Settings → Pages**, change **Build and deployment → Source** from **Deploy from a branch** to **GitHub Actions**. This is a one-time production cutover and should be done immediately before the first promotion.
4. Open **Actions → Deploy Innovation Engine to Pages → Run workflow** on `main`.
5. Enter the verified Innovation Engine commit SHA as `release_sha`, then run the workflow.
6. Wait for the `github-pages` environment deployment and complete the verification checklist below.

For later releases, leave the Pages source set to GitHub Actions and repeat steps 1, 2, 4, 5, and 6 with a new verified SHA.

## Verification checklist

- The workflow log confirms that the checked-out `HEAD` exactly equals the requested SHA.
- The artifact contains root-level `index.html`, `CNAME`, `sw.js`, and `assets/js/node-panel.js`.
- The workflow's release checks find `pd-remove-member-btn`, `removeProjectMember`, and `isProjectCreator` in `assets/js/node-panel.js`.
- `https://charlestonhacks.com/` loads without mixed-content, routing, asset, console, or service-worker errors.
- A hard reload and a fresh/private browsing session both load the promoted version.
- The project originator sees **Remove** for a non-originator member in a project's People tab; a permitted removal succeeds; the originator is never offered as a removal target.
- Member self-removal and ordinary project/member behavior remain intact.
- The custom domain and HTTPS status remain correct in **Settings → Pages**.

## Rollback

For an application rollback while retaining the Actions topology, manually run the workflow with the last known-good Innovation Engine commit SHA.

For the legacy-site rollback, change **Settings → Pages → Build and deployment → Source** to **Deploy from a branch**, select `main` and `/ (root)`, and save. The publisher `main` branch and its HarborHack/public-site files remain untouched specifically to preserve this option. Confirm the Pages deployment completes and verify `https://charlestonhacks.com/` afterward.

Changing the Pages source does not require a DNS change. Do not alter the production Supabase policy as part of a Pages promotion.
