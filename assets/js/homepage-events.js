/**
 * homepage-events.js
 * Renders the hero's featured event and the Upcoming Events list.
 * Selection and feed rules live in events-core.js.
 */

import {
  MEETUP_GROUP_URL,
  createFeedRetrier,
  formatCountdown,
  formatEventWhen,
  isOngoing,
  loadEventFeed,
  selectHomepageEvents,
  selectLastCharlestonHacksEvent,
} from '/assets/js/events-core.js';

const LIST_PREVIEW_COUNT = 6;
const DESCRIPTION_LENGTH = 130;

const heroEvent = document.getElementById('hero-event');
const heroCta = document.getElementById('hero-cta');
const eventsList = document.getElementById('homepage-events');
const feedNote = document.getElementById('events-feed-note');

let feed = { status: 'unavailable', events: [] };
let renderedSignature = null;
let listExpanded = false;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function externalLink(className, href, text) {
  const link = el('a', className, text);
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function countdownBadge(event, now) {
  if (isOngoing(event, now)) return el('span', 'event-countdown', 'Happening now');
  const badge = el('span', 'event-countdown', formatCountdown(event.startMs - now));
  badge.dataset.start = String(event.startMs);
  return badge;
}

function primaryAction(event, now) {
  if (isOngoing(event, now) && event.nearifyUrl) return { href: event.nearifyUrl, text: 'Join Live Network' };
  const href = event.link || MEETUP_GROUP_URL;
  if (isOngoing(event, now)) return { href, text: 'View Event' };
  return { href, text: href.includes('meetup.com') ? 'RSVP on Meetup' : 'Get Event Details' };
}

function renderHeroMessage(label, title, subtitle, action) {
  heroEvent.replaceChildren(
    el('p', 'events-label', label),
    el('h2', 'hero-title hero-title-message', title),
    el('p', 'hero-sub', subtitle),
  );
  heroCta.replaceChildren(externalLink('btn-primary', MEETUP_GROUP_URL, action));
  heroCta.hidden = false;
}

function renderHero(featured, now) {
  if (!featured) {
    if (feed.status !== 'ok') {
      renderHeroMessage('Events are temporarily unavailable', 'We couldn’t load the next event',
        'The calendar may still have events. Meetup has the latest schedule.', 'See Events on Meetup');
    } else {
      renderHeroMessage('Nothing on the calendar yet', 'No events are scheduled right now',
        'Follow us on Meetup to hear about the next one first.', 'Follow on Meetup');
    }
    return;
  }

  const ongoing = isOngoing(featured, now);
  const label = el('p', 'events-label', ongoing ? 'Happening now' : 'Next event — ');
  if (!ongoing) {
    const countdown = el('span', 'hero-countdown', formatCountdown(featured.startMs - now).toLowerCase());
    countdown.dataset.start = String(featured.startMs);
    label.append(countdown);
  }

  const nodes = [label, el('h2', 'hero-title', featured.title)];
  if (!featured.isCharlestonHacks && featured.hostName) {
    nodes.push(el('p', 'hero-hosted-by', 'Hosted by ' + featured.hostName));
  }
  nodes.push(el('p', 'hero-sub', formatEventWhen(featured) + ' · ' + (featured.location || 'Charleston, SC')));
  heroEvent.replaceChildren(...nodes);

  const action = primaryAction(featured, now);
  const links = [externalLink('btn-primary', action.href, action.text)];
  links[0].id = 'hero-rsvp';
  if (featured.nearifyUrl && action.href !== featured.nearifyUrl) {
    links.push(externalLink('hero-meetup-link', featured.nearifyUrl, 'Join Live Network'));
  } else if (featured.link && action.href !== featured.link) {
    links.push(externalLink('hero-meetup-link', featured.link, 'View on Meetup'));
  }
  heroCta.replaceChildren(...links);
  heroCta.hidden = false;
}

function eventCard(event, now) {
  const card = el('div', 'event-card');
  const sourceClass = event.isCharlestonHacks ? 'ch-source-charlestonhacks' : 'ch-source-community';
  card.append(el('span', 'ch-source-badge ' + sourceClass, event.label));

  const dateRow = el('div', 'event-date-row');
  const date = el('time', 'event-date', formatEventWhen(event));
  date.dateTime = new Date(event.startMs).toISOString();
  dateRow.append(date, countdownBadge(event, now));
  card.append(dateRow);

  const href = event.nearifyUrl || event.link || MEETUP_GROUP_URL;
  const title = el('h3');
  title.append(externalLink('', href, event.title));
  card.append(title);

  if (!event.isCharlestonHacks && event.hostName) {
    card.append(el('p', 'event-location', 'Hosted by ' + event.hostName));
  }
  if (event.location) card.append(el('p', 'event-location', '📍 ' + event.location));
  if (event.description) {
    const truncated = event.description.length > DESCRIPTION_LENGTH;
    card.append(el('p', 'event-desc', event.description.slice(0, DESCRIPTION_LENGTH) + (truncated ? '…' : '')));
  }

  const actions = el('div', 'ch-event-cta');
  actions.append(externalLink('ch-btn-meetup', event.link || MEETUP_GROUP_URL, 'View Event'));
  if (event.nearifyUrl) actions.append(externalLink('ch-link-nearify', event.nearifyUrl, 'Join Live Network'));
  card.append(actions);
  return card;
}

function emptyMessage(text, linkText) {
  const message = el('p', 'events-empty', text + ' ');
  if (linkText) message.append(externalLink('', MEETUP_GROUP_URL, linkText));
  return message;
}

function renderList(featured, others, now) {
  feedNote.hidden = feed.status !== 'partial';

  if (feed.status !== 'ok' && !featured) {
    eventsList.replaceChildren(emptyMessage('We couldn’t load the event calendar.', 'See events on Meetup'));
    return;
  }
  if (!others.length) {
    const text = featured ? 'No other events are scheduled right now.' : 'No events are scheduled right now.';
    eventsList.replaceChildren(emptyMessage(text, 'Follow on Meetup'));
    return;
  }

  const visible = listExpanded ? others : others.slice(0, LIST_PREVIEW_COUNT);
  eventsList.replaceChildren(...visible.map(function (event) { return eventCard(event, now); }));

  const hiddenCount = others.length - visible.length;
  if (hiddenCount > 0) {
    const more = el('button', 'btn-secondary events-show-more', 'Show ' + hiddenCount + ' more');
    more.type = 'button';
    more.addEventListener('click', function () {
      listExpanded = true;
      renderedSignature = null;
      update();
    });
    eventsList.append(more);
  }
}

function renderLastEvent(event) {
  const root = document.getElementById('last-event-content');
  if (!root) return;
  document.getElementById('last-event-heading').textContent = event ? 'Last CharlestonHacks Event' : 'Explore CharlestonHacks Events';
  const archive = el('a', 'harborhack-btn', 'Upcoming events and past recaps →');
  archive.href = '/Poster.html';
  if (!event) { root.replaceChildren(archive); return; }
  const card = el('article', 'event-card');
  const title = el('h3', '', event.title);
  const date = el('time', 'event-date', formatEventWhen(event));
  date.dateTime = new Date(event.startMs).toISOString();
  card.append(title, date);
  if (event.location) card.append(el('p', 'event-location', event.location));
  if (event.description) card.append(el('p', 'event-desc', event.description.slice(0, DESCRIPTION_LENGTH)));
  if (event.link) card.append(externalLink('ch-btn-meetup', event.link, 'View event recap →'));
  card.append(archive);
  root.replaceChildren(card);
}

// Full renders only happen when the feed or an event changes state, so links keep focus and
// the aria-live regions stay quiet between countdown ticks.
function update() {
  const now = Date.now();
  const { featured, others } = selectHomepageEvents(feed.events, now);
  const lastEvent = selectLastCharlestonHacksEvent(feed.events, now);
  const signature = [feed.status, lastEvent ? lastEvent.key : "archive"].concat([featured], others).map(function (item) {
    return item && item.key ? item.key + ':' + isOngoing(item, now) : item;
  }).join('|');

  if (signature !== renderedSignature) {
    renderedSignature = signature;
    renderLastEvent(lastEvent);
    renderHero(featured, now);
    renderList(featured, others, now);
    return;
  }

  document.querySelectorAll('.event-countdown[data-start]').forEach(function (badge) {
    badge.textContent = formatCountdown(Number(badge.dataset.start) - now);
  });
  document.querySelectorAll('.hero-countdown').forEach(function (badge) {
    badge.textContent = formatCountdown(Number(badge.dataset.start) - now).toLowerCase();
  });
}

function showFeed(next) {
  feed = next;
  update();
}

async function init() {
  const retrier = createFeedRetrier({
    load: loadEventFeed,
    onResult: showFeed,
    isPaused: function () { return document.hidden || !navigator.onLine; },
  });
  const firstFeed = await loadEventFeed();
  showFeed(firstFeed);
  setInterval(update, 60000);
  document.addEventListener('visibilitychange', retrier.resume);
  window.addEventListener('online', retrier.resume);
  retrier.start(firstFeed);
}

init();
