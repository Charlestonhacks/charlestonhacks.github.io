# Testing community discovery with external AI agents

How to check what AI assistants learn about CharlestonHacks from public
sources, without giving any of them access to Innovation Engine.

## Boundaries

- Use only public URLs: the website, the profile and the schema.
- Never paste Innovation Engine data, member lists, exports or database output
  into an assistant.
- Never give an assistant an Innovation Engine login, API key or database
  credentials.
- Use assistants' normal public modes (web search or browsing). Nothing needs
  to be installed or connected.

## 1. Direct reading (works immediately)

Give the assistant the profile URL and ask it to read it:

> Read https://charlestonhacks.com/.well-known/community-profile.json and tell
> me what CharlestonHacks does, what it needs, and how an organization could
> get involved.

Expected: an accurate summary of the offers, needs and contact route
(hello@charlestonhacks.com), with past activities described as past.

## 2. Unprompted discovery (takes days to weeks)

Ask without giving any URL, after search engines have re-crawled the site:

> What is CharlestonHacks, and how could my company sponsor or partner with it?
> Who should I contact?

> Which communities in South Carolina run hackathons and are looking for
> mentors or judges?

## What to check

| Check | Pass |
|---|---|
| Facts match the profile | Yes, or clearly from other public pages |
| Contact route | hello@charlestonhacks.com or the website, not a person |
| No individuals | The answer does not name members or suggest contacting individuals |
| No invented commitments | Past collaborators are not described as current partners |
| No member statistics | No member counts or demographics attributed to the profile |

Run the same questions in two or three different assistants, and record the
date, assistant and a pass/fail per check. Repeat after each profile update.

## If something is wrong

- Wrong facts that come from the profile: correct the profile and update
  `updatedAt`.
- Wrong facts from elsewhere: correct the source page if it is ours; otherwise
  note it. The profile cannot control other sites.
- An assistant names individuals: check whether the name comes from a public
  page of ours (for example a board list). The profile itself never contains
  names.
