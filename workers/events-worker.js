/***
 * Nearify Events Worker
 * Fetches curated iCal event sources, syncs to Supabase external_events,
 * auto-matches to Nearify events, and exposes a public JSON endpoint.
 * Supports scheduled sync. Cloudflare Workers module syntax.
 */

const SOURCES = [
  {
    source: 'meetup_charlestonhacks',
    label: 'CharlestonHacks Meetup',
    type: 'ical',
    url: 'https://www.meetup.com/charlestonhacks/events/ical/',
    joinSource: 'meetup',
  },
  {
    source: 'meetup_charleston_aws',
    label: 'Charleston AWS Meetup',
    type: 'ical',
    url: 'https://www.meetup.com/chs-amazon-web-services/events/ical/',
    joinSource: 'meetup',
  },
  {
    source: 'meetup_techyeet',
    label: 'TechYeet',
    type: 'ical',
    url: 'https://www.meetup.com/techyeet/events/ical/',
    joinSource: 'meetup',
    // TechYeet is multi-city. Only import Charleston-relevant events for now.
    includeKeywords: ['charleston'],
  },
  {
    source: 'meetup_first_friday_charleston',
    label: 'First Friday Charleston Networking',
    type: 'ical',
    url: 'https://www.meetup.com/first-friday-charleston-professional-networking-happy-hour/events/ical/',
    joinSource: 'meetup',
  },
  {
    source: 'meetup_chsinfosec',
    label: 'Charleston InfoSec',
    type: 'ical',
    url: 'https://www.meetup.com/chsinfosec/events/ical/',
    joinSource: 'meetup',
  },
  // Add additional iCal sources here when ready:
  // {
  //   source: 'meetup_example',
  //   label: 'Example Meetup',
  //   type: 'ical',
  //   url: 'https://www.meetup.com/example-group/events/ical/',
  //   joinSource: 'meetup',
  //   includeKeywords: ['charleston'],
  // },
];

const NEARIFY_BASE_URL = 'https://nearify.org';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export default {
  async fetch(request, env) {
    return handle(request, env);
  },
  async scheduled(event, env, ctx) {
    ctx.waitUntil(runScheduledSync(env));
  },
};

async function handle(request, env) {
  if (request.method === 'OPTIONS') {
    return new Response(null, { headers: CORS });
  }

  try {
    const { allEvents, sourceResults } = await fetchAndSyncAllSources(env);
    const syncResult = aggregateSyncResult(sourceResults);
    const allMatchDetails = sourceResults.flatMap(r => r.matchResults?.details || []);
    const eventsWithLinks = attachNearifyJoinLinks(allEvents, allMatchDetails);
    const publicEvents = eventsWithLinks.map(({ _sourceKey, ...e }) => e);
    const publicSourceResults = sourceResults.map(({ events: _events, ...rest }) => rest);

    return new Response(
      JSON.stringify({
        events: publicEvents,
        syncResult,
        sourceResults: publicSourceResults,
      }),
      {
        headers: {
          ...CORS,
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
        },
      }
    );
  } catch (err) {
    return new Response(JSON.stringify({ events: [], error: err.message }), {
      status: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
    });
  }
}

async function runScheduledSync(env) {
  const { sourceResults } = await fetchAndSyncAllSources(env);
  const syncResult = aggregateSyncResult(sourceResults);

  for (const result of sourceResults) {
    if (result.ok) {
      console.log(`[ScheduledSync] ${result.source}`, {
        parsed: result.parsed,
        filteredOut: result.filteredOut ?? 0,
        synced: result.synced ?? 0,
        matched: result.matched ?? 0,
        unmatched: result.unmatched ?? 0,
      });
    } else {
      console.error(`[ScheduledSync] ${result.source} failed:`, result.error);
    }
  }

  console.log('[ScheduledSync] Aggregate', {
    sources: sourceResults.length,
    synced: syncResult.synced,
    matched: syncResult.matched,
    unmatched: syncResult.unmatched,
    ok: syncResult.ok,
  });
}

