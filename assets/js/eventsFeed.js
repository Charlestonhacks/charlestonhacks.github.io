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
    const eventsToShow = events.slice(0, limit);

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
