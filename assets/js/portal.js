// ================================================================
// CharlestonHacks Portal Controller
// File: /assets/js/portal.js
// ================================================================

(() => {
  "use strict";

  const VERSION = "portal-js-v6-quick-access-tooltips-20261028";
  console.log(`[PORTAL] loaded ${VERSION}`);

  // ------------------------------------------------
  // DOM helpers
  // ------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // Quick Access is the only click-based way to open portal features.
  function activatePortal(portalId, trigger) {
    const urls = {
      poster: "Poster.html",
      docs: "docs.html",
      swag: "swag.html",
      sponsor: "donations.html",
      game: "cardmatchgame.html",
    };
    const sounds = {
      poster: "chime",
      docs: "chime",
      sandbox: "chime",
      swag: "chime",
      news: "chime",
      sponsor: "keys",
      game: "chime",
    };

    if (typeof gtag === "function") {
      gtag("event", "portal_click", { portal_id: portalId });
    }
    if (portalId === "btc") {
      openMatrixBTC(trigger);
      return;
    }
    if (portalId === "innovation") {
      playPortalActivationSound();
      openCardDestination("buildspace", "right", trigger);
      return;
    }
    if (portalId === "news" || portalId === "sandbox") {
      const direction = portalId === "news" ? "down" : "right";
      openCardDestination(portalId, direction, trigger);
      return;
    }

    if (sounds[portalId]) playSoundById(sounds[portalId] + "Sound");
    const url = urls[portalId];
    if (!url) return;
    const destination = new URL(url, window.location.href);
    if (destination.origin === window.location.origin) {
      destination.searchParams.set("returnTo", "hub");
    }
    window.setTimeout(() => { window.location.href = destination.href; }, 200);
  }

  function initQuickAccessTooltips() {
    const rail = $(".icons-container");
    if (!rail) return;

    const tooltip = document.createElement("div");
    tooltip.id = "quick-access-tooltip";
    tooltip.setAttribute("role", "tooltip");
    tooltip.setAttribute("aria-hidden", "true");
    document.body.append(tooltip);

    let activeLink = null;
    const hide = () => {
      activeLink = null;
      tooltip.classList.remove("is-visible");
    };
    const position = () => {
      if (!activeLink) return;
      const rect = activeLink.getBoundingClientRect();
      const railRect = rail.getBoundingClientRect();
      if (
        rect.right < railRect.left ||
        rect.left > railRect.right ||
        rect.bottom < railRect.top ||
        rect.top > railRect.bottom
      ) {
        hide();
        return;
      }
      const centerX = rect.left + rect.width / 2;
      const boundedX = Math.max(8, Math.min(window.innerWidth - 8, centerX));
      tooltip.style.left = `${boundedX}px`;
      tooltip.style.top = `${Math.max(8, rect.top - 8)}px`;
    };
    const show = (link) => {
      activeLink = link;
      tooltip.textContent = link.getAttribute("aria-label") || link.title;
      tooltip.classList.add("is-visible");
      requestAnimationFrame(position);
    };

    rail.querySelectorAll("a[title]").forEach((link) => {
      link.addEventListener("mouseenter", () => show(link));
      link.addEventListener("mouseleave", hide);
      link.addEventListener("focus", () => show(link));
      link.addEventListener("blur", hide);
    });
    rail.addEventListener("scroll", position, { passive: true });
    window.addEventListener("resize", position);
  }

  $$('.icons-container [data-portal-shortcut]').forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      activatePortal(link.dataset.portalShortcut, link);
    });
  });

  // Cache DOM once (performance + consistency)
  const DOM = {
    // portal UI
    mediaContainer: $(".media-container"),
    infoLine: $("#infoLine"),
    infoText: $("#infoText"),

    // events modal
    openCalendarBtn: $("#open-calendar"),
    eventsOverlay: $("#events-overlay"),
    eventsCloseBtn: $("#close-overlay"),

    // BTC overlay
    btcOverlay: $("#matrix-btc-overlay"),
    btcCloseBtn: $("#close-matrix-btc"),
    btcDataContainer: $("#btc-data-container"),
    btcLoading: $("#btc-loading"),
    btcContent: $("#btc-content"),

    // BTC value elements
    btcMainPrice: $("#btc-main-price"),
    btc24hChange: $("#btc-24h-change"),
    btc24hHigh: $("#btc-24h-high"),
    btc24hLow: $("#btc-24h-low"),
    btcMarketCap: $("#btc-market-cap"),
    btcVolume: $("#btc-volume"),
    btcLastUpdate: $("#btc-last-update"),

    // Matrix canvas
    matrixCanvas: $("#matrix-canvas"),
  };

  // ------------------------------------------------
  // Audio (lazy)
  // ------------------------------------------------
  function playSoundById(id) {
    const el = document.getElementById(id);
    if (!el) return;

    // Lazy-load audio only when needed
    if (el.preload === "none" && el.readyState === 0) {
      try {
        el.load();
      } catch (_) {}
    }

    try {
      el.currentTime = 0;
      el.play().catch(() => {});
    } catch (_) {}
  }

  window.__CH_PLAY_SOUND_ID__ = playSoundById;

  // Synthesized ascending arpeggio (C5-E5-G5-C6) for the center portal
  function playPortalActivationSound() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const notes = [523.25, 659.25, 783.99, 1046.50];
      notes.forEach((freq, i) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = "sine";
        osc.frequency.value = freq;
        const t = ctx.currentTime + i * 0.09;
        gain.gain.setValueAtTime(0, t);
        gain.gain.linearRampToValueAtTime(0.15, t + 0.025);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.55);
        osc.start(t);
        osc.stop(t + 0.55);
      });
      setTimeout(() => ctx.close(), 1600);
    } catch (_) {}
  }

  // Announce portal readiness after the card has entered the page.
  function setIdleSoon() {
    setTimeout(() => {
      DOM.mediaContainer?.classList.add("idle");
      document.dispatchEvent(new Event("chs:portal-ready"));
    }, 500);
  }

  // ------------------------------------------------
  // BTC cache
  // ------------------------------------------------
  const BTC_CACHE_KEY = "chs_btc_cache_v1";
  const BTC_CACHE_TTL_MS = 60 * 1000;

  function getCachedBTC() {
    try {
      const raw = localStorage.getItem(BTC_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (!parsed?.ts || !parsed?.data) return null;
      if (Date.now() - parsed.ts > BTC_CACHE_TTL_MS) return null;
      return parsed.data;
    } catch {
      return null;
    }
  }

  function setCachedBTC(data) {
    try {
      localStorage.setItem(BTC_CACHE_KEY, JSON.stringify({ ts: Date.now(), data }));
    } catch {}
  }

  function renderBTC(payload) {
    const btc = payload?.btc;
    const details = payload?.details || {};
    if (!btc) return;

    if (DOM.btcMainPrice) {
      DOM.btcMainPrice.textContent =
        "$" + btc.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }

    const changePercent = btc.usd_24h_change || 0;
    if (DOM.btc24hChange) {
      DOM.btc24hChange.textContent = (changePercent >= 0 ? "+" : "") + changePercent.toFixed(2) + "%";
      DOM.btc24hChange.className = "btc-stat-value " + (changePercent >= 0 ? "positive" : "negative");
    }

    const high = details?.high_24h?.usd;
    const low = details?.low_24h?.usd;

    if (DOM.btc24hHigh) {
      DOM.btc24hHigh.textContent =
        typeof high === "number"
          ? "$" + high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "--";
    }

    if (DOM.btc24hLow) {
      DOM.btc24hLow.textContent =
        typeof low === "number"
          ? "$" + low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
          : "--";
    }

    const marketCap = btc.usd_market_cap || 0;
    if (DOM.btcMarketCap) DOM.btcMarketCap.textContent = "$" + (marketCap / 1e9).toFixed(2) + "B";

    const volume = btc.usd_24h_vol || 0;
    if (DOM.btcVolume) DOM.btcVolume.textContent = "$" + (volume / 1e9).toFixed(2) + "B";

    const updateTime = new Date((btc.last_updated_at || 0) * 1000);
    if (DOM.btcLastUpdate) {
      DOM.btcLastUpdate.textContent = updateTime.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      });
    }
  }

  async function fetchBTCData() {
    const cached = getCachedBTC();
    if (cached) {
      renderBTC(cached);
      if (DOM.btcLoading) DOM.btcLoading.style.display = "none";
      if (DOM.btcContent) DOM.btcContent.style.display = "block";
      return;
    }

    try {
      const response = await fetch(
        "https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd&include_24hr_change=true&include_24hr_vol=true&include_market_cap=true&include_last_updated_at=true",
        { cache: "no-store" }
      );
      const data = await response.json();
      if (!data?.bitcoin) throw new Error("No bitcoin data returned");

      let details = null;
      try {
        const detailResponse = await fetch(
          "https://api.coingecko.com/api/v3/coins/bitcoin?localization=false&tickers=false&community_data=false&developer_data=false",
          { cache: "no-store" }
        );
        const detailData = await detailResponse.json();
        details = detailData?.market_data || null;
      } catch {
        details = null;
      }

      const merged = { btc: data.bitcoin, details };
      setCachedBTC(merged);
      renderBTC(merged);

      setTimeout(() => {
        if (DOM.btcLoading) DOM.btcLoading.style.display = "none";
        if (DOM.btcContent) DOM.btcContent.style.display = "block";
      }, 200);
    } catch (err) {
      console.error("[PORTAL] Error fetching BTC data:", err);
      if (DOM.btcLoading) DOM.btcLoading.textContent = "ERROR LOADING DATA";

      setTimeout(() => {
        if (DOM.btcLoading) DOM.btcLoading.style.display = "none";
        if (DOM.btcContent) DOM.btcContent.style.display = "block";
        if (DOM.btcMainPrice) DOM.btcMainPrice.textContent = "DATA UNAVAILABLE";
      }, 400);
    }
  }

  window.fetchBTCData = fetchBTCData;

  // ------------------------------------------------
  // Matrix animation (RAF + pause)
  // ------------------------------------------------
  let matrixRaf = null;
  let matrixRunning = false;
  let matrixCtx = null;
  let drops = [];
  let columns = 0;

  const btcChars = "₿$0123456789BITCOIN.";

  function matrixResize() {
    if (!DOM.matrixCanvas) return;
    DOM.matrixCanvas.width = window.innerWidth;
    DOM.matrixCanvas.height = window.innerHeight;
    columns = Math.floor(DOM.matrixCanvas.width / 20);
    drops = Array(columns).fill(1);
  }

  function matrixFrame() {
    if (!matrixRunning || !matrixCtx || !DOM.matrixCanvas) return;

    matrixCtx.fillStyle = "rgba(0, 0, 0, 0.05)";
    matrixCtx.fillRect(0, 0, DOM.matrixCanvas.width, DOM.matrixCanvas.height);

    matrixCtx.fillStyle = "#00ff00";
    matrixCtx.font = "15px Courier New";

    for (let i = 0; i < drops.length; i++) {
      const text = btcChars[Math.floor(Math.random() * btcChars.length)];
      matrixCtx.fillText(text, i * 20, drops[i] * 20);

      if (drops[i] * 20 > DOM.matrixCanvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }

    matrixRaf = requestAnimationFrame(matrixFrame);
  }

  function startMatrixRain() {
    if (!DOM.matrixCanvas) return;

    matrixCtx = DOM.matrixCanvas.getContext("2d");
    matrixResize();

    matrixRunning = true;
    if (matrixRaf) cancelAnimationFrame(matrixRaf);
    matrixRaf = requestAnimationFrame(matrixFrame);

    setTimeout(() => DOM.btcDataContainer?.classList.add("visible"), 1500);
  }

  function stopMatrixRain() {
    matrixRunning = false;
    if (matrixRaf) cancelAnimationFrame(matrixRaf);
    matrixRaf = null;
  }

  // ------------------------------------------------
  // BTC Overlay: inert + focus restore (fixes aria-hidden warning)
  // ------------------------------------------------
  let btcLastFocusEl = null;

  function isBTCOpen() {
    return !!(DOM.btcOverlay && !DOM.btcOverlay.hidden && DOM.btcOverlay.classList.contains("active"));
  }

  function openMatrixBTC(triggerEl) {
    if (!DOM.btcOverlay) return;
    if (isBTCOpen()) return;

    btcLastFocusEl = triggerEl || document.activeElement;

    // Make visible + interactive
    DOM.btcOverlay.hidden = false;
    DOM.btcOverlay.inert = false;
    DOM.btcOverlay.classList.add("active");
    DOM.btcOverlay.setAttribute("aria-hidden", "false");

    // Focus close
    requestAnimationFrame(() => {
      try {
        DOM.btcCloseBtn?.focus();
      } catch (_) {}
    });

    playSoundById("cardflipSound");
    startMatrixRain();
    fetchBTCData();
  }

  function closeMatrixBTC() {
    if (!DOM.btcOverlay) return;
    if (!isBTCOpen()) return;

    // Stop animation first
    stopMatrixRain();

    // Move focus OUT before hiding/inerting
    try {
      if (btcLastFocusEl && typeof btcLastFocusEl.focus === "function") btcLastFocusEl.focus();
      else document.body?.focus?.();
    } catch (_) {}

    // Hide interaction
    DOM.btcOverlay.classList.remove("active");
    DOM.btcOverlay.setAttribute("aria-hidden", "true");
    DOM.btcOverlay.inert = true;

    // Reset UI after transition
    setTimeout(() => {
      DOM.btcOverlay.hidden = true;

      DOM.btcDataContainer?.classList.remove("visible");
      if (DOM.btcLoading) {
        DOM.btcLoading.style.display = "block";
        DOM.btcLoading.textContent = "LOADING BTC DATA...";
      }
      if (DOM.btcContent) DOM.btcContent.style.display = "none";

      if (DOM.matrixCanvas) {
        DOM.matrixCanvas.getContext("2d")?.clearRect(0, 0, DOM.matrixCanvas.width, DOM.matrixCanvas.height);
      }
    }, 250);
  }

  // Pause matrix if tab hidden while overlay open
  document.addEventListener("visibilitychange", () => {
    if (!isBTCOpen()) return;
    if (document.hidden) stopMatrixRain();
    else startMatrixRain();
  });

  window.addEventListener("resize", () => {
    if (matrixRunning) matrixResize();
  });

  // ------------------------------------------------
  // Events feed loader (no polling)
  // ------------------------------------------------
  async function loadEventsFeedModule() {
    if (typeof window.loadEvents === "function") return window.loadEvents;

    const module = await import("/assets/js/eventsFeed.js");
    if (module?.loadEvents) {
      window.loadEvents = module.loadEvents;
      return window.loadEvents;
    }
    return null;
  }

  // ------------------------------------------------
  // Portal interactions
  // ------------------------------------------------
  // ------------------------------------------------
  // Card destination panel
  // ------------------------------------------------
  let openCardDestination = () => false;

  function initCardDestinationPanel() {
    const stage = document.querySelector(".card-stage");
    const panel = document.getElementById("portal-view-panel");
    const title = document.getElementById("portal-view-title");
    const homeButton = document.getElementById("portal-view-home");
    const externalLink = document.getElementById("portal-view-external");
    const views = [...(panel?.querySelectorAll("[data-view]") || [])];
    const viewConfig = {
      events: { title: "Events" },
      buildspace: {
        title: "Buildspace",
        frame: document.getElementById("portal-buildspace-frame"),
        src: "https://deckerd451.github.io/innovation-engine/",
      },
      sandbox: {
        title: "Sandbox",
        frame: document.getElementById("portal-sandbox-frame"),
        src: "/experimental.html",
      },
      news: {
        title: "News",
        frame: document.getElementById("portal-news-frame"),
        src: "/news.html",
      },
      chat: {
        title: "Community Chat",
        frame: document.getElementById("portal-chat-frame"),
        src: "/bbs.html",
      },
    };
    if (!stage || !panel || !title || !homeButton || !externalLink) return () => false;

    let returnFocus = null;
    let eventsLoaded = false;

    function updateBuildspaceAccess() {
      const authorized = window.__CH_MEMBER_AUTH__ === true;
      const gate = document.getElementById("portal-buildspace-auth-gate");
      const frame = viewConfig.buildspace.frame;
      const status = document.getElementById("portal-buildspace-auth-status");
      if (gate) gate.hidden = authorized;
      if (frame) frame.hidden = !authorized;
      if (externalLink && viewConfig.buildspace.external) externalLink.hidden = !authorized;
      if (authorized && frame && !frame.hasAttribute("src")) frame.src = viewConfig.buildspace.src;
      if (status) {
        status.hidden = !authorized || !frame || !frame.hasAttribute("src");
        status.textContent = "Loading your signed-in member workspace…";
      }
    }

    function resetStage() {
      stage.classList.remove(
        "is-committing-up",
        "is-committing-right",
        "is-committing-down",
        "is-committing-left"
      );
      stage.style.removeProperty("--swipe-rotate-x");
      stage.style.removeProperty("--swipe-rotate-y");
      stage.style.removeProperty("--swipe-translate-x");
      stage.style.removeProperty("--swipe-translate-y");
      stage.style.removeProperty("--swipe-scale");
      stage.inert = false;
    }

    async function loadEventsIntoPanel() {
      if (eventsLoaded) return;
      eventsLoaded = true;
      const list = document.getElementById("portal-events-list");
      if (list) list.textContent = "Loading events…";
      try {
        const loadEvents = await loadEventsFeedModule();
        if (typeof loadEvents === "function") {
          await loadEvents({
            listId: "portal-events-list",
            limit: 10,
            emptyText: "No upcoming events found. Check back later!",
            errorText: "The event list could not load. Please try again later.",
          });
        }
      } catch {
        if (list) list.textContent = "The event list could not load. Please try again later.";
      }
    }

    function show(viewName, direction, trigger = document.activeElement) {
      const config = viewConfig[viewName];
      const content = panel.querySelector(`[data-view="${viewName}"]`);
      if (!config || !content) return false;

      returnFocus = trigger instanceof HTMLElement ? trigger : null;
      title.textContent = config.title;
      externalLink.hidden = !config.external;
      if (config.external) {
        externalLink.href = config.external;
        externalLink.setAttribute("aria-label", config.externalLabel || `Open ${config.title} separately`);
      } else {
        externalLink.removeAttribute("href");
      }

      views.forEach((view) => { view.hidden = view !== content; });
      const guide = document.getElementById("portal-discovery-guide");
      if (viewName === "buildspace") updateBuildspaceAccess();

      if (guide) {
        guide.hidden = true;
        guide.classList.remove("is-visible");
      }
      panel.dataset.origin = direction || "right";
      panel.classList.remove("is-open");
      panel.hidden = false;
      panel.inert = false;
      panel.setAttribute("aria-hidden", "false");
      stage.inert = true;
      stage.classList.add(`is-committing-${direction || "right"}`);

      requestAnimationFrame(() => panel.classList.add("is-open"));
      window.setTimeout(() => homeButton.focus({ preventScroll: true }), 360);

      if (config.frame && viewName !== "buildspace" && !config.frame.hasAttribute("src")) {
        config.frame.src = config.src;
      }
      if (viewName === "events") loadEventsIntoPanel();
      return true;
    }

    function close() {
      if (panel.hidden) return;
      panel.classList.remove("is-open");
      panel.inert = true;
      panel.setAttribute("aria-hidden", "true");
      resetStage();
      window.setTimeout(() => {
        panel.hidden = true;
        panel.removeAttribute("data-origin");
        if (returnFocus?.isConnected) returnFocus.focus({ preventScroll: true });
        else document.querySelector('.icons-container [data-portal-shortcut]')?.focus({ preventScroll: true });
        returnFocus = null;
      }, 360);
    }

    document.getElementById("portal-buildspace-sign-in")?.addEventListener("click", (event) => {
      show("chat", "left", event.currentTarget);
    });
    window.addEventListener("ch:member-auth-changed", () => {
      if (!panel.hidden && panel.querySelector('[data-view="buildspace"]:not([hidden])')) {
        updateBuildspaceAccess();
      }
    });

    homeButton.addEventListener("click", close);
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !panel.hidden) close();
    });

    return (viewName, direction, trigger) => show(viewName, direction, trigger);
  }

  // ------------------------------------------------
  // Directional card gestures
  // ------------------------------------------------
  function initCardGestures() {
    const stage = document.querySelector(".card-stage");
    const guide = document.getElementById("portal-discovery-guide");
    if (!stage || !guide) return;

    const destinations = {
      up: { label: "Events", view: "events" },
      right: { label: "Sandbox", view: "sandbox" },
      down: { label: "News", view: "news" },
      left: { label: "Community Chat", view: "chat" },
    };

    let gesture = null;
    let resetGuideTimer = null;

    const hideGuide = () => {
      guide.classList.remove("is-visible");
      resetGuideTimer = window.setTimeout(() => { guide.hidden = true; }, 240);
    };
    const showPreview = (direction) => {
      const destination = destinations[direction];
      if (!destination) return;
      window.clearTimeout(resetGuideTimer);
      const arrow = { up: "↑", right: "→", down: "↓", left: "←" }[direction];
      guide.textContent = `${arrow} ${destination.label} — release to open`;
      guide.hidden = false;
      requestAnimationFrame(() => guide.classList.add("is-visible"));
    };
    const clearDrag = () => {
      stage.classList.remove("is-dragging");
      stage.style.removeProperty("--swipe-rotate-x");
      stage.style.removeProperty("--swipe-rotate-y");
      stage.style.removeProperty("--swipe-translate-x");
      stage.style.removeProperty("--swipe-translate-y");
      stage.style.removeProperty("--swipe-scale");
    };
    const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
    const setTilt = (dx, dy, direction) => {
      const rect = stage.getBoundingClientRect();
      const horizontal = direction === "left" || direction === "right";
      const primary = horizontal
        ? clamp((dx / Math.max(rect.width, 1)) * 112, -48, 48)
        : clamp((-dy / Math.max(rect.height, 1)) * 112, -48, 48);
      const secondary = horizontal
        ? clamp((-dy / Math.max(rect.height, 1)) * 24, -12, 12)
        : clamp((dx / Math.max(rect.width, 1)) * 24, -12, 12);
      const rotateX = horizontal ? secondary : primary;
      const rotateY = horizontal ? primary : secondary;
      stage.style.setProperty("--swipe-rotate-x", `${rotateX}deg`);
      stage.style.setProperty("--swipe-rotate-y", `${rotateY}deg`);
      stage.style.setProperty("--swipe-translate-x", `${clamp(dx * 0.14, -42, 42)}px`);
      stage.style.setProperty("--swipe-translate-y", `${clamp(dy * 0.14, -42, 42)}px`);
      const progress = Math.min(1, Math.max(Math.abs(dx) / Math.max(rect.width, 1), Math.abs(dy) / Math.max(rect.height, 1)));
      stage.style.setProperty("--swipe-scale", String(1 - progress * 0.035));
    };
    const getDirection = (dx, dy) => {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return null;
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
      return dy > 0 ? "down" : "up";
    };
    const openDestination = (direction) => {
      const destination = destinations[direction];
      if (!destination) return;
      if (typeof gtag === "function") {
        gtag("event", "portal_swipe_open", { direction, destination: destination.label });
      }
      openCardDestination(destination.view, direction, document.activeElement);
    };

    stage.addEventListener("dragstart", (event) => event.preventDefault());

    stage.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0 || stage.inert) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        startTime: event.timeStamp,
        lastX: event.clientX,
        lastY: event.clientY,
        lastTime: event.timeStamp,
        velocityX: 0,
        velocityY: 0,
        direction: null,
        moved: false,
      };
    });

    stage.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const direction = getDirection(dx, dy);
      const elapsed = event.timeStamp - gesture.lastTime;
      if (elapsed > 0) {
        gesture.velocityX = (event.clientX - gesture.lastX) / elapsed;
        gesture.velocityY = (event.clientY - gesture.lastY) / elapsed;
      }
      gesture.lastX = event.clientX;
      gesture.lastY = event.clientY;
      gesture.lastTime = event.timeStamp;
      if (!direction) return;

      if (!gesture.moved) {
        try { stage.setPointerCapture(event.pointerId); } catch {}
      }
      gesture.moved = true;
      gesture.direction = direction;
      stage.classList.add("is-dragging");
      setTilt(dx, dy, direction);
      showPreview(direction);
    });

    stage.addEventListener("pointerup", (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const current = gesture;
      gesture = null;
      const deltaX = event.clientX - current.startX;
      const deltaY = event.clientY - current.startY;
      const direction = getDirection(deltaX, deltaY);
      const rect = stage.getBoundingClientRect();
      const horizontal = direction === "left" || direction === "right";
      const extent = horizontal ? rect.width : rect.height;
      const distance = horizontal ? Math.abs(deltaX) : Math.abs(deltaY);
      const threshold = Math.max(28, Math.min(60, extent * 0.08));
      const directedVelocity = horizontal ? current.velocityX : current.velocityY;
      const velocity = direction === "left" || direction === "up" ? -directedVelocity : directedVelocity;
      const quickFlick = distance >= 24 && velocity >= 0.55;

      if (!direction || (distance < threshold && !quickFlick)) {
        clearDrag();
        hideGuide();
        return;
      }

      setTilt(deltaX, deltaY, direction);
      stage.classList.remove("is-dragging");
      stage.classList.add(`is-committing-${direction}`);
      guide.textContent = `Opening ${destinations[direction].label}…`;
      window.setTimeout(hideGuide, 280);
      window.setTimeout(() => openDestination(direction), 360);
    });

    const cancelGesture = (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      gesture = null;
      clearDrag();
      hideGuide();
    };
    stage.addEventListener("pointercancel", cancelGesture);
    stage.addEventListener("lostpointercapture", cancelGesture);
  }

  // ------------------------------------------------
  // Events modal controls
  // ------------------------------------------------
  function initEventsModal() {
    if (!DOM.openCalendarBtn || !DOM.eventsOverlay) return;

    DOM.openCalendarBtn.addEventListener("click", async (e) => {
      e.preventDefault();
      DOM.eventsOverlay.classList.add("active");

      try {
        const fn = await loadEventsFeedModule();
        if (typeof fn === "function") fn();
      } catch (err) {
        console.error("[PORTAL] Failed to load events feed on demand:", err);
      }
    });

    DOM.eventsCloseBtn?.addEventListener("click", () => DOM.eventsOverlay?.classList.remove("active"));

    DOM.eventsOverlay.addEventListener("click", (e) => {
      if (e.target === DOM.eventsOverlay) DOM.eventsOverlay.classList.remove("active");
    });
  }

  // ------------------------------------------------
  // BTC overlay close controls
  // ------------------------------------------------
  function initBTCModalControls() {
    DOM.btcCloseBtn?.addEventListener("click", closeMatrixBTC);

    document.addEventListener("keydown", (e) => {
      if (e.key !== "Escape") return;
      if (!isBTCOpen()) return;
      closeMatrixBTC();
    });

    DOM.btcOverlay?.addEventListener("click", (e) => {
      if (e.target === DOM.btcOverlay) closeMatrixBTC();
    });
  }

  // ------------------------------------------------
  // Boot
  // ------------------------------------------------
  window.addEventListener("DOMContentLoaded", () => {
    openCardDestination = initCardDestinationPanel();
    initCardGestures();
    initQuickAccessTooltips();
    setIdleSoon();
    initEventsModal();
    initBTCModalControls();

    // Ensure BTC overlay is safely inert/hidden when not active (in case HTML changed)
    if (DOM.btcOverlay && !DOM.btcOverlay.classList.contains("active")) {
      DOM.btcOverlay.hidden = true;
      DOM.btcOverlay.inert = true;
      DOM.btcOverlay.setAttribute("aria-hidden", "true");
    }

    // Warm-load events module after idle, but don't block paint
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => loadEventsFeedModule().catch(() => {}), { timeout: 1500 });
    } else {
      setTimeout(() => loadEventsFeedModule().catch(() => {}), 1200);
    }
  });
})();
