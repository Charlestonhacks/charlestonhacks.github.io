# Homepage events and deployment

## Files and local development

The site is static: run `python3 -m http.server 8000` from the checkout. The homepage loads `assets/css/events.css` first and the versioned `assets/css/homepage.css` afterward. Preserve that order: homepage overrides depend on it. CSS asset URLs resolve relative to the stylesheet, not the HTML. Use `/images/background.jpg` for the homepage background. Bump the stylesheet query version when changing its contents.

`assets/js/events-core.js` owns feed loading, normalization, selection, and retries. `assets/js/homepage-events.js` renders the homepage. `pulse-metrics.js` shares the feed loader. Keep visual edits separate from event-rule changes.

## Sources and status

Sources are tried in order:

1. `https://charlestonhacks-events.dmhamilton1.workers.dev` (8-second timeout).
2. `/assets/data/events.json` (4-second timeout), a static snapshot, not an automatically refreshed replica.

Only a complete authoritative response establishes an empty calendar. HTTP 200 may still contain an error or failed calendars: the loader inspects `error` and `sourceResults`. A calendar that parsed events but failed its database sync can still deliver usable data. A static fallback with no active events is skipped.

Results are `ok`, `partial`, or `unavailable`. The UI distinguishes unavailable data from no scheduled events and displays a note for partial data. The retired ChuckTown scraper is not a source.

## Dates and selection

- All display and zone-less timestamps use `America/New_York`. Timestamp aliases are handled in `normalizeEvent`.
- A valid supplied end time wins. Otherwise timed events last two hours and all-day events last 24 hours. These are estimates, not confirmed schedules.
- Active events have an end strictly after now. Duplicates are removed by event identity; the timeline sorts by start date.
- Feature the next CharlestonHacks event starting within 45 days. Otherwise feature the next community event; if none exists, use the remaining first event (including a later CharlestonHacks event).
- CharlestonHacks classification uses the event link, title, and source. The featured event is excluded from the remaining list. Despite its “Community Events” heading, that list can also contain other CharlestonHacks events; this is the current implementation.
- Upcoming card summaries are presentation text; source descriptions and destinations are not rewritten. Links identify Meetup or the destination host.

## Seven-day recent-event behavior

Select the most recently ended CharlestonHacks event available in the feed. It qualifies from its end time up to, but excluding, `end + 7 × 24 hours`. The inferred two-hour/24-hour end affects this window when a real end is missing. If the feed omits completed events, the frontend cannot reconstruct their history.

While an event qualifies, show “Last CharlestonHacks Event” and its card. Otherwise show the catalog link “Upcoming events and past recaps →” to `/Poster.html`; the repeated visible section heading is hidden. The block sits between the featured event and Community Events.

An open tab reevaluates once per minute, so the visible transition can occur up to roughly a minute after the exact boundary. This does not change the underlying eligibility rule.

## Retry behavior

Requests are shared. Only an explicit retry replaces a settled unavailable response. Four jittered retries occur after approximately 15 seconds, 1 minute, 4 minutes, and 16 minutes. Partial feeds are not retried automatically. Due retries pause while the tab is hidden or offline without spending the attempt. Return/reconnect handlers resume them; after exhaustion they permit another attempt subject to the 15-minute cooldown. A tab that stays visible and online after exhaustion needs a reload or a return/reconnect event. Do not add polling as part of style maintenance.

## Validation

From the checkout:

```sh
node tests/homepage-events.test.mjs
python3 scripts/check_media_manifest.py
python3 -m unittest discover -s tests -p 'test_media_manifest.py'
```

For stylesheet changes compare before/after at phone, intermediate navigation widths, and desktop with identical data, clock, and fonts. Check both recent/catalog states, menu opening/closing, background requests, and no-JavaScript rendering. Test newsletter styling without submitting a real subscription. Keep element-level styles and JavaScript's runtime `element.style` changes intact unless separately requested.

## Publishing and recovery

The observed homepage publishing setup builds from this repository's `main` branch and root directory. Confirm current Pages settings if changing deployment; a local workflow file is not proof of live configuration.

**Do not use `.github/workflows/deploy-innovation-engine-pages.yml` for routine homepage publishing.** It is a separate, manually dispatched workflow that checks out a specified `deckerd451/innovation-engine` release. It is not the branch-source homepage build.

A merge, a successful build/upload, a successful deployment, and verified live content are distinct results. Publish only when authorized. Avoid overlapping merges/deployments because later publishing can cancel earlier work.

After deployment:

1. Confirm the latest intended commit's Pages deployment succeeded, not merely its build.
2. Verify the live HTML and versioned stylesheet return the expected content (the CSS must have a CSS content type). Check the stylesheet URL and background image, then desktop/mobile layout and links.
3. Allow for cached old HTML/assets; prior responses used a 10-minute cache lifetime. Compare plain and cache-busted requests when diagnosing, without treating a cache-busted result alone as the normal visitor experience.

If `deployment_queued` or `syncing_files` persists until timeout, do not infer an application defect. Previous stalls occurred even when identical code later deployed normally, but their root cause was not confirmed.

- Confirm what version is actually live; previous failures left the earlier site serving.
- Record commit, run/deployment IDs, final logs, artifact size, and active/queued runs. Check GitHub Status.
- Do not revert application code, increase timeouts, or change Pages settings without evidence.
- Report the failure before retrying. With explicit authorization and no active deployment, make one controlled retry for latest main and monitor it.
- If failure recurs, stop repeated retries and prepare GitHub Support evidence. Closing a local terminal does not stop the GitHub deployment, but can stop local monitoring. Read current remote state before resuming.
