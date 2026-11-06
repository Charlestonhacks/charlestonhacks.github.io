/**
 * events-core.js
 * Event feed loading and scheduling rules shared by the homepage and
 * pulse-metrics.js. No DOM access, so it can run under Node for tests.
 */

export const EVENT_TIME_ZONE = 'America/New_York';
export const FEATURED_WINDOW_DAYS = 45;
export const MEETUP_GROUP_URL = 'https://www.meetup.com/charlestonhacks/';

// Retries come at about 15 seconds, 1 minute, 4 minutes, and 16 minutes.
export const FEED_MAX_RETRIES = 4;
export const FEED_RETRY_COOLDOWN_MS = 15 * 60 * 1000;
const FEED_RETRY_BASE_MS = 15000;
const FEED_RETRY_FACTOR = 4;

const DAY_MS = 24 * 60 * 60 * 1000;
// The feed has no end times yet. Meetup's own calendar lists these events at two hours.
const DEFAULT_DURATION_MS = 2 * 60 * 60 * 1000;

// Only the primary feed can report "nothing is scheduled". events.json is a static
// snapshot, so an empty or expired answer from it proves nothing and is skipped.
export const FEED_SOURCES = [
  { url: 'https://charlestonhacks-events.dmhamilton1.workers.dev', timeoutMs: 8000, authoritative: true },
  { url: '/assets/data/events.json', timeoutMs: 4000, authoritative: false },
];

// ── Dates ────────────────────────────────────────────────────────────────

const easternParts = new Intl.DateTimeFormat('en-US', {
  timeZone: EVENT_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: 'numeric',
  day: 'numeric',
  hour: 'numeric',
  minute: 'numeric',
  second: 'numeric',
});

function easternOffsetMs(ms) {
  const parts = {};
  easternParts.formatToParts(ms).forEach(function (part) { parts[part.type] = Number(part.value); });
  const wall = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return wall - Math.floor(ms / 1000) * 1000;
}

function easternWallTimeToMs(wall) {
  return wall - easternOffsetMs(wall - easternOffsetMs(wall));
}

/** Reads a feed timestamp. Values without a zone are Charleston wall time. */
export function parseEventTime(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = String(value).trim();
  const local = text.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?(?:\.\d+)?)?$/);
  if (local) {
    const [, y, mo, d, h, mi, s] = local;
    const wall = Date.UTC(+y, +mo - 1, +d, +(h || 0), +(mi || 0), +(s || 0));
    return { ms: easternWallTimeToMs(wall), allDay: h === undefined };
  }
  const ms = new Date(text).getTime();
  return Number.isFinite(ms) ? { ms, allDay: false } : null;
}

function eventDateParts(ms) {
  const parts = {};
  new Intl.DateTimeFormat('en-US', {
    timeZone: EVENT_TIME_ZONE,
    year: 'numeric',
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  }).formatToParts(ms).forEach(function (part) { parts[part.type] = part.value; });
  return parts;
}

/** "Tue, Nov 17 · 5:30 PM EST", always in Charleston time. */
export function formatEventWhen(event) {
  const p = eventDateParts(event.startMs);
  const date = p.weekday + ', ' + p.month + ' ' + p.day;
  if (event.allDay) return date;
  return date + ' · ' + p.hour + ':' + p.minute + ' ' + p.dayPeriod + ' ' + p.timeZoneName;
}

export function formatCountdown(msAway) {
  const minutes = Math.max(1, Math.ceil(msAway / 60000));
  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  if (days) return 'In ' + days + 'd ' + hours + 'h';
  return hours ? 'In ' + hours + 'h ' + (minutes % 60) + 'm' : 'In ' + minutes + 'm';
}

// ── Event identity ───────────────────────────────────────────────────────

export function isCharlestonHacksEvent(ev) {
  const link = String(ev.link || ev.url || '').toLowerCase();
  const title = String(ev.title || ev.name || '').toLowerCase();
  const source = String(ev.source || '').toLowerCase();
  return link.includes('meetup.com/charlestonhacks')
    || title.includes('charlestonhacks') || title.includes('charleston hacks') || title.includes('harborhack')
    || source.includes('charlestonhacks');
}

