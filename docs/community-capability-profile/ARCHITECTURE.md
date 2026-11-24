# Architecture (revised)

```
 Organizers ──(pull request review)──► charlestonhacks.com (GitHub Pages)
                                          /.well-known/community-profile.json   ← static, curated
                                          index.html  <link rel="alternate" …>  ← discovery hint
                                                         │
 Public sources already published:                       │ read by
   Meetup iCal feed, HarborHack archive, home page ──────┤ people, AI agents,
                                                         │ other communities
 Innovation Engine (signed-in only) ─── never feeds the public profile
   members, skills, endorsements, matching, relationships
```

- **No database access** for the public profile. Nothing member-derived can reach it.
- **Events:** the profile links to the public Meetup iCal feed and the existing events Worker
  (already public data). The Worker needs no changes for the pilot (D5: reused as the public
  events source; it gains no new database permissions).
- **GitHub Pages:** dot-folders like `/.well-known/` are ignored by Jekyll unless included, so the
  pilot adds a minimal `_config.yml` (`include: [".well-known"]`) or `.nojekyll`. Needs a preview
  check, since it changes how the site is built.
- **Agents:** the home page gets a `<link rel="alternate" type="application/json">` pointing to the
  profile. An ARD `ai-catalog.json` entry and an `/agents.html` page are optional later steps.

## Later phases (design only)

- **Collaboration requests (Phase 5):** an outside request reaches CharlestonHacks as an organization
  (form or email today). Inside Innovation Engine it can be shown to members who opt to browse
  requests. Members decide whether to respond. Nothing about members goes back out unless a member
  sends it themselves.
- **Other communities (Phases 3–4):** read their self-published profiles; inferred profiles only from
  public community-level information, marked `inferred` and `participation: not-confirmed`. Fetched
  text is treated as data, never instructions.
