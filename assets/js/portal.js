// ================================================================
// CharlestonHacks Portal Controller
// File: /assets/js/portal.js
// ================================================================

(() => {
  "use strict";

  const VERSION = "portal-js-v2-aria-inert-20260223-no-discovery-progress";
  console.log(`[PORTAL] loaded ${VERSION}`);

  // ------------------------------------------------
  // DOM helpers
  // ------------------------------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

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
  function initPortals() {
    const areas = $$(".clickable-area");

    areas.forEach((area) => {
      const portalId = area.dataset.portal;

      const showPortalInfo = () => {
        if (!DOM.infoLine || !DOM.infoText) return;
        DOM.infoText.textContent = area.dataset.info || "";
        DOM.infoLine.classList.add("visible");
      };
      const hidePortalInfo = () => DOM.infoLine?.classList.remove("visible");

      area.addEventListener("mouseenter", showPortalInfo);
      area.addEventListener("mouseleave", hidePortalInfo);
      area.addEventListener("focus", showPortalInfo);
      area.addEventListener("blur", hidePortalInfo);

      area.addEventListener("click", (e) => {
        e.preventDefault();

        if (typeof gtag === "function") {
          gtag("event", "portal_click", { portal_id: portalId });
        }

       // BTC portal opens the BTC overlay (top-right)
if (portalId === "btc") {
  openMatrixBTC(area); // pass trigger for focus restore
  return;
}
        
        if (portalId === "innovation") {
          playPortalActivationSound();
        } else {
          const soundKey = area.dataset.sound;
          if (soundKey) playSoundById(soundKey + "Sound");
        }

        const url = area.dataset.url;
        if (url && url !== "#") {
          const destination = new URL(url, window.location.href);
          if (destination.origin === window.location.origin) {
            destination.searchParams.set("returnTo", "hub");
          }
          setTimeout(() => { window.location.href = destination.href; }, 200);
        }
      });

      area.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          area.click();
        }
      });
    });
  }

  // ------------------------------------------------
  // Directional card gestures
  // ------------------------------------------------
  function initCardGestures() {
    const stage = document.querySelector(".card-stage");
    const guide = document.getElementById("portal-discovery-guide");
    if (!stage || !guide) return;

    const portal = (id) => stage.querySelector(`.clickable-area[data-portal="${id}"]`);
    const destinations = {
      up: { label: "Events calendar", action: "calendar" },
      right: { label: "Buildspace", action: "portal", portal: "innovation" },
      down: { label: "News", action: "portal", portal: "news" },
      left: { label: "Community Chat", action: "navigate", url: "/bbs.html" },
    };

    let gesture = null;
    let suppressClickTarget = null;
    let suppressClickUntil = 0;
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
    };
    const setTilt = (dx, dy) => {
      const rect = stage.getBoundingClientRect();
      const rotateY = Math.max(-14, Math.min(14, dx / Math.max(rect.width * 0.45, 1) * 14));
      const rotateX = Math.max(-14, Math.min(14, -dy / Math.max(rect.height * 0.45, 1) * 14));
      stage.style.setProperty("--swipe-rotate-x", `${rotateX}deg`);
      stage.style.setProperty("--swipe-rotate-y", `${rotateY}deg`);
    };
    const getDirection = (dx, dy) => {
      if (Math.max(Math.abs(dx), Math.abs(dy)) < 12) return null;
      if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
      return dy > 0 ? "down" : "up";
    };
    const resetToHome = () => {
      stage.classList.remove("is-committing-up", "is-committing-right", "is-committing-down", "is-committing-left");
      clearDrag();
    };
    const openDestination = (direction) => {
      const destination = destinations[direction];
      if (!destination) return;
      if (destination.action === "calendar") {
        resetToHome();
        window.setTimeout(() => DOM.openCalendarBtn?.click(), 140);
      } else if (destination.action === "portal") {
        portal(destination.portal)?.click();
      } else {
        if (typeof gtag === "function") {
          gtag("event", "portal_swipe_open", { direction, destination: destination.label });
        }
        window.location.href = new URL(destination.url, window.location.href).href;
      }
    };

    stage.addEventListener("pointerdown", (event) => {
      if (!event.isPrimary || event.button !== 0 || stage.inert) return;
      gesture = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
        direction: null,
        moved: false,
        clickTarget: event.target.closest?.(".clickable-area") || null,
      };
    });

    stage.addEventListener("pointermove", (event) => {
      if (!gesture || gesture.pointerId !== event.pointerId) return;
      const dx = event.clientX - gesture.startX;
      const dy = event.clientY - gesture.startY;
      const direction = getDirection(dx, dy);
      if (!direction) return;

      if (!gesture.moved) {
        try { stage.setPointerCapture(event.pointerId); } catch {}
      }
      gesture.moved = true;
      gesture.direction = direction;
      stage.classList.add("is-dragging");
      setTilt(dx, dy);
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
      const extent = direction === "left" || direction === "right" ? rect.width : rect.height;
      const distance = direction === "left" || direction === "right" ? Math.abs(deltaX) : Math.abs(deltaY);
      const threshold = Math.max(48, Math.min(92, extent * 0.16));

      if (!direction || distance < threshold) {
        clearDrag();
        hideGuide();
        return;
      }

      if (current.clickTarget) {
        suppressClickTarget = current.clickTarget;
        suppressClickUntil = Date.now() + 600;
      }
      stage.classList.remove("is-dragging");
      clearDrag();
      stage.classList.add(`is-committing-${direction}`);
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

    stage.addEventListener("click", (event) => {
      if (
        suppressClickTarget &&
        (event.target === suppressClickTarget || suppressClickTarget.contains(event.target)) &&
        event.detail > 0 &&
        Date.now() < suppressClickUntil
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        suppressClickTarget = null;
        suppressClickUntil = 0;
      }
    }, true);
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
    initPortals();
    initCardGestures();
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
