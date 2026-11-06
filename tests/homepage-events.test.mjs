// Run from the repo root: node --test tests/homepage-events.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FEED_SOURCES,
  activeEvents,
  countEventsInYear,
  formatCountdown,
  formatEventWhen,
  nearifyBrowserUrl,
  normalizeEvent,
  parseEventTime,
  requestEventFeed,
  safeHref,
  selectHomepageEvents,
} from '../assets/js/events-core.js';

const NOW = Date.parse('2026-11-05T20:00:00Z');
const DAY = 86400000;
const at = (ms) => new Date(ms).toISOString();
const ch = (id, startMs, extra = {}) => ({
  title: 'CharlestonHacks Presents: Build Night ' + id,
  link: 'https://www.meetup.com/charlestonhacks/events/' + id + '/',
  startDate: at(startMs),
  ...extra,
});
const community = (id, startMs, extra = {}) => ({
  title: 'Community ' + id,
  link: 'https://www.meetup.com/techyeet/events/' + id + '/',
  startDate: at(startMs),
  ...extra,
});

test('features the next CharlestonHacks event over a sooner community event', () => {
  const { featured, others } = selectHomepageEvents([community(1, NOW + DAY), ch(2, NOW + 12 * DAY)], NOW);
  assert.equal(featured.key, 'meetup:2');
  assert.equal(featured.title, 'Build Night 2');
  assert.deepEqual(others.map((e) => e.key), ['meetup:1']);
});

test('the 45-day window is inclusive and falls back to community past it', () => {
  const inside = selectHomepageEvents([community(1, NOW + DAY), ch(2, NOW + 45 * DAY)], NOW);
  assert.equal(inside.featured.key, 'meetup:2');
  const outside = selectHomepageEvents([community(1, NOW + DAY), ch(2, NOW + 45 * DAY + 1)], NOW);
  assert.equal(outside.featured.key, 'meetup:1');
  assert.deepEqual(outside.others.map((e) => e.key), ['meetup:2']);
});

test('uses a distant CharlestonHacks event when no community event exists', () => {
  assert.equal(selectHomepageEvents([ch(2, NOW + 90 * DAY)], NOW).featured.key, 'meetup:2');
  assert.equal(selectHomepageEvents([], NOW).featured, null);
});

test('others are chronological, labeled, and never repeat the featured event', () => {
  const events = [community(3, NOW + 9 * DAY), ch(1, NOW + 2 * DAY), community(2, NOW + 3 * DAY), ch(1, NOW + 2 * DAY), ch(4, NOW + 5 * DAY)];
  const { featured, others } = selectHomepageEvents(events, NOW);
  assert.equal(featured.key, 'meetup:1');
  assert.deepEqual(others.map((e) => [e.key, e.label]), [
    ['meetup:2', 'Community'], ['meetup:4', 'CharlestonHacks'], ['meetup:3', 'Community'],
  ]);
});

test('events stay visible until they end', () => {
  const started = community(1, NOW - 60000);
  assert.equal(activeEvents([started], NOW).length, 1);
  assert.equal(activeEvents([community(1, NOW - 2 * 3600000)], NOW).length, 0, 'default two hours elapsed');
  const multiDay = ch(2, NOW - DAY, { endDate: at(NOW + DAY) });
  assert.equal(activeEvents([multiDay], NOW).length, 1);
  assert.equal(activeEvents([ch(3, NOW - DAY, { endDate: at(NOW - 1) })], NOW).length, 0);
  assert.equal(activeEvents([ch(4, NOW + DAY, { endDate: at(NOW) })], NOW)[0].endMs, NOW + DAY + 2 * 3600000, 'end before start is ignored');
});

test('dates display in America/New_York whatever the runtime zone', () => {
  assert.equal(formatEventWhen(normalizeEvent({ startDate: '2026-11-17T22:30:00.000Z' })), 'Tue, Nov 17 · 5:30 PM EST');
  assert.equal(formatEventWhen(normalizeEvent({ startDate: '2026-07-01T22:30:00Z' })), 'Wed, Jul 1 · 6:30 PM EDT');
  assert.equal(formatEventWhen(normalizeEvent({ startDate: '2026-11-18T03:30:00Z' })), 'Tue, Nov 17 · 10:30 PM EST', 'UTC next day is still Tuesday in Charleston');
  assert.equal(formatEventWhen(normalizeEvent({ startDate: '2026-12-01' })), 'Tue, Dec 1', 'date-only stays on its date');
});

test('timestamps without a zone are Charleston wall time, across DST', () => {
  assert.equal(parseEventTime('2025-02-10T18:00:00').ms, Date.parse('2025-02-10T23:00:00Z'));
  assert.equal(parseEventTime('2026-07-01T18:00').ms, Date.parse('2026-07-01T22:00:00Z'));
  assert.equal(parseEventTime('2026-11-01T12:00:00').ms, Date.parse('2026-11-01T17:00:00Z'), 'fall-back day');
  assert.equal(parseEventTime('2026-03-08T12:00:00').ms, Date.parse('2026-03-08T16:00:00Z'), 'spring-forward day');
  assert.equal(parseEventTime('nonsense'), null);
  assert.equal(normalizeEvent({ title: 'No date' }), null);
});

test('countdown text', () => {
  assert.equal(formatCountdown(11 * DAY + 3 * 3600000), 'In 11d 3h');
  assert.equal(formatCountdown(3 * 3600000 + 5 * 60000), 'In 3h 5m');
  assert.equal(formatCountdown(30 * 1000), 'In 1m');
});

