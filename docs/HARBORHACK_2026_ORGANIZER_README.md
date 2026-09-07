# HarborHack 2026 Organizer README

HarborHack 2026 lives at `/harborhack-2026` and is intentionally a static, additive participant experience inside the CharlestonHacks website.

## Update event content

Edit `assets/js/harborhack/config.js`. Frequently changing values must be changed there, not inside `harborhack-2026/index.html`.

Required organizer review before publication:

- Dates: `eventStartDate`, `eventEndDate`, and `submissionDeadline` using ISO date strings.
- Venue: `venueName`, `venueBuilding`, `venueRoom`, `venueAddress`, and `venueMapUrl`.
- Contacts: `codeOfConductReportingContact`. Do not publish rules or reporting language until organizers and appropriate legal counsel approve it.
- Logistics: `teamSizeMin`, `teamSizeMax`, `presentationDurationMinutes`, and `judgeQAMinutes`.
- Schedule: add objects to `schedule` with `date`, `startTime`, `endTime`, `title`, `location`, `category`, `description`, `url`, and `recommendedFor`.
- Resources: add only confirmed URLs to `resources` with `title`, `description`, `category`, `url`, `skillLevel`, `operatingSystem`, `status`, and optional `sponsorAttribution`.

## Placeholders

Add only confirmed information. Keep unavailable actions out of the page rather than displaying disabled controls or placeholder destinations.

## Local preview

From the repository root, run:

```bash
python3 -m http.server 8000
```

Then open:

- `http://localhost:8000/`
- `http://localhost:8000/harborhack-2026/`

## Deployment

This repository is a static GitHub Pages site. Merge the feature branch into the configured publishing branch after review; GitHub Pages will serve `/harborhack-2026/` as a static directory route.
