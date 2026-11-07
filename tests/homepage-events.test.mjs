// Run from the repo root: node --test tests/homepage-events.test.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import {
  FEED_MAX_RETRIES,
  FEED_RETRY_COOLDOWN_MS,
  FEED_SOURCES,
  activeEvents,
  countEventsInYear,
  createFeedLoader,
  createFeedRetrier,
  feedRetryDelayMs,
  formatCountdown,
  formatEventWhen,
  nearifyBrowserUrl,
  normalizeEvent,
  parseEventTime,
  requestEventFeed,
  safeHref,
  selectHomepageEvents,
  selectLastCharlestonHacksEvent,
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
  { url: 'fallback', timeoutMs: 50, authoritative: false },
  { url: 'static', timeoutMs: 50, authoritative: false },
];
const load = (answers) => {
  const fake = fakeFetch(answers);
  return requestEventFeed({ sources: SOURCES, fetchImpl: fake.fetchImpl, now: NOW }).then((r) => ({ ...r, calls: fake.calls }));
};
const live = community(1, NOW + DAY);
const okCalendars = [{ source: 'a', ok: true, parsed: 0 }, { source: 'b', ok: true, parsed: 0 }];

test('primary configuration: only the first source can confirm an empty calendar', () => {
  assert.deepEqual(FEED_SOURCES.map((s) => s.authoritative), [true, false]);
});

test('the retired ChuckTown scraper is excluded from event sources', () => {
  assert.equal(FEED_SOURCES.some((s) => s.url.includes('charlestonhacks-events-worker')), false);
});

test('a complete empty primary answer means nothing is scheduled and stops', async () => {
  const result = await load({ primary: { events: [], sourceResults: okCalendars } });
  assert.equal(result.status, 'ok');
  assert.deepEqual(result.calls, ['primary']);
  assert.equal((await load({ primary: { events: [] } })).status, 'ok', 'still valid once debug fields go');
});

test('an HTTP 200 error body is a failure, not an empty calendar', async () => {
  const result = await load({ primary: { events: [], error: 'boom' }, fallback: { events: [] }, static: { events: [] } });
  assert.equal(result.status, 'unavailable');
  assert.deepEqual(result.calls, ['primary', 'fallback', 'static']);
});

