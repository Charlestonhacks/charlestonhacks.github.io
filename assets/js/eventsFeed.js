/**
 * CharlestonHacks — Events Feed + Modal Wiring
 * - Fetches events from the Cloudflare Worker
 * - Renders into #events-list
 * - Handles modal open/close for #events-overlay
 * - Source-aware: distinguishes CharlestonHacks vs community/partner events
 */

console.log("📜 eventsFeed.js loaded");

const FEED_URL = "https://charlestonhacks-events.dmhamilton1.workers.dev";

// ── Source detection ────────────────────────────────────────────────────

function isCharlestonHacksEvent(ev) {
  const link = (ev?.link || ev?.url || "").toLowerCase();
  const title = (ev?.title || ev?.name || "").toLowerCase();
  if (link.includes("meetup.com/charlestonhacks")) return true;
  if (title.includes("charlestonhacks") || title.includes("charleston hacks") || title.includes("harborhack")) return true;
  const source = (ev?.source || "").toLowerCase();
  if (source.includes("charlestonhacks") || source === "charlestonhacks") return true;
  return false;
}

function getSourceLabel(ev) {
  if (isCharlestonHacksEvent(ev)) return "CharlestonHacks";
  if (ev?.sourceLabel) return ev.sourceLabel;
  const link = (ev?.link || "").toLowerCase();
  if (link.includes("meetup.com/chs-amazon-web-services")) return "Charleston AWS Meetup";
  if (link.includes("meetup.com/")) {
    const match = link.match(/meetup\.com\/([^/]+)/);
    if (match && match[1] !== "charlestonhacks") {
      return match[1].replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
    }
  }
  return "Community Event";
}

// ── Render helpers ──────────────────────────────────────────────────────

