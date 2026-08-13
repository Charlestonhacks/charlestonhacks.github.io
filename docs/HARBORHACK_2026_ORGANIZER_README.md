# HarborHack 2026 Organizer README

HarborHack 2026 lives at `/harborhack-2026` and is intentionally a static, additive participant experience inside the CharlestonHacks website.

## Update event content

Edit `assets/js/harborhack/config.js`. Frequently changing values must be changed there, not inside `harborhack-2026/index.html`.

Required organizer review before publication:

- Dates: `eventStartDate`, `eventEndDate`, `registrationOpeningDate`, `registrationClosingDate`, `submissionDeadline` using ISO date strings.
- Venue: `venueName`, `venueAddress`, `venueNotes`.
- Links: `registrationUrl`, `devpostUrl`, `participantDiscordUrl`, `githubResourceUrl`, `mentorHelpUrl`.
- Contacts: `codeOfConductReportingContact`. Do not publish rules or reporting language until organizers and appropriate legal counsel approve it.
- Logistics: `teamSizeMin`, `teamSizeMax`, `presentationDurationMinutes`, `judgeQAMinutes`, `eventStatus`, `timezone`.
- Schedule: add objects to `schedule` with `date`, `startTime`, `endTime`, `title`, `location`, `category`, `description`, `url`, and `recommendedFor`.
- Resources: add only confirmed URLs to `resources` with `title`, `description`, `category`, `url`, `skillLevel`, `operatingSystem`, `status`, and optional `sponsorAttribution`.
- Sponsors: add sponsor names only after they are confirmed.

## Placeholders

Leave unknown information blank or use explicit placeholders such as `Registration link coming soon`, `Schedule to be announced`, and `Venue details coming soon`. The interface is designed to show polished empty states.

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