async function fetchAndSyncAllSources(env) {
  const allEvents = [];
  const sourceResults = [];

  for (const sourceDef of SOURCES) {
    const result = await fetchAndSyncSource(sourceDef, env);
    sourceResults.push(result);
    if (Array.isArray(result.events)) {
      allEvents.push(...result.events);
    }
  }

  return { allEvents, sourceResults };
}

async function fetchAndSyncSource(sourceDef, env) {
  try {
    const { events, parsedBeforeFilter, filteredOut } = await fetchICalSource(sourceDef);
    const syncResult = await syncEventsToSupabase(events, sourceDef.source, env);

    return {
      source: sourceDef.source,
      label: sourceDef.label,
      parsed: events.length,
      parsedBeforeFilter,
      filteredOut,
      events,
      ...syncResult,
    };
  } catch (err) {
    return {
      source: sourceDef.source,
      label: sourceDef.label,
      ok: false,
      error: err.message,
      events: [],
      parsed: 0,
      parsedBeforeFilter: 0,
      filteredOut: 0,
    };
  }
}

async function fetchICalSource(sourceDef) {
  const res = await fetch(sourceDef.url, {
    headers: { 'User-Agent': 'Nearify-Events-Worker/5.1' },
    cf: { cacheTtl: 0, cacheEverything: false },
  });

  if (!res.ok) {
    throw new Error(`${sourceDef.label} returned ${res.status}`);
  }

  const ical = await res.text();
  const parsedEvents = parseICal(ical);
  const filteredEvents = filterEventsForSource(parsedEvents, sourceDef);

  return {
    events: filteredEvents.map(e => ({ ...e, _sourceKey: sourceDef.source })),
    parsedBeforeFilter: parsedEvents.length,
    filteredOut: parsedEvents.length - filteredEvents.length,
  };
}

function filterEventsForSource(events, sourceDef) {
  if (!Array.isArray(sourceDef.includeKeywords) || sourceDef.includeKeywords.length === 0) {
    return events;
  }

  const keywords = sourceDef.includeKeywords.map(k => String(k).toLowerCase().trim()).filter(Boolean);

  return events.filter(event => {
    const haystack = [event.title, event.description, event.location, event.link]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    return keywords.some(keyword => haystack.includes(keyword));
  });
}

async function syncEventsToSupabase(events, sourceKey, env) {
  try {
    const supabaseUrl = await env.SUPABASE_URL.get();
    const serviceRoleKey = await env.SUPABASE_SERVICE_ROLE_KEY.get();

    if (!supabaseUrl || !serviceRoleKey) {
      return { ok: false, error: 'Missing Supabase secrets' };
    }

    const rows = events
      .map(event => ({
        source: sourceKey,
        source_event_id: getMeetupEventId(event.link),
        title: event.title,
        description: event.description || null,
        start_time: event.startDate,
        end_time: null,
        location: event.location || null,
        source_url: event.link || null,
        image_url: null,
        raw_payload: event,
      }))
      .filter(row => row.source_event_id && row.title && row.start_time);

    if (rows.length === 0) {
      return {
        ok: true,
        status: 200,
        synced: 0,
        matched: 0,
        unmatched: 0,
        matchResults: {
          matched: 0,
          unmatched: 0,
          details: [],
        },
      };
    }

    const upsertResponse = await fetch(
      `${supabaseUrl}/rest/v1/external_events?on_conflict=source,source_event_id`,
      {
        method: 'POST',
        headers: getSupabaseHeaders(serviceRoleKey, 'resolution=merge-duplicates,return=representation'),
        body: JSON.stringify(rows),
      }
    );

    const upsertText = await upsertResponse.text();

    if (!upsertResponse.ok) {
      return {
        ok: false,
        stage: 'upsert_external_events',
        status: upsertResponse.status,
        error: upsertText,
      };
    }

    const upsertedExternalEvents = JSON.parse(upsertText || '[]');

    const matchResults = await autoMatchExternalEvents(
      upsertedExternalEvents,
      supabaseUrl,
      serviceRoleKey
    );

    return {
      ok: true,
      status: upsertResponse.status,
      synced: rows.length,
      matched: matchResults.matched,
      unmatched: matchResults.unmatched,
      matchResults,
    };
  } catch (error) {
    return {
      ok: false,
      error: error.message,
    };
  }
}

