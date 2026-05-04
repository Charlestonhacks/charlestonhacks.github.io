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
    body: document.body,

    // overlays
    splash: $("#splash-overlay"),
    tutorial: $("#tutorial-overlay"),

    // splash buttons
    communityBtn: $("#community-site-btn"),
    publicBtn: $("#public-site-btn"),
    dontShowAgain: $("#dont-show-again"),
    skipTutorial: $("#skip-tutorial"),

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

  // ------------------------------------------------
  // Splash + Tutorial
  // ------------------------------------------------
  const SPLASH_KEY = "chs_splash_seen_once";
  const TUTORIAL_KEY = "chs_tutorial_completed";

  function setIdleSoon() {
    setTimeout(() => {
      DOM.mediaContainer?.classList.add("idle");
    }, 500);
  }

  function checkTutorial() {
    if (!DOM.tutorial) return;

    if (localStorage.getItem(TUTORIAL_KEY) !== "true") {
      setTimeout(() => DOM.tutorial.classList.add("active"), 300);
    } else {
      setIdleSoon();
    }
  }

  function hideSplash(immediate = false) {
    if (!DOM.splash) return;

    DOM.splash.classList.add("fade-out");
    DOM.body.classList.remove("splash-active");

    setTimeout(() => {
      if (DOM.splash) DOM.splash.style.display = "none";
      checkTutorial();
    }, immediate ? 0 : 600);
  }

  function initSplashTutorial() {
    const splashSeen = localStorage.getItem(SPLASH_KEY) === "true";

    function dismissSplash() {
      if (DOM.dontShowAgain?.checked) localStorage.setItem(SPLASH_KEY, "true");
      hideSplash(false);
    }

    function closeTutorial() {
      DOM.tutorial?.classList.remove("active");
      localStorage.setItem(TUTORIAL_KEY, "true");
      setIdleSoon();
    }

    DOM.skipTutorial?.addEventListener("click", closeTutorial);

    if (splashSeen) {
      hideSplash(true);
    } else {
      if (DOM.splash) {
        DOM.splash.style.display = "flex";
        DOM.body.classList.add("splash-active");
      }
      DOM.communityBtn &&
        (DOM.communityBtn.onclick = (e) => {
          e.preventDefault();
          dismissSplash();
          window.location.href = "community.html";
        });
      DOM.publicBtn &&
        (DOM.publicBtn.onclick = (e) => {
          e.preventDefault();
          dismissSplash();
          window.location.href = "news.html";
        });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && DOM.tutorial?.classList.contains("active")) closeTutorial();
    });
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

      area.addEventListener("mouseenter", () => {
        if (!DOM.infoLine || !DOM.infoText) return;
        DOM.infoText.textContent = area.dataset.info || "";
        DOM.infoLine.classList.add("visible");
      });

      area.addEventListener("mouseleave", () => DOM.infoLine?.classList.remove("visible"));

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
        if (url && url !== "#") setTimeout(() => { window.location.href = url; }, 200);
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
    initSplashTutorial();
    initPortals();
    initEventsModal();
    initBTCModalControls();

    // Keep previous behavior: idle state once overlays are done
    // (If splash/tutorial are skipped via localStorage, this ensures UI still settles.)
    if (localStorage.getItem(SPLASH_KEY) === "true" && localStorage.getItem(TUTORIAL_KEY) === "true") {
      setIdleSoon();
    }

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
