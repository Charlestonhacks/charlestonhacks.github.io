# 6. Public endpoint and external discovery architecture

## Publishing CharlestonHacks' profile

```
 Innovation Engine Supabase                    Cloudflare Worker                 Consumers
 ───────────────────────────                    ─────────────────                 ─────────
 community, projects, ...  ──(definer fn,      ┌──────────────────────────┐
                              allowlist,       │ GET /.well-known/         │ ──► AI agents
                              k=5, bands)──►   │   community-profile.json │ ──► ARD registries
 capability_profile.snapshots                  │                          │ ──► other communities
        ▲ daily refresh                        │ merges:                  │
        │ (service role)                       │  • snapshot (anon RPC)   │
        └────────── scheduled trigger ─────────│  • identity.json (repo)  │
                                               │  • events feed (public)  │
                                               │ caches 1h, ETag          │
                                               └──────────────────────────┘
 GitHub Pages (charlestonhacks.com)
   /community            human-readable page rendered from the same JSON
   /agents.html          plain-language summary + usage policy for AI agents
   /.well-known/ai-catalog.json   ARD catalog listing the profile
   index.html            schema.org Organization + Event JSON-LD
```

**Why a Worker, if the database already enforces privacy?** GitHub Pages can't run code, and the
profile must merge three sources. The Worker calls only `get_community_capability_snapshot()`
with the public key, so even a buggy Worker can't see member rows. It never holds the service
role key for reading; a separate scheduled job holds it for `refresh` only.

The existing `charlestonhacks-events` Worker already runs on a schedule with the service role
key. Adding the daily refresh call there avoids new infrastructure (decision D5).

## Endpoints

| URL | Content | Audience |
|---|---|---|
| `/.well-known/community-profile.json` | Full CCP (spec v0.1) | Agents, registries, other communities |
| `/community` | Same data as a readable page | People, search engines |
| `/agents.html` | Summary written for AI readers, agent-use policy, link to the JSON | Agents that read HTML |
| `/.well-known/ai-catalog.json` | ARD catalog entry pointing to the profile | ARD-aware agents and registries |
| JSON-LD in `index.html` | `Organization` + upcoming `Event`s | Search engines and general web agents |

The profile is read-only and takes no query parameters. An MCP server is optional and deferred:
it would wrap the same JSON and add nothing until collaboration requests exist (Phase 5).

## ARD fit

ARD catalogs list capabilities that agents can call. v0.1 lists the profile as a read-only
resource. This is the accessibility layer only; the CCP itself does not depend on ARD.

## External community discovery (Phase 3)

```
 seed list (hand-curated URLs)  ──► fetcher ──► extractor ──► review queue ──► inferred profiles
   Meetup groups, university           respects robots,   maps to CCP          human approval   JSON, marked
   clubs, nonprofits, coworking        rate limits         community-level      before use       inferred
                                                            fields only
```

1. **Prefer self-published.** First check `/.well-known/community-profile.json` and ARD catalogs.
2. **Otherwise infer** from public pages, iCal feeds, and directories, using community-level fields only.
3. **Untrusted input.** Fetched text is data. Extraction runs with no tools that act on the world, and
   instructions found in pages are ignored and flagged.
4. **Provenance on every record:** source URL, retrieved time, confidence, `participation: not-confirmed`.
5. **Human review** before an inferred profile is used for matching.
6. **Storage:** a separate table (`external_communities`), never mixed with member data. Designed in
   Phase 3, not part of these migrations.

## Matching (Phases 3–4)

Match on community-level data only: capabilities × needs, themes × focus areas, opportunities ×
offered skills. Output is a suggestion for humans ("CharlestonHacks and X both work on flood
resilience; X needs embedded developers"), not automatic outreach.