test('Nearify links get web=1 without changing the event', () => {
  const url = new URL(nearifyBrowserUrl('https://nearify.org/join/?event=abc&source=meetup'));
  assert.equal(url.searchParams.get('web'), '1');
  assert.equal(url.searchParams.get('event'), 'abc');
  assert.equal(new URL(nearifyBrowserUrl('https://nearify.org/events/x')).searchParams.get('web'), '1');
  assert.equal(nearifyBrowserUrl('https://example.com/join/?event=abc'), 'https://example.com/join/?event=abc');
  assert.equal(nearifyBrowserUrl('javascript:alert(1)'), '');
  assert.equal(normalizeEvent(ch(1, NOW, { nearifyJoinUrl: 'https://nearify.org/join/?event=a' })).nearifyUrl, 'https://nearify.org/join/?event=a&web=1');
});

test('only http links survive', () => {
  assert.equal(safeHref('javascript:alert(1)', 'x'), 'x');
  assert.equal(normalizeEvent({ startDate: at(NOW), link: 'data:text/html,hi' }).link, '');
});

function fakeFetch(answers) {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    const answer = answers[url];
    if (answer === undefined || answer instanceof Error) throw answer || new Error('offline');
    if (typeof answer === 'number') return { ok: false, status: answer, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => answer };
  };
  return { fetchImpl, calls };
}
const SOURCES = [
  { url: 'primary', timeoutMs: 50, authoritative: true },
  { url: 'backup', timeoutMs: 50, authoritative: false },
  { url: 'static', timeoutMs: 50, authoritative: false },
];
const load = (answers) => {
  const fake = fakeFetch(answers);
  return requestEventFeed({ sources: SOURCES, fetchImpl: fake.fetchImpl, now: NOW }).then((r) => ({ ...r, calls: fake.calls }));
};
const live = community(1, NOW + DAY);
const okCalendars = [{ source: 'a', ok: true, parsed: 0 }, { source: 'b', ok: true, parsed: 0 }];

test('primary configuration: only the first source can confirm an empty calendar', () => {
  assert.deepEqual(FEED_SOURCES.map((s) => s.authoritative), [true, false, false]);
});

test('a complete empty primary answer means nothing is scheduled and stops', async () => {
  const result = await load({ primary: { events: [], sourceResults: okCalendars } });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.calls, ['primary']);
  assert.equal((await load({ primary: { events: [] } })).status, 'ok', 'still valid once debug fields go');
});

test('an HTTP 200 error body is a failure, not an empty calendar', async () => {
  const result = await load({ primary: { events: [], error: 'boom' }, backup: { events: [], lastUpdated: 'x' }, static: { events: [] } });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.calls, ['primary', 'backup', 'static']);
});

test('an empty list with a failed calendar is not trusted', async () => {
  const sourceResults = [{ source: 'a', ok: false, parsed: 0, error: 'Meetup 503' }];
  assert.equal((await load({ primary: { events: [], sourceResults } })).status, 'unavailable');
});

test('a Supabase sync failure with parsed events still counts as delivered', async () => {
  const sourceResults = [{ source: 'a', ok: false, parsed: 1 }];
  assert.equal((await load({ primary: { events: [live], sourceResults } })).status, 'ok');
});

test('events plus a failed calendar are shown as partial', async () => {
  const sourceResults = [{ source: 'a', ok: false, parsed: 0 }, { source: 'b', ok: true, parsed: 1 }];
  const result = await load({ primary: { events: [live], sourceResults } });
  assert.equal(result.status, 'partial');
  assert.equal(result.events.length, 1);
});

test('the empty backup and expired snapshot cannot stand in for a dead primary', async () => {
  const expired = { events: [ch(1, Date.parse('2025-02-20T17:30:00'))] };
  assert.equal((await load({ primary: 500, backup: { events: [] }, static: expired })).status, 'unavailable');
  assert.equal((await load({ backup: new Error('timeout'), static: 404 })).status, 'unavailable');
  assert.equal((await load({ primary: 'not a feed' })).status, 'unavailable');
});

test('a backup with live events is used, marked partial', async () => {
  const result = await load({ primary: 503, backup: { events: [live] } });
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.calls, ['primary', 'backup']);
  assert.equal((await load({ primary: 503, backup: { events: [] }, static: { events: [live] } })).status, 'partial');
});

test('a hung source is abandoned', async () => {
  const fetchImpl = (url, { signal }) => new Promise((_, reject) => {
    signal.addEventListener('abort', () => reject(new Error('aborted')));
  });
  assert.equal((await requestEventFeed({ sources: SOURCES.slice(0, 1), fetchImpl, now: NOW })).status, 'unavailable');
});

test('years are counted in Charleston time', () => {
  assert.equal(countEventsInYear([{ startDate: '2027-01-01T03:00:00Z' }, { startDate: '2026-06-01T12:00:00Z' }, { title: 'none' }], 2026), 2);
});

test('homepage markup: permanent headline, archive after upcoming, no hardcoded event', () => {
  const home = readFileSync('index.html', 'utf8');
  const script = readFileSync('assets/js/homepage-events.js', 'utf8');
  assert.equal((home.match(/<h1[\s>]/g) || []).length, 1);
  assert.ok(home.indexOf('class="hero"') < home.indexOf('id="mission-section"'));
  assert.ok(home.indexOf('id="homepage-events"') < home.indexOf('class="harborhack-entry"'));
  assert.ok(!home.includes('316558816') && !script.includes('316558816'));
  assert.ok(!home.includes('workers.dev'), 'feed URLs live in events-core.js');
  assert.ok(!script.includes('.nearifyJoinUrl'), 'cards only use the browser-safe URL');
});