test('an HTTP 200 error body falls through to a live snapshot', async () => {
  const result = await load({ primary: { events: [], error: 'boom' }, fallback: { events: [] }, static: { events: [live] } });
  assert.equal(result.status, 'partial');
  assert.equal(result.events.length, 1);
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

test('an empty or expired snapshot cannot stand in for a dead primary', async () => {
  const expired = { events: [ch(1, Date.parse('2025-02-20T17:30:00'))] };
  assert.equal((await load({ primary: 500, fallback: { events: [] }, static: expired })).status, 'unavailable');
  assert.equal((await load({ primary: 500, fallback: new Error('timeout'), static: { events: [] } })).status, 'unavailable');
  assert.equal((await load({ static: 404 })).status, 'unavailable');
  assert.equal((await load({ primary: 'not a feed' })).status, 'unavailable');
});

test('a snapshot with live events is used, marked partial', async () => {
  const result = await load({ primary: 503, fallback: { events: [live] } });
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.calls, ['primary', 'fallback']);
});

test('an empty fallback is skipped in favor of the next source', async () => {
  const result = await load({ primary: 503, fallback: { events: [] }, static: { events: [live] } });
  assert.equal(result.status, 'partial');
  assert.deepEqual(result.calls, ['primary', 'fallback', 'static']);
});

function queuedRequest(results) {
  const request = () => {
    request.calls += 1;
    return Promise.resolve(results.shift());
  };
  request.calls = 0;
  return request;
}

test('callers share one request, and a failure is not refetched without a retry', async () => {
  const request = queuedRequest([{ status: 'unavailable' }, { status: 'ok' }]);
  const loadFeed = createFeedLoader(request);
  assert.equal(loadFeed(), loadFeed());
  await loadFeed();
  assert.equal((await loadFeed()).status, 'unavailable');
  assert.equal(request.calls, 1);
});

test('a retry bypasses a cached failure, and later callers get the recovery', async () => {
  const request = queuedRequest([{ status: 'unavailable' }, { status: 'ok' }]);
  const loadFeed = createFeedLoader(request);
  await loadFeed();
  assert.equal((await loadFeed({ retry: true })).status, 'ok');
  assert.equal((await loadFeed()).status, 'ok');
  assert.equal(request.calls, 2);
});

test('a retry never duplicates a request in flight or replaces a usable result', async () => {
  const request = queuedRequest([{ status: 'unavailable' }, { status: 'ok' }, { status: 'ok' }]);
  const loadFeed = createFeedLoader(request);
  const first = loadFeed();
  assert.equal(loadFeed({ retry: true }), first);
  await first;
  const second = loadFeed({ retry: true });
  assert.equal(loadFeed({ retry: true }), second);
  await second;
  await loadFeed({ retry: true });
  assert.equal(request.calls, 2);

  const partial = queuedRequest([{ status: 'partial' }, { status: 'ok' }]);
  const loadPartial = createFeedLoader(partial);
  await loadPartial();
  assert.equal((await loadPartial({ retry: true })).status, 'partial');
  assert.equal(partial.calls, 1);
});

function retrierHarness(statuses) {
  const state = { paused: false, time: 0, due: null, calls: 0, requestTimes: [], results: [], gate: null, failRender: false };
  state.retrier = createFeedRetrier({
    load: async () => {
      state.calls += 1;
      state.requestTimes.push(state.time);
      if (state.gate) await state.gate.promise;
      return { status: statuses.length > 1 ? statuses.shift() : statuses[0] };
    },
    onResult: (result) => {
      if (state.failRender) throw new Error('render failed');
      state.results.push(result.status);
    },
    isPaused: () => state.paused,
    schedule: (run, delay) => {
      assert.equal(state.due, null, 'only one retry timer at a time');
      state.due = { run, delay };
      return state.due;
    },
    cancel: (timer) => { if (timer && timer === state.due) state.due = null; },
    now: () => state.time,
    random: () => 0.5,
  });
  state.fire = async () => {
    const { run, delay } = state.due;
    state.time += delay;
    await run();
  };
  // Starts the scheduled attempt and leaves its request open until release() runs.
  state.fireAndHold = () => {
    let release;
    const promise = new Promise((resolve) => { release = resolve; });
    state.gate = { promise };
    const finished = state.fire();
    return () => {
      state.gate = null;
      release();
      return finished;
    };
  };
  return state;
}

const settle = () => new Promise((resolve) => setImmediate(resolve));

async function exhaustRetries(h) {
  h.retrier.start({ status: 'unavailable' });
  while (h.due) await h.fire();
  assert.equal(h.calls, FEED_MAX_RETRIES);
}

test('retries back off, stop when the feed recovers, and show the recovery', async () => {
  const h = retrierHarness(['unavailable', 'ok']);
  h.retrier.start({ status: 'unavailable' });
  assert.equal(h.due.delay, 15000);
  await h.fire();
  assert.equal(h.due.delay, 60000);
  await h.fire();
  assert.equal(h.due, null);
  assert.equal(h.calls, 2);
  assert.deepEqual(h.results, ['unavailable', 'ok']);
});

test('an outage stops after the retry limit', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);
  assert.equal(h.due, null);
});

test('ok and partial feeds are never retried', () => {
  for (const status of ['ok', 'partial']) {
    const h = retrierHarness(['ok']);
    h.time = FEED_RETRY_COOLDOWN_MS;
    h.retrier.start({ status });
    h.retrier.resume();
    assert.equal(h.due, null);
    assert.equal(h.calls, 0);
  }
});

test('a paused tab holds its retry without spending it', async () => {
  const h = retrierHarness(['unavailable', 'ok']);
  h.retrier.start({ status: 'unavailable' });
  h.paused = true;
  await h.fire();
  h.time += 60 * 60000;
  h.retrier.resume();
  assert.equal(h.calls, 0, 'still paused');
  h.paused = false;
  h.retrier.resume();
  h.retrier.resume();
  await settle();
  assert.equal(h.calls, 1, 'one request on return');
  assert.equal(h.due.delay, 60000, 'the next backoff step, not the last');
});

test('a held retry survives a clock moved backward', async () => {
  const h = retrierHarness(['unavailable']);
  h.retrier.start({ status: 'unavailable' });
  h.paused = true;
  await h.fire();
  h.time -= 3 * 60 * 60000;
  h.paused = false;
  h.retrier.resume();
  await settle();
  assert.equal(h.calls, 1);
});