function getHostName(ev) {
  if (ev.sourceLabel) return String(ev.sourceLabel);
  const group = String(ev.link || ev.url || '').toLowerCase().match(/meetup\.com\/([^/]+)/);
  if (!group) return '';
  if (group[1] === 'chs-amazon-web-services') return 'Charleston AWS Meetup';
  return group[1].replace(/-/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

function cleanCharlestonHacksTitle(title) {
  return title
    .replace(/CharlestonHacks\s*(Presents\s*:?\s*)?[-–—:]?\s*/gi, '')
    .replace(/\*\*/g, '')
    .trim() || 'Event';
}

function eventKey(ev, startMs) {
  const link = String(ev.link || ev.url || '');
  const meetupId = link.match(/\/events\/(\d+)/);
  if (meetupId) return 'meetup:' + meetupId[1];
  return link ? 'url:' + link.split(/[?#]/)[0] : 'event:' + (ev.title || ev.name) + ':' + startMs;
}

/** Only http(s) links reach an href; anything else becomes the fallback. */
export function safeHref(value, fallback) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : fallback;
  } catch (_) {
    return fallback;
  }
}

// Nearify's apple-app-site-association excludes ?web=1 from Universal Links, so
// this keeps the link in the browser on iOS without changing the event ID.
export function nearifyBrowserUrl(value) {
  const href = safeHref(value, '');
  if (!href) return '';
  const url = new URL(href);
  if (url.protocol === 'https:' && url.hostname === 'nearify.org' && /^\/(join|events)\//.test(url.pathname)) {
    url.searchParams.set('web', '1');
  }
  return url.href;
}

/** Returns the fields the homepage uses, or null when the event has no usable start. */
export function normalizeEvent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const start = parseEventTime(raw.startDate || raw.start_date || raw.starts_at || raw.date);
  if (!start) return null;

  const end = parseEventTime(raw.endDate || raw.end_date || raw.ends_at);
  const isCharlestonHacks = isCharlestonHacksEvent(raw);
  const title = String(raw.title || raw.name || 'Event');
  const fallbackEnd = start.ms + (start.allDay ? DAY_MS : DEFAULT_DURATION_MS);

  return {
    key: eventKey(raw, start.ms),
    title: isCharlestonHacks ? cleanCharlestonHacksTitle(title) : title,
    startMs: start.ms,
    endMs: end && end.ms > start.ms ? end.ms : fallbackEnd,
    allDay: start.allDay,
    isCharlestonHacks,
    label: isCharlestonHacks ? 'CharlestonHacks' : 'Community',
    hostName: isCharlestonHacks ? 'CharlestonHacks' : getHostName(raw),
    location: String(raw.location || raw.venue || ''),
    description: String(raw.description || raw.desc || '').replace(/<[^>]*>/g, ''),
    link: safeHref(raw.link || raw.url, ''),
    nearifyUrl: nearifyBrowserUrl(raw.nearifyJoinUrl),
  };
}

// ── Homepage selection ───────────────────────────────────────────────────

/** Events that have not ended, soonest first, with repeats removed. */
export function activeEvents(rawEvents, now) {
  const byKey = new Map();
  (rawEvents || []).forEach(function (raw) {
    const event = normalizeEvent(raw);
    if (event && event.endMs > now && !byKey.has(event.key)) byKey.set(event.key, event);
  });
  return Array.from(byKey.values()).sort(function (a, b) {
    return a.startMs - b.startMs || a.title.localeCompare(b.title);
  });
}

/** Latest completed CharlestonHacks event, visible for seven days after its end. */
export function selectLastCharlestonHacksEvent(rawEvents, now) {
  return (rawEvents || []).map(normalizeEvent)
    .filter(event => event && event.isCharlestonHacks
      && event.endMs <= now && now < event.endMs + 7 * DAY_MS)
    .sort((a, b) => b.endMs - a.endMs || b.startMs - a.startMs
      || a.key.localeCompare(b.key))[0] || null;
}

export function isOngoing(event, now) {
  return event.startMs <= now && now < event.endMs;
}

/**
 * Features the next CharlestonHacks event inside the window, then the next
 * community event. A CharlestonHacks event beyond the window is used only
 * when no community event is listed.
 */
export function selectHomepageEvents(rawEvents, now) {
  const timeline = activeEvents(rawEvents, now);
  const windowEnd = now + FEATURED_WINDOW_DAYS * DAY_MS;
  const featured = timeline.find(function (ev) { return ev.isCharlestonHacks && ev.startMs <= windowEnd; })
    || timeline.find(function (ev) { return !ev.isCharlestonHacks; })
    || timeline[0]
    || null;
  return {
    featured,
    others: timeline.filter(function (ev) { return ev !== featured; }),
  };
}

// ── Feed loading ─────────────────────────────────────────────────────────

async function fetchJson(url, timeoutMs, fetchImpl) {
  const controller = new AbortController();
  const timer = setTimeout(function () { controller.abort(); }, timeoutMs);
  try {
    const res = await fetchImpl(url, { signal: controller.signal });
    if (!res.ok) throw new Error(url + ' returned ' + res.status);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

// The primary worker reports failures as HTTP 200 with { events: [], error }, and
// lists per-calendar failures in sourceResults. A calendar that parsed
// events but failed its Supabase sync still delivered them, so it doesn't count.
function readFeed(data) {
  const events = Array.isArray(data) ? data : data && data.events;
  if (!Array.isArray(events)) throw new Error('Feed has no event list');
  const sourceResults = Array.isArray(data.sourceResults) ? data.sourceResults : [];
  const hasFailedCalendar = sourceResults.some(function (r) { return r && r.ok === false && !r.parsed; });
  return { events, complete: !data.error && !hasFailedCalendar };
}

/**
 * Resolves to { status, events }. It never rejects.
 *   ok          - the primary feed answered in full; empty means nothing is scheduled
 *   partial     - events from an incomplete feed or the static snapshot
 *   unavailable - no source could say what is scheduled
 */
export async function requestEventFeed({
  sources = FEED_SOURCES,
  fetchImpl = (...args) => fetch(...args),
  now = Date.now(),
} = {}) {
  for (const source of sources) {
    try {
      const feed = readFeed(await fetchJson(source.url, source.timeoutMs, fetchImpl));
      if (source.authoritative && feed.complete) return { status: 'ok', events: feed.events };
      if (activeEvents(feed.events, now).length) return { status: 'partial', events: feed.events };
    } catch (_) {}
  }
  return { status: 'unavailable', events: [] };
}

/**
 * Callers share one request, because every call to the primary worker runs a
 * Supabase sync. Only { retry: true } replaces a settled 'unavailable' result,
 * so a failure isn't refetched by whichever caller happens to ask next.
 */
export function createFeedLoader(request) {
  let pending = null;
  let settled = null;

  return function loadFeed({ retry = false } = {}) {
    if (!pending || (retry && settled && settled.status === 'unavailable')) {
      settled = null;
      pending = request().then(function (result) {
        settled = result;
        return result;
      });
    }
    return pending;
  };
}

export const loadEventFeed = createFeedLoader(requestEventFeed);

/** Delay before a retry, or null once retries run out. Jitter spreads out open tabs. */
export function feedRetryDelayMs(attempt, random = Math.random) {
  if (attempt >= FEED_MAX_RETRIES) return null;
  return FEED_RETRY_BASE_MS * Math.pow(FEED_RETRY_FACTOR, attempt) * (0.8 + 0.4 * random());
}

/**
 * Retries an 'unavailable' feed with backoff. A 'partial' feed isn't retried:
 * the primary already answered, and asking again repeats its whole sync.
 *
 * nextAttemptAt is the one record of when a planned retry is due. While paused
 * (hidden or offline) a due retry waits without spending anything, and resume()
 * runs it on return. That also covers timers frozen by a sleeping device. After
 * the retries run out, resume() plans one attempt per cooldown.
 */
export function createFeedRetrier({
  load,
  onResult,
  isPaused,
  schedule = setTimeout,
  cancel = clearTimeout,
  now = Date.now,
  random = Math.random,
}) {
  let status = null;
  let retryCount = 0;
  let timer = null;
  let running = false;
  let nextAttemptAt = null;
  let lastRequestAt = now();

  function plan(delay) {
    nextAttemptAt = now() + delay;
    timer = schedule(run, delay);
  }

  function planBackoff() {
    if (status !== 'unavailable') return;
    const delay = feedRetryDelayMs(retryCount, random);
    if (delay === null) return;
    retryCount += 1;
    plan(delay);
  }

  async function run() {
    cancel(timer);
    timer = null;
    if (isPaused()) return;
    nextAttemptAt = null;
    running = true;
    lastRequestAt = now();
    try {
      const result = await load({ retry: true });
      status = result.status;
      onResult(result);
    } finally {
      running = false;
      planBackoff();
    }
  }

  function resume() {
    if (running || isPaused() || status !== 'unavailable') return;
    if (nextAttemptAt !== null) {
      if (!timer || now() >= nextAttemptAt) run();
      return;
    }
    // The clamp keeps a clock moved backward from stretching the wait.
    const wait = Math.min(lastRequestAt + FEED_RETRY_COOLDOWN_MS - now(), FEED_RETRY_COOLDOWN_MS);
    if (wait > 0) plan(wait);
    else run();
  }

  return {
    start(result) {
      status = result.status;
      planBackoff();
    },
    resume,
  };
}

export function countEventsInYear(rawEvents, year) {
  return rawEvents.filter(function (raw) {
    const event = normalizeEvent(raw);
    return event && Number(eventDateParts(event.startMs).year) === year;
  }).length;
}
