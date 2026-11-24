# Publishing a Community Capability Profile for your community

A Community Capability Profile is one public JSON file that describes your
community as an organization: who you are, what you do, what you need and how
to reach you. AI assistants, search engines and other communities can read it
without an account, an API key or any particular AI provider.

You do not need Innovation Engine, CharlestonHacks' permission, a database or a
server. Any website that can host a static file works.

## Ground rules

- Describe the organization, never individuals. No member names, skills,
  availability, relationships or participation.
- No member-derived statistics, including aggregated or anonymized counts
  ("1,000 members", "60% students").
- Only publish what organizers approve. Every claim should be something you
  would put on your public website.
- Name a partner only if that organization agreed to be listed, and describe
  the relationship accurately (for example "co-hosted an event in 2025").
- Use an organizational contact address (hello@, info@), never a personal one.

## Steps

1. **Copy the example.** Start from
   [`examples/charlestonhacks.draft.json`](examples/charlestonhacks.draft.json)
   and replace every value with your own. Delete any section you do not need;
   only `specVersion`, `id`, `updatedAt`, `assertion`, `identity` and
   `accessibility` are required.
2. **Fill in the essentials.**
   - `id`: the URL where the file will live.
   - `assertion`: `{"type": "self-published", "publisher": "https://your-site"}`.
   - `identity`: name, website and a one or two sentence summary.
   - `accessibility`: your website, how to join, and an organizational contact.
3. **Add what makes you findable.** `focusAreas`, `offers` (each with
   `evidence` links to public event pages or recaps), `needs`, `openTo` and
   recurring `activities`. Mark past activities as past in their description.
4. **Validate.** Check the file against the schema at
   `https://charlestonhacks.com/schemas/community-capability-profile/v0.2.json`
   with any JSON Schema (2020-12) validator, for example:
   `npx ajv-cli validate --spec=draft2020 -c ajv-formats -s v0.2.json -d community-profile.json`
5. **Publish** the file at
   `https://your-site/.well-known/community-profile.json`.
   - GitHub Pages skips folders that start with a dot; add a `_config.yml`
     containing `include: [".well-known"]`.
   - Other static hosts usually need nothing extra.
6. **Make it discoverable** (all optional, all standard):
   - In your home page `<head>`:
     `<link rel="alternate" type="application/json" href="/.well-known/community-profile.json">`
   - Add the URL to your `sitemap.xml`.
   - Optionally add schema.org Organization JSON-LD with a `subjectOf` link to
     the profile (see `index.html` on charlestonhacks.com).
7. **Keep it current.** Update `updatedAt` whenever you change it, and review
   it at least once a year.

## Check it

- The URL opens in a private browser window with no sign-in.
- `curl -sI https://your-site/.well-known/community-profile.json` shows
  `200` and `content-type: application/json`.
- The file validates against the schema.
- Search the file for names, percentages and counts before publishing.

## What this does not do

Publishing a profile does not sign you up to anything, share member data, or
let anyone contact your members. Collaboration requests go to the contact you
choose, and your organizers decide what to do with them.
