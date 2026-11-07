# Retired dashboard stylesheets

These stylesheets were removed after auditing main at `0636116d`:

| Path | Bytes |
|---|---:|
| `dashboard.css` | 44,642 |
| `assets/css/dashboard.css` | 11,123 |
| `assets/css/connections.css` | 15,266 |
| `assets/css/messaging.css` | 16,766 |
| `assets/css/overlays.css` | 7,647 |
| `assets/css/quiet-mode.css` | 5,790 |
| `assets/css/synapse-progressive-disclosure.css` | 12,671 |
| `assets/css/eventsOverlayFix.css` | 261 |

Total: 114,166 bytes (about 111.5 KiB). The purpose is reducing obsolete maintenance surface, not promising a measurable deployment speedup.

No HTML stylesheet link, CSS import, or JavaScript loader referenced these files. Remaining named references were historical integration guides, comments within the files, and an outdated comment in `dashboardPane.js`. The former `dashboard.html` redirects to the separately hosted Buildspace app. This cleanup does not retire additional JavaScript, public routes, media, or Sass sources.

The old integration guides remain for historical context. Do not restore their stylesheet links as current setup instructions. Repository inspection cannot establish whether external sites or bookmarks use these CSS URLs directly; deletion intentionally retires those unlinked public URLs.

## Recovery

The originals remain in Git history. From a clean working tree, restore an individual file for review with:

```sh
git restore --source=0636116d -- assets/css/messaging.css
```

Substitute any path from the table. Do not restore all dashboard styles into the live cascade without checking the actual consuming page and testing it.

## Styles retained

Keep `homepage.css`, shared `events.css`, hub `portal.css`, legacy event `main.css`/`noscript.css`, the Font Awesome stylesheet imported by `main.css`, the organization styles, archive styles, UI showcase styles, and the distinct Hacker Theater stylesheet. These still have consumers. No shared rules were merged, and no selectors were purged from active stylesheets.