test('after the limit, a due resume makes one request and plans nothing further', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);
  h.time += FEED_RETRY_COOLDOWN_MS;
  h.retrier.resume();
  h.retrier.resume();
  await settle();
  assert.equal(h.calls, FEED_MAX_RETRIES + 1);
  assert.equal(h.due, null);
});

test('reconnecting before the cooldown expires recovers when it ends', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);

  h.time += 9 * 60000;
  h.retrier.resume();
  h.retrier.resume();
  assert.equal(h.calls, FEED_MAX_RETRIES, 'no request inside the cooldown');
  assert.equal(h.due.delay, FEED_RETRY_COOLDOWN_MS - 9 * 60000);

  await h.fire();
  assert.equal(h.calls, FEED_MAX_RETRIES + 1);
  assert.equal(h.due, null, 'a failed cooldown attempt plans nothing further');
});

test('a reconnect recovery shows the result and stops', async () => {
  const h = retrierHarness(Array(FEED_MAX_RETRIES).fill('unavailable').concat('ok'));
  await exhaustRetries(h);
  h.retrier.resume();
  await h.fire();
  assert.equal(h.results.at(-1), 'ok');
  assert.equal(h.due, null);
  h.time += FEED_RETRY_COOLDOWN_MS;
  h.retrier.resume();
  assert.equal(h.calls, FEED_MAX_RETRIES + 1);
});

test('a timer frozen by device sleep does not delay recovery on return', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);
  h.retrier.resume();
  assert.ok(h.due, 'cooldown timer waiting');

  h.time += 2 * 60 * 60000;
  h.retrier.resume();
  await settle();
  assert.equal(h.calls, FEED_MAX_RETRIES + 1, 'one request right away');
  assert.equal(h.due, null, 'the frozen timer is cancelled');
});

test('a clock moved backward cannot stretch the wait past the cooldown', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);
  h.time -= 3 * 60 * 60000;
  h.retrier.resume();
  assert.equal(h.due.delay, FEED_RETRY_COOLDOWN_MS);
});

test('resuming during a request starts nothing overlapping', async () => {
  const h = retrierHarness(['unavailable']);
  h.retrier.start({ status: 'unavailable' });
  const release = h.fireAndHold();
  h.time += FEED_RETRY_COOLDOWN_MS + 60000;
  h.retrier.resume();
  h.retrier.resume();
  assert.equal(h.calls, 1, 'still the first request');
  assert.equal(h.due, null);

  await release();
  assert.equal(h.calls, 1);
  assert.equal(h.results.length, 1);
  assert.equal(h.due.delay, 60000, 'backoff advances one step, with one timer');
});

test('two events from one wake make one request and leave nothing planned', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);
  h.time += FEED_RETRY_COOLDOWN_MS;
  let release;
  h.gate = { promise: new Promise((resolve) => { release = resolve; }) };
  h.retrier.resume();
  h.retrier.resume();
  h.gate = null;
  release();
  await settle();
  assert.equal(h.calls, FEED_MAX_RETRIES + 1);
  assert.equal(h.due, null);
});

test('a resume during a request that recovers plans nothing', async () => {
  const h = retrierHarness(['ok']);
  h.retrier.start({ status: 'unavailable' });
  const release = h.fireAndHold();
  h.retrier.resume();
  await release();
  assert.equal(h.due, null);
  assert.equal(h.calls, 1);
});

test('a render error does not lose the remaining retries', async () => {
  const h = retrierHarness(['unavailable']);
  h.retrier.start({ status: 'unavailable' });
  h.failRender = true;
  await assert.rejects(h.fire(), /render failed/);
  h.failRender = false;
  assert.equal(h.due.delay, 60000);
});

test('an outage stays within one request per cooldown however often it resumes', async () => {
  const h = retrierHarness(['unavailable']);
  await exhaustRetries(h);
  const start = h.requestTimes.length;
  for (let step = 1; step <= 300; step += 1) {
    h.time += step % 7 ? 60000 : 20 * 60000;
    h.retrier.resume();
    h.retrier.resume();
    await settle();
    if (h.due) await h.fire();
  }
  const extra = h.requestTimes.slice(start);
  assert.ok(extra.length > 1);
  extra.slice(1).forEach((time, i) => {
    assert.ok(time - extra[i] >= FEED_RETRY_COOLDOWN_MS, 'gap ' + (time - extra[i]));
  });
});

