# Direction: an open network of communities

The profile is the first, smallest piece of a larger goal: an open,
provider-independent connective layer between independent communities and AI
agents. This note records how v0.2 supports that direction. None of the future
capabilities below are implemented.

Guiding principle: **make the community visible, keep the individuals
protected, let Innovation Engine broker the connection.**

## How v0.2 already supports it

| Future capability | What v0.2 provides today |
|---|---|
| Bidirectional discovery between communities | Any community can publish the same file at the same well-known path; no registry or membership is needed. |
| Discovery of communities that have not adopted the spec | `assertion.type: "inferred"` lets a third party describe a community from its public website, with `sources`, `confidence` and `participation: "not-confirmed"` required by the schema. |
| Self-published vs inferred information | `assertion` separates the two. A self-published profile always wins over an inferred one. |
| Provenance, freshness, uncertainty | `updatedAt`, `sources[].retrievedAt`, `confidence`, and `evidence` links on each offer. |
| Complementary capabilities and needs | `offers`, `needs` (with a fixed `kind` vocabulary) and `openTo` can be matched across profiles. |
| Human-approved introductions | `accessibility.collaborationRequests` and `contact` route requests to organizers; nothing reaches individuals. |
| Private matching inside Innovation Engine | Out of scope for the public file by design. Member data never enters a profile; matching, if any, happens inside Innovation Engine with members choosing whether to take part. |
| Optional agent-protocol adapters (MCP, ARD, others) | `endpoints[].type` already allows `ard-catalog`; an adapter can read the static file. No protocol is required to consume it. |

Communities stay independent: a profile works without Innovation Engine, and no
community has to adopt Innovation Engine to be discoverable or to discover
others.

## Not yet (deliberately)

- A crawler or index of profiles.
- A collaboration request form or API.
- Any matching across communities.
- Any agent protocol server.

Each of these should be added only when there is a concrete need, as an
optional layer that reads the same static files.

## Future schema considerations (not in v0.2)

These could become explicit fields in a later, backwards-compatible version.
Today they are stated in the spec text and enforced by what the schema allows.

- **Scope:** a field stating that capabilities are organizational, not
  individual.
- **No public member discovery:** an explicit statement that the community's
  members cannot be looked up or contacted through the profile.
- **No automated outreach:** a policy agents should honour (for example, no
  bulk or unsolicited automated messages).
- **Human approval:** a statement that introductions and collaboration require
  organizer approval.
- **No implied availability or consent:** listing an offer, need or past
  collaborator does not mean any individual is available or has agreed to
  anything.

`accessibility.agentPolicy` (a URL) already exists in v0.2 and could point to a
human-readable page stating these rules before they become structured fields.
