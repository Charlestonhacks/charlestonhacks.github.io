/**
 * CharlestonHacks Events Worker
 * Deploy to: Cloudflare Workers (dmhamilton1.workers.dev)
 * Suggested name: charlestonhacks-events
 *
 * Fetches the public Meetup iCal feed — no API key required.
 * Returns JSON matching the shape the frontend already expects:
 *   { events: [{ title, link, startDate, description, location }] }
 */

const ICAL_URL = 'https://www.meetup.com/charlestonhacks/events/ical/';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

addEventListener('fetch', event => {
  event.respondWith(handle(event.request));
});

async function handle(request) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const res = await fetch(ICAL_URL, {
      headers: { 'User-Agent': 'CharlestonHacks-Events-Worker/2.0' },
      cf: { cacheTtl: 3600, cacheEverything: true }, // cache at Cloudflare edge for 1 hour
    });

    if (!res.ok) throw new Error(`Meetup returned ${res.status}`);

    const ical = await res.text();
    const events = parseICal(ical);

    return new Response(JSON.stringify({ events }), {
      headers: { ...CORS, 'Content-Type': 'application/json', 'Cache-Control': 'public, max-age=3600' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ events: [], error: err.message }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}

// ── iCal parser ────────────────────────────────────────────────────────────

function parseICal(text) {
  const events = [];

  // Unfold long lines (iCal wraps at 75 chars with CRLF + space/tab)
  text = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');

  const blocks = text.split('BEGIN:VEVENT').slice(1);

  for (const block of blocks) {
    const content = block.substring(0, block.indexOf('END:VEVENT'));

    const get = key => {
      const m = content.match(new RegExp(`(?:^|\\n)${key}(?:;[^:]*)?:([^\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const summary     = unescape(get('SUMMARY'));
    const dtstart     = get('DTSTART');
    const url         = get('URL');
    const description = unescape(get('DESCRIPTION')).substring(0, 200);
    const location    = unescape(get('LOCATION'));

    if (!summary || !dtstart) continue;

    const startDate = parseDate(dtstart);
    if (!startDate) continue;

    events.push({ title: summary, link: url, startDate: startDate.toISOString(), description, location });
  }

  events.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return events;
}

function parseDate(str) {
  try {
    // YYYYMMDDTHHMMSSZ  or  YYYYMMDDTHHMMSS  or  YYYYMMDD
    const d = str.replace(/[^0-9TZ]/g, '');
    if (d.includes('T')) {
      const y = d.slice(0,4), mo = d.slice(4,6), day = d.slice(6,8);
      const h = d.slice(9,11), mi = d.slice(11,13), s = d.slice(13,15);
      const utc = str.endsWith('Z') ? 'Z' : '';
      return new Date(`${y}-${mo}-${day}T${h}:${mi}:${s}${utc}`);
    }
    return new Date(`${d.slice(0,4)}-${d.slice(4,6)}-${d.slice(6,8)}`);
  } catch { return null; }
}

function unescape(str) {
  return str
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, ' ')
    .replace(/\\\\/g, '\\');
}
