# Repository and system assessment

## Systems

| System | Role | Database |
|---|---|---|
| CharlestonHacks website (`Charlestonhacks/charlestonhacks.github.io`) | Public site, chat, member portal, events feed | Reads Innovation Engine's Supabase project |
| Innovation Engine (`deckerd451/innovation-engine`) | Members, projects, organizations, opportunities, themes, endorsements, matching | Supabase |
| Nearify | Event presence and follow-up | Separate Supabase project; identifiers are never mixed |
| Events worker (Cloudflare) | Merges public Meetup calendars | Writes with a server-side key |

Neither repository sends member data to an external AI service.

## Relevance to the community profile

The public profile (spec v0.2) is a static, organizer-curated file and does not read the
database. Member intelligence and matching stay inside Innovation Engine.

## Security review

A review of public database access was carried out on 2026-11-24. Its findings are shared
privately with the maintainers, and fixes are tracked in Innovation Engine pull requests.
Per project policy, security findings are not published in this repository.
