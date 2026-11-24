# Repository and database assessment (revised 2026-11-24)

Sources, in order of confidence:

- **Live (anonymous):** requests made with the website's public key, one row and the `id` column only,
  plus zero-row (`limit=0`) requests to check which columns are exposed without reading data.
  This shows what any visitor can read today. It cannot show policy definitions.
- **Repo:** Innovation Engine's schema dump (`supabase/sql/reference/buildspace_schema.sql`,
  committed 2026-11-22) and migrations. The dump is older than some applied migrations (see below).

## Systems

| System | Role | Database |
|---|---|---|
| CharlestonHacks website (`Charlestonhacks/charlestonhacks.github.io`) | Public site, chat, member portal, events feed | Reads Innovation Engine Supabase |
| Innovation Engine, formerly Buildspace (`deckerd451/innovation-engine`) | Members, projects, organizations, opportunities, themes, endorsements, matching | Supabase `mqbsjlgnsirqsmfnreqd` |
| Nearify | Event presence and follow-up | Separate Supabase project; IDs never mixed |
| Events worker (Cloudflare) | Merges public Meetup calendars | Writes with the service role key |

No code in either repository sends member data to an external AI service (searched for OpenAI,
Anthropic, Google Gemini, Groq, OpenRouter, Mistral, Hugging Face and Replicate endpoints).

## What a signed-out visitor can read

| Data | Live | Notes |
|---|---|---|
| Member profiles (`community`) | **No** | Email has no grant to anyone |
| `opportunities` | **No** | |
| Chat history (`bbs_messages`), presence, online lists | **No** | Closed by Innovation Engine migration `20261115d` (appears applied) |
| Most database functions (e.g. `get_pulse_metrics`) | **No** | Closed by `20261115c` (appears applied) |
| `theme_participants` | **No rows** | Repo still shows a public policy; live returns nothing |
| `endorsements` | **Yes** | Who endorsed whom, for which skill |
| `project_members` | **Yes** | Who works on which project |
| `projects` | **Yes** | Includes `creator_id`, `budget`, `timeline`, `description` (column check) |
| `organization_members` | **Yes** | Includes `title`, `bio`, `role`, permissions (column check); `allow_select USING (true)` overrides the narrower rules and also exposes pending requests |
| `organization_followers` | **Yes** | Who follows which organization |
| `team_members` | **Yes** | Sign-in account ids, community ids, join messages |
| `zork_saves` | **Yes, read and write** | Any visitor can read, overwrite or delete any guest's game save (guest names, not member data) |
| `organizations`, `theme_circles` | Yes | Organization-level information; intended |

Fix for everything above except `zork_saves`:
[Innovation Engine PR #362](https://github.com/deckerd451/innovation-engine/pull/362) (draft, not applied).

## Other public tables to classify (repo only, not yet checked live)

The dump shows public read rules on member-generated content whose intent is unclear:
`ideas`, `idea_comments`, `idea_upvotes`, `project_comments`, `project_upvotes`, `signals`,
`theme_actions`, `swag_votes`, `zork_events`, `cynq_cards`. `project_comments` and `signals`
returned no rows live. Each needs an owner decision: intentionally public, or signed-in only.

## Consequences of applied migrations for the website

Because `20261115d` restricted chat history to signed-in members, logged-out visitors to the
website's chat see an empty history. That is consistent with the privacy goals and needs no change.