async function autoMatchExternalEvents(externalEvents, supabaseUrl, serviceRoleKey) {
  const results = {
    matched: 0,
    unmatched: 0,
    details: [],
  };

  for (const externalEvent of externalEvents) {
    if (externalEvent.matched_event_id) {
      results.matched += 1;
      results.details.push({
        source: externalEvent.source,
        title: externalEvent.title,
        source_event_id: externalEvent.source_event_id,
        status: 'already_matched',
        matched_event_id: externalEvent.matched_event_id,
      });
      continue;
    }

    const candidate = await findMatchingNearifyEvent(
      externalEvent,
      supabaseUrl,
      serviceRoleKey
    );

    if (!candidate) {
      results.unmatched += 1;
      results.details.push({
        source: externalEvent.source,
        title: externalEvent.title,
        source_event_id: externalEvent.source_event_id,
        status: 'no_match',
      });
      continue;
    }

    const updateResponse = await fetch(
      `${supabaseUrl}/rest/v1/external_events?id=eq.${externalEvent.id}`,
      {
        method: 'PATCH',
        headers: getSupabaseHeaders(serviceRoleKey, 'return=representation'),
        body: JSON.stringify({
          matched_event_id: candidate.id,
          updated_at: new Date().toISOString(),
        }),
      }
    );

    if (!updateResponse.ok) {
      const errorText = await updateResponse.text();
      results.unmatched += 1;
      results.details.push({
        source: externalEvent.source,
        title: externalEvent.title,
        source_event_id: externalEvent.source_event_id,
        status: 'match_update_failed',
        candidate_event_id: candidate.id,
        error: errorText,
      });
      continue;
    }

    results.matched += 1;
    results.details.push({
      source: externalEvent.source,
      title: externalEvent.title,
      source_event_id: externalEvent.source_event_id,
      status: 'matched',
      matched_event_id: candidate.id,
      matched_name: candidate.name,
    });
  }

  return results;
}

async function findMatchingNearifyEvent(externalEvent, supabaseUrl, serviceRoleKey) {
  const start = new Date(externalEvent.start_time);
  if (Number.isNaN(start.getTime())) return null;

  const windowStart = new Date(start.getTime() - 12 * 60 * 60 * 1000).toISOString();
  const windowEnd = new Date(start.getTime() + 12 * 60 * 60 * 1000).toISOString();

  const response = await fetch(
    `${supabaseUrl}/rest/v1/events?select=id,name,starts_at&deleted_at=is.null&starts_at=gte.${encodeURIComponent(windowStart)}&starts_at=lte.${encodeURIComponent(windowEnd)}`,
    {
      method: 'GET',
      headers: getSupabaseHeaders(serviceRoleKey),
    }
  );

  if (!response.ok) return null;

  const candidates = await response.json();
  if (!Array.isArray(candidates) || candidates.length === 0) return null;

  const externalTitle = normalizeTitle(externalEvent.title);
  let best = null;
  let bestScore = 0;

  for (const candidate of candidates) {
    const candidateTitle = normalizeTitle(candidate.name);
    const score = titleSimilarity(externalTitle, candidateTitle);
    if (score > bestScore) {
      best = candidate;
      bestScore = score;
    }
  }

  return bestScore >= 0.55 ? best : null;
}