test('retry delays back off, stay within jitter, and run out', () => {
  const low = () => 0;
  const high = () => 1;
  const center = [0, 1, 2, 3].map((attempt) => feedRetryDelayMs(attempt, () => 0.5));
  assert.deepEqual(center, [15000, 60000, 240000, 960000]);
  center.forEach((delay, attempt) => {
    assert.equal(Math.round(feedRetryDelayMs(attempt, low)), delay * 0.8);
    assert.equal(Math.round(feedRetryDelayMs(attempt, high)), Math.round(delay * 1.2));
  });
  assert.equal(FEED_MAX_RETRIES, 4);
  assert.equal(feedRetryDelayMs(FEED_MAX_RETRIES), null);
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
  assert.match(home, /<h1 class="section-title">Building Charleston into a recognized tech hub<\/h1>/);
  assert.ok(!home.includes('hub for builders, hackers, and makers</h1>'));
  assert.ok(home.indexOf('class="mission-stats"') < home.indexOf('class="hero"'), 'event follows the whole mission section');
  assert.ok(home.indexOf('id="events-section"') < home.indexOf('class="hero"'));
  assert.ok(home.indexOf('class="hero"') < home.indexOf('>Community Events</h2>'), 'event sits above the upcoming list');
  assert.ok(home.indexOf('id="next-event"') < home.indexOf('id="last-charlestonhacks-event"'), 'last-event block follows the featured event');
  assert.ok(home.indexOf('id="last-charlestonhacks-event"') < home.indexOf('id="homepage-events"'), 'last-event block precedes community events');
  assert.equal((home.match(/id="last-charlestonhacks-event"/g) || []).length, 1);
  assert.ok(!home.includes('316558816') && !script.includes('316558816'));
  assert.ok(!home.includes('workers.dev'), 'feed URLs live in events-core.js');
  assert.ok(!script.includes('.nearifyJoinUrl'), 'cards only use the browser-safe URL');
  assert.ok(script.includes("el('h2', 'hero-title', featured.title)"), 'event title is an h2');
});

test('homepage wiring: retries pause offline and resume on return or reconnect', () => {
  const script = readFileSync('assets/js/homepage-events.js', 'utf8');
  assert.ok(script.includes('document.hidden || !navigator.onLine'));
  assert.ok(script.includes("document.addEventListener('visibilitychange', retrier.resume)"));
  assert.ok(script.includes("window.addEventListener('online', retrier.resume)"));
});


test('last CharlestonHacks event: most recent completed event, expires exactly seven days after end', () => {
  const end = NOW - DAY;
  const latest = ch('recent', end - 3600000, { endDate: at(end) });
  const older = ch('older', end - DAY - 3600000, { endDate: at(end - DAY) });
  const future = ch('future', NOW + DAY);
  const community = { title: 'Community meetup', link: 'https://example.com/event', startDate: at(NOW - 3600000), endDate: at(NOW - 1) };
  assert.equal(selectLastCharlestonHacksEvent([older, future, community, latest], NOW).key, normalizeEvent(latest).key);
  assert.ok(selectLastCharlestonHacksEvent([latest], end + 7 * DAY - 1));
  assert.equal(selectLastCharlestonHacksEvent([latest], end + 7 * DAY), null);
  assert.equal(selectLastCharlestonHacksEvent([future, community, {}], NOW), null);
  assert.ok(selectLastCharlestonHacksEvent([latest], end));
  assert.equal(selectLastCharlestonHacksEvent([latest], end - 1), null);
});

test('labels the homepage last-event section for both states', () => {
  const home = readFileSync('index.html', 'utf8');
  const script = readFileSync('assets/js/homepage-events.js', 'utf8');
  assert.match(home, /<h2 class="events-list-title" id="last-event-heading" hidden>Explore CharlestonHacks Events<\/h2>/);
  assert.match(home, /<a class="harborhack-btn" href="\/Poster\.html">Upcoming events and past recaps →<\/a>/);
  assert.ok(script.includes("event ? 'Last CharlestonHacks Event' : 'Explore CharlestonHacks Events'"));
  assert.ok(script.includes("heading.hidden = !event"));
  assert.ok(script.includes("'Upcoming events and past recaps →'"));
  assert.ok(script.includes("event.link.includes('meetup.com') ? 'View event →' : 'View event recap →'"));
});
