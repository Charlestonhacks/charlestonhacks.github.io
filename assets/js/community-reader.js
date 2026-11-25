// Community profile reader: loads public Community Capability Profiles and
// suggests where one community's needs fit another's offers.
// Public data only. No accounts, no servers, no Innovation Engine access.

// Profiles shown by default. Add a community here only after it publishes
// its own profile.
export const PROFILE_URLS = [
  'https://charlestonhacks.com/.well-known/community-profile.json',
];

// Words that suggest an offer can meet a need of a given kind.
const KIND_HINTS = {
  venue: ['venue', 'host', 'hosted', 'hosts', 'space', 'campus'],
  sponsor: ['sponsor', 'sponsors', 'sponsorship', 'funding'],
  mentor: ['mentor', 'mentors', 'judge', 'judges', 'expert', 'experts', 'coaching'],
  partner: ['partner', 'partners', 'co-host', 'co-hosting', 'cohost', 'collaborat', 'challenge'],
  volunteer: ['volunteer', 'volunteers'],
  funding: ['fund', 'funding', 'grant', 'invest', 'investment'],
  other: [],
};

const STOP = new Set(('the and for with from that this your our their into over about across '
  + 'free community communities events event other local group groups charleston south carolina '
  + 'tech technology annual monthly every year more such well').split(' '));

export function words(text) {
  return (String(text || '').toLowerCase().match(/[a-z][a-z-]{3,}/g) || [])
    .filter((w) => !STOP.has(w));
}

function stem(w) { return w.replace(/(ings|ing|ers|er|es|s)$/, ''); }

// Minimal shape check; the full schema is published separately.
export function checkProfile(p) {
  if (!p || typeof p !== 'object') return 'Not a JSON object';
  if (!/^0\.2\.\d+$/.test(p.specVersion || '')) return 'Not a v0.2 community profile';
  if (!p.identity || !p.identity.name) return 'Missing identity.name';
  return null;
}

// What a community offers, as text snippets with a label for display.
// "Open to" entries are collaboration interests, so they only count for
// partnership needs (a community "open to sponsorship" wants sponsors).
function offerTexts(p, needKind) {
  const out = [];
  for (const o of p.offers || []) out.push({ label: o.label, text: `${o.label} ${o.description || ''}` });
  if (needKind === 'partner') for (const t of p.openTo || []) out.push({ label: `Open to: ${t}`, text: t });
  return out;
}

// Hint words for a need: its declared kind plus any kind named in its text
// (for example a "partner" need that asks for venues).
function hintsFor(need) {
  const hints = new Set(KIND_HINTS[need.kind] || []);
  const text = String(need.description || '').toLowerCase();
  for (const [kind, list] of Object.entries(KIND_HINTS)) {
    if (kind !== 'other' && text.includes(kind)) list.forEach((h) => hints.add(h));
  }
  return [...hints];
}

// Suggest matches from `seeker`'s needs to `provider`'s offers.
// Returns [{ need, offer, reasons[] }]. Suggestions only: organizers decide.
export function suggestMatches(seeker, provider) {
  if (!seeker || !provider || seeker === provider) return [];
  const results = [];
  for (const need of seeker.needs || []) {
    const hints = hintsFor(need);
    const needStems = new Set(words(need.description).map(stem));
    for (const offer of offerTexts(provider, need.kind)) {
      const offerWords = words(offer.text);
      const hinted = new Set(offerWords.filter((w) => hints.some((h) => w.startsWith(h))));
      const shared = new Set(offerWords.filter((w) => needStems.has(stem(w))));
      const sharedRoots = new Set([...shared].map(stem));
      if (hinted.size || sharedRoots.size >= 2) {
        results.push({ need, offer: offer.label, reasons: [...new Set([...hinted, ...shared])].slice(0, 4) });
      }
    }
  }
  return results;
}

export function safeHttpsUrl(u) {
  try { const url = new URL(u); return url.protocol === 'https:' ? url.href : null; } catch { return null; }
}

export async function loadProfile(url, fetchImpl = fetch) {
  const res = await fetchImpl(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const p = await res.json();
  const problem = checkProfile(p);
  if (problem) throw new Error(problem);
  return p;
}
