// ================================================================
// CharlestonHacks Portal Controller
// File: /assets/js/portal.js
// ================================================================

(() => {
  "use strict";

  const mobilePortalMedia = window.matchMedia("(max-width: 768px)");
  if (!mobilePortalMedia.matches) {
    mobilePortalMedia.addEventListener("change", (event) => {
      if (event.matches) window.location.reload();
    });
    return;
  }

  const VERSION = "portal-js-v14-iframe-touch-swipe-20261028";
  console.log(`[PORTAL] loaded ${VERSION}`);

  // ------------------------------------------------
  // DOM helpers
  // ------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  let featureSwiper = null;
  let featureIndexes = new Map();
  let activeFeatureId = "home";
  let updateBuildspaceAccess = () => {};
  let loadEventsIntoPanel = () => {};

  function activatePortal(portalId, trigger) {
    const sounds = {
      innovation: null, events: "chime", news: "chime", sandbox: "chime",
      chat: "chime", poster: "chime", btc: null, swag: "chime",
      sponsor: "keys", game: "chime", newsletter: "chime",
    };
    if (typeof gtag === "function") gtag("event", "portal_click", { portal_id: portalId });
    if (portalId === "innovation") playPortalActivationSound();
    else if (sounds[portalId]) playSoundById(sounds[portalId] + "Sound");

    const showFeature = window.__CH_SHOW_PORTAL_FEATURE__;
    if (typeof showFeature === "function") showFeature(portalId, trigger);
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
    const bounds = DOM.matrixCanvas.parentElement?.getBoundingClientRect();
    DOM.matrixCanvas.width = Math.max(1, Math.round(bounds?.width || window.innerWidth));
    DOM.matrixCanvas.height = Math.max(1, Math.round(bounds?.height || window.innerHeight));
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
  let btcEmbeddedMode = false;
  let btcCloseTimer = null;

  function isBTCOpen() {
    return !!(DOM.btcOverlay && !DOM.btcOverlay.hidden && DOM.btcOverlay.classList.contains("active"));
  }

  function openMatrixBTC(triggerEl, options = {}) {
    if (!DOM.btcOverlay) return;
    if (btcCloseTimer !== null) {
      window.clearTimeout(btcCloseTimer);
      btcCloseTimer = null;
    }
    btcEmbeddedMode = options.embedded === true;
    if (isBTCOpen()) return;

    btcLastFocusEl = triggerEl || (btcEmbeddedMode ? null : document.activeElement);
    DOM.btcOverlay.hidden = false;
    DOM.btcOverlay.inert = false;
    DOM.btcOverlay.classList.add("active");
    DOM.btcOverlay.setAttribute("aria-hidden", "false");
    DOM.btcOverlay.setAttribute("aria-modal", btcEmbeddedMode ? "false" : "true");

    if (!btcEmbeddedMode) {
      requestAnimationFrame(() => {
        try { DOM.btcCloseBtn?.focus(); } catch (_) {}
      });
    }

    playSoundById("cardflipSound");
    startMatrixRain();
    fetchBTCData();
  }

  function closeMatrixBTC(options = {}) {
    if (!DOM.btcOverlay || !isBTCOpen()) return;
    const fromSwipe = options.fromSwipe === true;
    stopMatrixRain();
    if (!fromSwipe && !btcEmbeddedMode) {
      try {
        if (btcLastFocusEl && typeof btcLastFocusEl.focus === "function") btcLastFocusEl.focus();
        else document.body?.focus?.();
      } catch (_) {}
    }
    DOM.btcOverlay.classList.remove("active");
    DOM.btcOverlay.setAttribute("aria-hidden", "true");
    DOM.btcOverlay.inert = true;
    btcCloseTimer = window.setTimeout(() => {
      DOM.btcOverlay.hidden = true;
      DOM.btcDataContainer?.classList.remove("visible");
      if (DOM.btcLoading) {
        DOM.btcLoading.style.display = "block";
        DOM.btcLoading.textContent = "LOADING BTC DATA...";
      }
      if (DOM.btcContent) DOM.btcContent.style.display = "none";
      if (DOM.matrixCanvas) DOM.matrixCanvas.getContext("2d")?.clearRect(0, 0, DOM.matrixCanvas.width, DOM.matrixCanvas.height);
      btcCloseTimer = null;
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
  // Swipe deck with live feature content inside each card
  // ------------------------------------------------
  const features = [
    { id: "events", title: "Events", icon: "fas fa-calendar-days", description: "Find upcoming CharlestonHacks events and community meetups.", view: "events" },
    { id: "sandbox", title: "Sandbox", icon: "fas fa-flask", description: "Experimental projects and prototypes.", view: "sandbox" },
    { id: "news", title: "News", icon: "fas fa-newspaper", description: "CharlestonHacks updates and community stories.", view: "news" },
    { id: "chat", title: "Community Chat", icon: "fas fa-comments", description: "Meet other builders and continue the conversation.", view: "chat" },
    { id: "innovation", title: "Buildspace", icon: "fas fa-people-arrows", description: "Projects, connections, and collaboration.", view: "buildspace" },
    { id: "poster", title: "Event Poster", icon: "fas fa-image", description: "View the event poster.", src: "/Poster.html" },
    { id: "btc", title: "Bitcoin Tracker", icon: "fab fa-bitcoin", description: "Live Bitcoin price and market data." },
    { id: "swag", title: "Swag Vote", icon: "fas fa-shirt", description: "Browse and vote on CharlestonHacks swag.", src: "/swag.html" },
    { id: "sponsor", title: "Sponsorship", icon: "fas fa-hand-holding-heart", description: "Support CharlestonHacks and its programs.", src: "/donations.html" },
    { id: "game", title: "Avatar Matching Game", icon: "fas fa-gamepad", description: "Play the community avatar matching game.", src: "/cardmatchgame.html" },
    { id: "newsletter", title: "Newsletter", icon: "fas fa-envelope-open-text", description: "Get CharlestonHacks news and event updates.", src: "/subscribe.html" },
  ];

  function initFeatureViews() {
    const sourcePanel = document.getElementById("portal-view-panel");
    const viewNodes = new Map();
    sourcePanel?.querySelectorAll("[data-view]").forEach((node) => {
      viewNodes.set(node.dataset.view, node);
    });

    const buildspaceGate = document.getElementById("portal-buildspace-auth-gate");
    buildspaceGate?.querySelector("button")?.addEventListener("click", (event) => {
      window.__CH_SHOW_PORTAL_FEATURE__?.("chat", event.currentTarget);
    });

    updateBuildspaceAccess = () => {
      const authorized = window.__CH_MEMBER_AUTH__ === true;
      const gate = document.getElementById("portal-buildspace-auth-gate");
      const frame = document.getElementById("portal-buildspace-frame");
      const status = document.getElementById("portal-buildspace-auth-status");
      if (gate) gate.hidden = authorized;
      if (frame) frame.hidden = !authorized;
      if (authorized && activeFeatureId === "innovation" && frame && !frame.hasAttribute("src")) {
        frame.addEventListener("load", () => enableIframeSwipeBridge(frame), { once: true });
        frame.src = "https://deckerd451.github.io/innovation-engine/";
      }
      if (status) {
        status.hidden = !authorized || !frame || !frame.hasAttribute("src");
        status.textContent = "Loading your signed-in member workspace…";
      }
    };

    loadEventsIntoPanel = async () => {
      const list = document.getElementById("portal-events-list");
      if (!list || list.dataset.loaded === "true") return;
      list.dataset.loaded = "true";
      list.textContent = "Loading events…";
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
        list.textContent = "The event list could not load. Please try again later.";
      }
    };

    window.addEventListener("ch:member-auth-changed", updateBuildspaceAccess);
    return viewNodes;
  }

  function enableIframeSwipeBridge(frame) {
    if (frame.dataset.swipeBridgeAttached === "true") return;
    try {
      const frameDocument = frame.contentDocument;
      if (!frameDocument) return;
      frame.dataset.swipeBridgeAttached = "true";

      // Keep vertical page scrolling available, while reserving horizontal
      // gestures for the feature deck even when the gesture starts in an iframe.
      const swipeStyle = frameDocument.createElement("style");
      swipeStyle.textContent = `
        html, body {
          max-width: 100% !important;
          overflow-x: hidden !important;
          overscroll-behavior-x: none !important;
          touch-action: pan-y !important;
        }
        *, *::before, *::after {
          overscroll-behavior-x: none !important;
          touch-action: pan-y !important;
        }
      `;
      (frameDocument.head || frameDocument.documentElement)?.append(swipeStyle);

      let gesture = null;
      let suppressNextClick = false;
      let clickSuppressionTimer = null;

      const beginGesture = (x, y) => {
        gesture = { x, y, horizontal: false };
      };

      const moveGesture = (x, y, event) => {
        if (!gesture) return;
        const deltaX = x - gesture.x;
        const deltaY = y - gesture.y;
        if (Math.abs(deltaX) < 10 || Math.abs(deltaX) < Math.abs(deltaY) * 1.2) return;

        gesture.horizontal = true;
        // Touch listeners are explicitly non-passive so iOS Safari can stop
        // the embedded page from panning sideways once the intent is clear.
        if (event.cancelable) event.preventDefault();
        event.stopPropagation();
      };

      const finishGesture = (x, y, event) => {
        if (!gesture) return;
        const deltaX = x - gesture.x;
        const deltaY = y - gesture.y;
        const isHorizontalSwipe =
          Math.abs(deltaX) >= 42 &&
          Math.abs(deltaX) >= Math.abs(deltaY) * 1.2;
        const wasHorizontal = gesture.horizontal || isHorizontalSwipe;
        gesture = null;
        if (!wasHorizontal || !isHorizontalSwipe || !featureSwiper) return;

        const targetIndex = featureSwiper.activeIndex + (deltaX < 0 ? 1 : -1);
        if (targetIndex < 0 || targetIndex >= featureSwiper.slides.length) return;

        suppressNextClick = true;
        if (event?.cancelable) event.preventDefault();
        event?.stopPropagation();
        featureSwiper.slideTo(targetIndex);

        if (clickSuppressionTimer !== null) window.clearTimeout(clickSuppressionTimer);
        clickSuppressionTimer = window.setTimeout(() => {
          suppressNextClick = false;
          clickSuppressionTimer = null;
        }, 450);
      };

      // Use Pointer Events for mouse/pen. Mobile touch is handled separately:
      // Safari may cancel pointer sequences when the gesture begins in an iframe.
      frameDocument.addEventListener("pointerdown", (event) => {
        if (event.pointerType === "touch" || event.isPrimary === false || event.button > 0) return;
        beginGesture(event.clientX, event.clientY);
      }, true);
      frameDocument.addEventListener("pointermove", (event) => {
        if (event.pointerType === "touch") return;
        moveGesture(event.clientX, event.clientY, event);
      }, { capture: true, passive: false });
      frameDocument.addEventListener("pointerup", (event) => {
        if (event.pointerType === "touch") return;
        finishGesture(event.clientX, event.clientY, event);
      }, true);
      frameDocument.addEventListener("pointercancel", (event) => {
        if (event.pointerType !== "touch") gesture = null;
      }, true);

      // Touch Events provide the reliable path on iPhone/iPad Safari. Ignore
      // additional contacts so pinch zoom and multi-touch gestures aren't swipes.
      frameDocument.addEventListener("touchstart", (event) => {
        if (event.touches.length !== 1) {
          gesture = null;
          return;
        }
        const touch = event.touches[0];
        beginGesture(touch.clientX, touch.clientY);
      }, { capture: true, passive: true });

      frameDocument.addEventListener("touchmove", (event) => {
        if (!gesture || event.touches.length !== 1) return;
        const touch = event.touches[0];
        moveGesture(touch.clientX, touch.clientY, event);
      }, { capture: true, passive: false });

      frameDocument.addEventListener("touchend", (event) => {
        if (!gesture) return;
        const touch = event.changedTouches[0];
        if (touch) finishGesture(touch.clientX, touch.clientY, event);
        else gesture = null;
      }, { capture: true, passive: false });

      frameDocument.addEventListener("touchcancel", () => { gesture = null; }, true);

      frameDocument.addEventListener("click", (event) => {
        if (!suppressNextClick) return;
        event.preventDefault();
        event.stopPropagation();
      }, true);
    } catch {
      // Cross-origin frames cannot expose their document; the card header remains swipeable.
    }
  }

  function initCardGestures(viewNodes) {
    const container = document.getElementById("portal-feature-swiper");
    const slidesContainer = document.getElementById("portal-feature-slides");
    const counter = document.getElementById("portal-feature-count");
    if (!container || !slidesContainer || !counter || typeof window.Swiper !== "function") return;

    featureIndexes = new Map(features.map((feature, index) => [feature.id, index + 1]));

    features.forEach((feature, index) => {
      const slide = document.createElement("div");
      slide.className = "swiper-slide portal-feature-slide";
      slide.setAttribute("aria-label", `Feature ${index + 1} of ${features.length}: ${feature.title}`);

      const card = document.createElement("article");
      card.className = "portal-feature-card";
      card.dataset.featureId = feature.id;

      const header = document.createElement("div");
      header.className = "portal-feature-header";
      header.setAttribute("aria-label", `Swipe area. ${feature.title}, feature ${index + 1} of ${features.length}`);

      const iconWrap = document.createElement("span");
      iconWrap.className = "portal-feature-icon";
      iconWrap.setAttribute("aria-hidden", "true");
      const icon = document.createElement("i");
      icon.className = feature.icon;
      iconWrap.append(icon);

      const heading = document.createElement("div");
      heading.className = "portal-feature-heading";
      const title = document.createElement("h2");
      title.className = "portal-feature-title";
      title.textContent = feature.title;
      const subtitle = document.createElement("span");
      subtitle.className = "portal-feature-subtitle";
      subtitle.textContent = "Swipe left or right to browse";
      heading.append(title, subtitle);

      const number = document.createElement("span");
      number.className = "portal-feature-number";
      number.textContent = `${String(index + 1).padStart(2, "0")} / ${String(features.length).padStart(2, "0")}`;
      header.append(iconWrap, heading, number);

      const content = document.createElement("div");
      content.className = "portal-feature-content";
      content.setAttribute("aria-label", `${feature.title} content`);

      const nativeView = feature.view ? viewNodes.get(feature.view) : null;
      if (nativeView) {
        nativeView.hidden = false;
        content.append(nativeView);
      } else if (feature.id === "btc") {
        const overlay = document.getElementById("matrix-btc-overlay");
        if (overlay) {
          overlay.classList.add("in-card");
          overlay.setAttribute("aria-modal", "false");
          overlay.setAttribute("role", "region");
          content.append(overlay);
        }
      } else {
        const frame = document.createElement("iframe");
        frame.title = `CharlestonHacks ${feature.title}`;
        frame.loading = "lazy";
        frame.referrerPolicy = "strict-origin-when-cross-origin";
        frame.dataset.src = feature.src;
        frame.setAttribute("allow", "fullscreen; clipboard-read; clipboard-write");
        content.append(frame);
      }

      card.append(header, content);
      slide.append(card);
      slidesContainer.append(slide);
    });

    document.getElementById("portal-view-panel")?.remove();

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    featureSwiper = new window.Swiper(container, {
      effect: "cards",
      direction: "horizontal",
      slidesPerView: 1,
      speed: reducedMotion ? 0 : 260,
      threshold: 4,
      touchAngle: 45,
      shortSwipes: true,
      longSwipes: true,
      longSwipesMs: 180,
      longSwipesRatio: 0.22,
      preventInteractionOnTransition: false,
      preventClicks: true,
      preventClicksPropagation: true,
      grabCursor: true,
      loop: false,
      keyboard: { enabled: true, onlyInViewport: true },
      a11y: { enabled: true },
      cardsEffect: {
        perSlideOffset: 6,
        perSlideRotate: 0,
        rotate: false,
        slideShadows: false,
      },
    });

    const syncDeck = () => {
      const activeIndex = featureSwiper.activeIndex;
      const feature = activeIndex === 0 ? null : features[activeIndex - 1];
      activeFeatureId = feature?.id || "home";
      counter.textContent = feature ? `${activeIndex} / ${features.length} · ${feature.title.toUpperCase()}` : "PORTAL";
      [...slidesContainer.children].forEach((slide, index) => {
        const active = index === activeIndex;
        slide.setAttribute("aria-hidden", active ? "false" : "true");
        slide.inert = !active;
      });

      if (isBTCOpen() && activeFeatureId !== "btc") closeMatrixBTC({ fromSwipe: true });
      if (!feature) return;

      if (feature.id === "events") loadEventsIntoPanel();
      if (feature.id === "innovation") updateBuildspaceAccess();
      if (feature.id === "btc" && DOM.btcOverlay) openMatrixBTC(null, { embedded: true });
      const activeCard = slidesContainer.children[activeIndex]?.querySelector(".portal-feature-card");
      const iframe = activeCard?.querySelector("iframe[data-src]");
      if (iframe && !iframe.hasAttribute("src")) {
        if (feature.id !== "innovation" || window.__CH_MEMBER_AUTH__ === true) {
          iframe.addEventListener("load", () => enableIframeSwipeBridge(iframe), { once: true });
          iframe.src = iframe.dataset.src;
        }
      } else if (iframe) {
        enableIframeSwipeBridge(iframe);
      }
    };

    window.__CH_SHOW_PORTAL_FEATURE__ = (featureId) => {
      const index = featureIndexes.get(featureId);
      if (Number.isInteger(index)) featureSwiper.slideTo(index);
    };

    featureSwiper.on("slideChange", syncDeck);
    syncDeck();
  }

  // ------------------------------------------------
  // Boot
  // ------------------------------------------------
  window.addEventListener("DOMContentLoaded", () => {
    const viewNodes = initFeatureViews();
    initCardGestures(viewNodes);
    initQuickAccessTooltips();
    setIdleSoon();

    if (DOM.btcOverlay && !DOM.btcOverlay.classList.contains("active")) {
      DOM.btcOverlay.hidden = true;
      DOM.btcOverlay.inert = true;
      DOM.btcOverlay.setAttribute("aria-hidden", "true");
    }
  });
})();