function attachNearifyJoinLinks(allEvents, allMatchDetails) {
  return allEvents.map(event => {
    const sourceEventId = getMeetupEventId(event.link);
    const sourceKey = event._sourceKey;

    const match = allMatchDetails.find(
      detail =>
        detail.source === sourceKey &&
        detail.source_event_id === sourceEventId &&
        detail.matched_event_id
    );

    if (!match?.matched_event_id) return event;

    const sourceDef = SOURCES.find(s => s.source === sourceKey);
    const joinSource = sourceDef?.joinSource || 'meetup';

    return {
      ...event,
      nearifyEventId: match.matched_event_id,
      nearifyJoinUrl: `${NEARIFY_BASE_URL}/join/?event=${match.matched_event_id}&source=${joinSource}&source_event_id=${sourceEventId}`,
    };
  });
}

function aggregateSyncResult(sourceResults) {
  return {
    ok: sourceResults.every(r => r.ok),
    sources: sourceResults.length,
    synced: sourceResults.reduce((sum, r) => sum + (r.synced ?? 0), 0),
    matched: sourceResults.reduce((sum, r) => sum + (r.matched ?? 0), 0),
    unmatched: sourceResults.reduce((sum, r) => sum + (r.unmatched ?? 0), 0),
  };
}

function getSupabaseHeaders(serviceRoleKey, prefer) {
  const headers = {
    apikey: serviceRoleKey,
    Authorization: `Bearer ${serviceRoleKey}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  return headers;
}

function normalizeTitle(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/charlestonhacks/g, '')
    .replace(/presents/g, '')
    .replace(/#charlestontechweek/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function titleSimilarity(a, b) {
  const aTokens = new Set(a.split(' ').filter(Boolean));
  const bTokens = new Set(b.split(' ').filter(Boolean));
  if (aTokens.size === 0 || bTokens.size === 0) return 0;

  let overlap = 0;
  for (const token of aTokens) {
    if (bTokens.has(token)) overlap += 1;
  }
  return overlap / Math.max(aTokens.size, bTokens.size);
}

function getMeetupEventId(url) {
  if (!url) return null;
  const match = url.match(/events\/([^/?#]+)/i);
  return match ? match[1] : url;
}

// ================================================================
// iCal Parsing (with proper timezone handling)
// ================================================================

function parseICal(text) {
  const events = [];

  // Unfold continuation lines and normalize line endings
  text = text.replace(/\r\n[ \t]/g, '').replace(/\r/g, '');

  const blocks = text.split('BEGIN:VEVENT').slice(1);

  for (const block of blocks) {
    const content = block.substring(0, block.indexOf('END:VEVENT'));

    // Helper to get a property value (after the colon)
    const get = key => {
      const m = content.match(new RegExp(`(?:^|\\n)${key}(?:;[^:]*)?:([^\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };

    // Helper to get the full property line (including parameters before the colon)
    const getFullLine = key => {
      const m = content.match(new RegExp(`(?:^|\\n)(${key}[^\\n]*)`, 'i'));
      return m ? m[1].trim() : '';
    };

    const summary = unescape(get('SUMMARY'));
    const dtstartLine = getFullLine('DTSTART');
    const url = get('URL');
    const description = unescape(get('DESCRIPTION')).substring(0, 200);
    const location = unescape(get('LOCATION'));

    if (!summary || !dtstartLine) continue;

    const startDate = parseDate(dtstartLine);
    if (!startDate) continue;

    events.push({
      title: summary,
      link: url,
      startDate: startDate.toISOString(),
      description,
      location,
    });
  }

  events.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  return events;
}

/**
 * Parse an iCal DTSTART line into a proper Date object.
 *
 * Handles these formats:
 *   DTSTART:20260519T220000Z                          → UTC
 *   DTSTART;TZID=America/New_York:20260519T180000     → local time in given tz
 *   DTSTART;VALUE=DATE:20260519                       → date-only
 *   DTSTART:20260519T180000                           → no tz (treated as UTC)
 */
function parseDate(line) {
  try {
    // Extract the TZID parameter if present
    const tzMatch = line.match(/TZID=([^:;]+)/i);
    const timeZone = tzMatch ? tzMatch[1].trim() : null;

    // Extract the value portion (everything after the last colon)
    const colonIdx = line.lastIndexOf(':');
    if (colonIdx === -1) return null;
    const raw = line.substring(colonIdx + 1).trim();

    // Strip non-essential characters for parsing
    const d = raw.replace(/[^0-9TZ]/g, '');

    if (d.includes('T')) {
      const y = d.slice(0, 4);
      const mo = d.slice(4, 6);
      const day = d.slice(6, 8);
      const h = d.slice(9, 11);
      const mi = d.slice(11, 13);
      const s = d.slice(13, 15) || '00';

      // Case 1: Explicit UTC (ends with Z)
      if (raw.endsWith('Z')) {
        return new Date(`${y}-${mo}-${day}T${h}:${mi}:${s}Z`);
      }

      // Case 2: TZID provided — convert local time in that timezone to UTC
      if (timeZone) {
        return localTimeToUTC(
          parseInt(y, 10),
          parseInt(mo, 10),
          parseInt(day, 10),
          parseInt(h, 10),
          parseInt(mi, 10),
          parseInt(s, 10),
          timeZone
        );
      }

      // Case 3: No timezone info at all — assume UTC (safest for server-side)
      return new Date(`${y}-${mo}-${day}T${h}:${mi}:${s}Z`);
    }

    // Date-only value
    return new Date(`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}T00:00:00Z`);
  } catch {
    return null;
  }
}

/**
 * Convert a local date/time in a given IANA timezone to a UTC Date object.
 *
 * Uses Intl.DateTimeFormat to determine the actual UTC offset for that timezone
 * at the given local time (correctly handles DST transitions).
 */
function localTimeToUTC(year, month, day, hour, minute, second, timeZone) {
  // Start with a rough UTC estimate (treat the local values as if they were UTC)
  const rough = new Date(Date.UTC(year, month - 1, day, hour, minute, second));

  // Determine what the local time components would be in the target timezone
  // at our rough estimate, then compute the offset.
  const offset = getTimezoneOffsetMs(rough, timeZone);

  // The actual UTC time = rough - offset
  // (If the timezone is UTC-4, local 18:00 = UTC 22:00, offset is -4h in ms,
  //  so rough(18:00Z) - (-4h) = 22:00Z ✓ ... but our offset function returns
  //  the difference as local-UTC, so we subtract it.)
  const candidate = new Date(rough.getTime() - offset);

  // Verify: due to DST edge cases, re-check the offset at the candidate time.
  // If it differs, use the corrected offset.
  const verifyOffset = getTimezoneOffsetMs(candidate, timeZone);
  if (verifyOffset !== offset) {
    return new Date(rough.getTime() - verifyOffset);
  }

  return candidate;
}

/**
 * Returns the UTC offset in milliseconds for a given IANA timezone
 * at a specific instant. Positive means ahead of UTC (e.g. UTC+5 → +5h ms).
 *
 * offset = (what the clock shows in that tz, interpreted as UTC) - (actual UTC)
 *
 * Example: America/New_York in summer (EDT = UTC-4)
 *   At 2026-05-19T22:00:00Z, local clock shows 18:00.
 *   offset = Date.UTC(2026,4,19,18,0,0) - Date.UTC(2026,4,19,22,0,0) = -4h
 */
function getTimezoneOffsetMs(date, timeZone) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);

  const get = (type) => {
    const val = parts.find(p => p.type === type)?.value || '0';
    return parseInt(val, 10);
  };

  const localAsUTC = Date.UTC(
    get('year'),
    get('month') - 1,
    get('day'),
    get('hour') === 24 ? 0 : get('hour'), // midnight edge case
    get('minute'),
    get('second')
  );

  return localAsUTC - date.getTime();
}

function unescape(str) {
  return str
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\n/gi, ' ')
    .replace(/\\\\/g, '\\');
}