function safeText(s) {
  return String(s ?? "").replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

function formatDateShort(startDate) {
  if (!startDate) return "Upcoming";
  try {
    const d = new Date(startDate);
    if (Number.isNaN(d.getTime())) return "Upcoming";
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric", weekday: "short" });
  } catch {
    return "Upcoming";
  }
}

export async function loadEvents({
  listId = "events-list",
  limit = 10,
  emptyText = "No upcoming events found. Check back later!",
  errorText = "Unable to reach the event feed. Please try again later.",
} = {}) {
  const list = document.getElementById(listId);
  if (!list) {
    console.error("❌ Could not find #events-list");
    return;
  }

  list.innerHTML = `<p style="opacity:.7;">Searching for local happenings...</p>`;

  try {
    const response = await fetch(FEED_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const data = await response.json();
    const events = data?.events || data;

    if (!Array.isArray(events) || events.length === 0) {
      list.innerHTML = `<p>${safeText(emptyText)}</p>`;
      return;
    }

    list.innerHTML = "";
    // The feed can arrive in a non-chronological order. Sort valid start
    // dates earliest-first, leaving undated events at the end in their source order.
    const eventsToShow = events
      .map((event, index) => {
        const rawDate = event?.startDate ?? event?.start_date ?? event?.starts_at ?? event?.date;
        const startTime = rawDate ? new Date(rawDate).getTime() : Number.NaN;
        return { event, index, startTime };
      })
      .sort((a, b) => {
        const aHasDate = Number.isFinite(a.startTime);
        const bHasDate = Number.isFinite(b.startTime);
        if (aHasDate && bHasDate) return a.startTime - b.startTime || a.index - b.index;
        if (aHasDate) return -1;
        if (bHasDate) return 1;
        return a.index - b.index;
      })
      .slice(0, limit)
      .map(({ event }) => event);

    for (const event of eventsToShow) {
      const title = safeText(event?.title || "Event");
      const link = safeText(event?.link || "#");
      const description = safeText(event?.description || "");
      const location = safeText(event?.location || "");
      const dateStr = safeText(formatDateShort(event?.startDate));
      const nearifyJoinUrl = event?.nearifyJoinUrl ? safeText(event.nearifyJoinUrl) : null;
      const isCH = isCharlestonHacksEvent(event);
      const sourceLabel = getSourceLabel(event);

      console.log("[EventsFeed]", event?.title, "| Source:", sourceLabel, "| nearifyJoinUrl:", nearifyJoinUrl || "(none)");

      const eventEl = document.createElement("div");
      eventEl.className = "ch-event-card";

      // Source badge for non-CharlestonHacks events
      const sourceBadgeHtml = isCH
        ? ""
        : `<span class="ch-source-badge ch-source-community">${safeText(sourceLabel)}</span>`;

      // Build CTA section — always use the event's own nearifyJoinUrl, never a hardcoded fallback
      let ctaHtml = "";
      if (nearifyJoinUrl) {
        ctaHtml = `
          <div class="ch-event-cta">
            <span class="ch-nearify-badge">Live Nearify Experience Available</span>
            <a href="${nearifyJoinUrl}" target="_blank" rel="noopener noreferrer" class="ch-btn-nearify">
              Join Live Network
            </a>
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="ch-link-meetup">
              View on Meetup
            </a>
          </div>
        `;
      } else {
        ctaHtml = `
          <div class="ch-event-cta">
            <a href="${link}" target="_blank" rel="noopener noreferrer" class="ch-btn-meetup">
              View Event
            </a>
          </div>
        `;
      }

      eventEl.innerHTML = `
        ${sourceBadgeHtml}
        <div class="ch-event-date">${dateStr}</div>
        <h3 class="ch-event-title">
          <a href="${nearifyJoinUrl || link}" target="_blank" rel="noopener noreferrer">${title}</a>
        </h3>
        ${location ? `<p class="ch-event-location">📍 ${location}</p>` : ""}
        ${
          description
            ? `<p class="ch-event-desc">${description.substring(0, 150)}${
                description.length > 150 ? "..." : ""
              }</p>`
            : ""
        }
        ${ctaHtml}
      `;

      list.appendChild(eventEl);
    }
  } catch (err) {
    console.error("❌ Error loading events:", err);
    list.innerHTML = `<p>${safeText(errorText)}</p>`;
  }
}


export async function loadUnifiedEvents({
  listId = "portal-events-list",
  emptyText = "No events are listed yet.",
  errorText = "The event list could not load. Please try again later.",
} = {}) {
  const list = document.getElementById(listId);
  if (!list) return;
  list.textContent = "Loading events and posters…";

  const filterGroup = document.getElementById("portal-events-filter-controls");
  const filterButtons = Array.from(filterGroup?.querySelectorAll("[data-event-filter]") || []);
  const filterStatus = document.getElementById("portal-events-filter-status");

  function applyEventSourceFilters() {
    if (!filterButtons.length) return;
    const activeSources = new Set(
      filterButtons
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.dataset.eventFilter)
    );
    let visibleCount = 0;
    list.querySelectorAll(".ch-event-card").forEach((card) => {
      card.hidden = !activeSources.has(card.dataset.source);
      if (!card.hidden) visibleCount += 1;
    });
    list.querySelectorAll(".ch-events-section-title").forEach((heading) => {
      let sibling = heading.nextElementSibling;
      let hasVisibleEvents = false;
      while (sibling && !sibling.classList.contains("ch-events-section-title")) {
        if (sibling.classList.contains("ch-event-card") && !sibling.hidden) hasVisibleEvents = true;
        sibling = sibling.nextElementSibling;
      }
      heading.hidden = !hasVisibleEvents;
    });

    const emptyMessage = list.querySelector(".ch-events-filter-empty");
    if (emptyMessage) {
      emptyMessage.hidden = visibleCount > 0;
      emptyMessage.textContent = activeSources.size
        ? "No events match the selected source."
        : "Choose CharlestonHacks or Community to show events.";
    }
    if (filterStatus) {
      const names = filterButtons
        .filter((button) => button.getAttribute("aria-pressed") === "true")
        .map((button) => button.textContent.trim());
      filterStatus.textContent = names.length
        ? `${names.join(" and ")} events shown. ${visibleCount} events.`
        : "No event sources selected.";
    }
  }

  if (filterGroup && filterGroup.dataset.filtersBound !== "true") {
    filterGroup.addEventListener("click", (event) => {
      const button = event.target.closest("[data-event-filter]");
      if (!button || !filterGroup.contains(button)) return;
      const isPressed = button.getAttribute("aria-pressed") === "true";
      button.setAttribute("aria-pressed", String(!isPressed));
      applyEventSourceFilters();
    });
    filterGroup.dataset.filtersBound = "true";
  }

  async function getArchiveEvents() {
    const response = await fetch("/Poster.html", { cache: "force-cache" });
    if (!response.ok) throw new Error("Poster archive unavailable");
    const html = await response.text();
    const archiveDocument = new DOMParser().parseFromString(html, "text/html");
    const items = Array.from(archiveDocument.querySelectorAll("#gallery .gallery-item"));
    const archived = items.map((item) => {
      const image = item.querySelector("img");
      const date = item.dataset.eventDate || "";
      const label = image?.alt || item.getAttribute("aria-label") || "CharlestonHacks event";
      const split = label.lastIndexOf(" — ");
      const title = split > 0 ? label.slice(0, split) : label.replace(/\s+on\s+\d{4}-\d{2}-\d{2}$/, "");
      const src = image?.getAttribute("src") || "";
      return {
        title,
        link: new URL(item.getAttribute("href") || "#", location.href).href,
        startDate: date,
        location: "",
        description: "",
        source: "CharlestonHacks",
        posterSrc: src ? new URL(src, location.href).href : "",
        posterDataPath: image?.dataset.posterBase64 || "",
        isArchiveEvent: true,
      };
    });

    await Promise.all(archived.map(async (event) => {
      if (!event.posterDataPath) return;
      try {
        const posterResponse = await fetch(event.posterDataPath, { cache: "force-cache" });
        if (posterResponse.ok) {
          const encoded = (await posterResponse.text()).trim();
          if (encoded) event.posterSrc = "data:image/webp;base64," + encoded;
        }
      } catch {}
    }));
    return archived;
  }

  function dateTime(event) {
    const raw = event?.startDate ?? event?.start_date ?? event?.starts_at ?? event?.date ?? "";
    if (!raw) return Number.NaN;
    const value = String(raw);
    const normalized = /^\d{4}-\d{2}$/.test(value)
      ? value + "-01T12:00:00"
      : (/^\d{4}-\d{2}-\d{2}$/.test(value) ? value + "T12:00:00" : value);
    const result = new Date(normalized).getTime();
    return Number.isFinite(result) ? result : Number.NaN;
  }

  function eventKey(event) {
    const link = String(event?.link || event?.url || "");
    const id = link.match(/\/events?\/(\d+)/i)?.[1];
    return id ? "meetup:" + id : "url:" + link.split("?")[0];
  }

  try {
    const [feedResult, archiveResult] = await Promise.allSettled([
      fetch(FEED_URL).then((response) => {
        if (!response.ok) throw new Error("Event feed unavailable");
        return response.json();
      }),
      getArchiveEvents(),
    ]);
    const feedData = feedResult.status === "fulfilled" ? feedResult.value : [];
    const feedEvents = Array.isArray(feedData) ? feedData : (feedData?.events || []);
    const archiveEvents = archiveResult.status === "fulfilled" ? archiveResult.value : [];
    if (!feedEvents.length && !archiveEvents.length) {
      list.textContent = safeText(errorText);
      return;
    }

    const eventsByKey = new Map();
    archiveEvents.forEach((event) => eventsByKey.set(eventKey(event), event));
    feedEvents.forEach((event) => {
      const key = eventKey(event);
      const archive = eventsByKey.get(key);
      eventsByKey.set(key, { ...archive, ...event, posterSrc: archive?.posterSrc || event?.posterSrc || "", isArchiveEvent: !!archive });
    });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const upcoming = [];
    const past = [];
    for (const event of eventsByKey.values()) {
      const time = dateTime(event);
      if (Number.isFinite(time) && time >= today.getTime()) upcoming.push(event);
      else past.push(event);
    }
    upcoming.sort((a, b) => dateTime(a) - dateTime(b));
    past.sort((a, b) => {
      const at = dateTime(a), bt = dateTime(b);
      if (Number.isFinite(at) && Number.isFinite(bt)) return bt - at;
      if (Number.isFinite(at)) return -1;
      if (Number.isFinite(bt)) return 1;
      return String(a.title || "").localeCompare(String(b.title || ""));
    });

    list.replaceChildren();
    function appendSection(label, events) {
      if (!events.length) return;
      const heading = document.createElement("h3");
      heading.className = "ch-events-section-title";
      heading.textContent = label;
      list.append(heading);

      events.forEach((event) => {
        const rawLink = event?.link || event?.url || "#";
        let link = "#";
        try {
          const url = new URL(rawLink, location.href);
          if (url.protocol === "http:" || url.protocol === "https:") link = url.href;
        } catch {}
        const isCH = event.isArchiveEvent || isCharlestonHacksEvent(event);
        const sourceLabel = isCH ? "CharlestonHacks" : getSourceLabel(event);
        const card = document.createElement("article");
        card.className = "ch-event-card";
        card.setAttribute("role", "listitem");
        card.dataset.source = isCH ? "charlestonhacks" : "community";
        card.dataset.hasPoster = String(!!event.posterSrc);

        const content = document.createElement("div");
        content.className = "ch-event-content";

        const meta = document.createElement("div");
        meta.className = "ch-event-meta";
        const time = document.createElement("time");
        time.className = "ch-event-date";
        const rawDate = String(event?.startDate ?? event?.start_date ?? event?.starts_at ?? event?.date ?? "");
        time.dateTime = rawDate;
        const monthOnly = rawDate.match(/^\d{4}-(\d{2})$/);
        time.textContent = monthOnly
          ? monthOnly[1] + "/" + rawDate.slice(0, 4)
          : (Number.isFinite(dateTime(event))
              ? new Date(dateTime(event)).toLocaleDateString("en-US", { month: "2-digit", day: "2-digit", year: "numeric" })
              : "Date to be announced");
        const badge = document.createElement("span");
        badge.className = "ch-source-badge " + (isCH ? "ch-source-charlestonhacks" : "ch-source-community");
        badge.textContent = sourceLabel;
        meta.append(time, badge);
        content.append(meta);

        const title = document.createElement("h4");
        title.className = "ch-event-title";
        const titleLink = document.createElement("a");
        titleLink.href = link;
        titleLink.target = "_blank";
        titleLink.rel = "noopener noreferrer";
        titleLink.textContent = String(event?.title || event?.name || "Event");
        title.append(titleLink);
        content.append(title);

        if (event?.location) {
          const locationText = document.createElement("p");
          locationText.className = "ch-event-location";
          locationText.textContent = "📍 " + String(event.location);
          content.append(locationText);
        }
        if (event?.description) {
          const description = document.createElement("p");
          description.className = "ch-event-desc";
          description.textContent = String(event.description).slice(0, 180) + (String(event.description).length > 180 ? "…" : "");
          content.append(description);
        }
        const actions = document.createElement("div");
        actions.className = "ch-event-cta";
        if (event?.nearifyJoinUrl) {
          const join = document.createElement("a");
          join.className = "ch-btn-nearify";
          join.href = String(event.nearifyJoinUrl);
          join.target = "_blank";
          join.rel = "noopener noreferrer";
          join.textContent = "Join Live Network";
          actions.append(join);
        }
        const view = document.createElement("a");
        view.className = "ch-link-meetup";
        view.href = link;
        view.target = "_blank";
        view.rel = "noopener noreferrer";
        view.textContent = "View event";
        actions.append(view);
        content.append(actions);

        if (event.posterSrc) {
          const poster = document.createElement("a");
          poster.className = "ch-event-poster";
          poster.href = link;
          poster.target = "_blank";
          poster.rel = "noopener noreferrer";
          poster.setAttribute("aria-label", "Open " + String(event?.title || "event") + " on Meetup");
          const image = document.createElement("img");
          image.src = event.posterSrc;
          image.alt = "Poster for " + String(event?.title || "event");
          image.loading = "lazy";
          image.decoding = "async";
          poster.append(image);
          card.append(poster);
        }
        card.append(content);
        list.append(card);
      });
    }

    appendSection("Upcoming", upcoming);
    appendSection("Past events", past);
    if (!upcoming.length && !past.length) {
      list.textContent = safeText(emptyText);
      return;
    }
    const filterEmptyMessage = document.createElement("p");
    filterEmptyMessage.className = "ch-events-filter-empty";
    filterEmptyMessage.hidden = true;
    list.append(filterEmptyMessage);
    applyEventSourceFilters();
  } catch (error) {
    console.error("Unable to load unified event archive:", error);
    list.textContent = safeText(errorText);
  }
}

/**
 * Modal wiring for the calendar
 * - Click #open-calendar to open overlay and load events
 * - Click #close-overlay or outside modal to close
 */
export function initEventsModal({
  openBtnId = "open-calendar",
  overlayId = "events-overlay",
  closeBtnId = "close-overlay",
} = {}) {
  const openBtn = document.getElementById(openBtnId);
  const overlay = document.getElementById(overlayId);
  const closeBtn = document.getElementById(closeBtnId);

  if (!overlay) {
    console.warn("⚠️ Events overlay not found; skipping initEventsModal()");
    return;
  }

  function open() {
    overlay.classList.add("active");
    loadEvents().catch(() => {});
  }

  function close() {
    overlay.classList.remove("active");
  }

  openBtn?.addEventListener("click", (e) => {
    e.preventDefault();
    open();
  });

  closeBtn?.addEventListener("click", close);

  overlay.addEventListener("click", (e) => {
    if (e.target === overlay) close();
  });

  return { open, close };
}
