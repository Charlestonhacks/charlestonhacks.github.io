// ================================================================
// CharlestonHacks Portal Controller
// File: /assets/js/portal.js
// ================================================================

(() => {
  "use strict";

  const VERSION = "portal-js-v1-20260223";
  console.log(`[PORTAL] loaded ${VERSION}`);

  // -----------------------------
  // DOM helpers
  // -----------------------------
  const $ = (sel) => document.querySelector(sel);
  const $$ = (sel) => Array.from(document.querySelectorAll(sel));

  // -----------------------------
  // Audio (lazy)
  // -----------------------------
  function playSoundById(id) {
    const el = document.getElementById(id);
    if (!el) return;

    // Lazy-load audio only when needed
    if (el.preload === "none" && el.readyState === 0) {
      try { el.load(); } catch (_) {}
    }
    try {
      el.currentTime = 0;
      el.play().catch(() => {});
    } catch (_) {}
  }

  // Optional shared hook for other scripts
  window.__CH_PLAY_SOUND_ID__ = playSoundById;

  // -----------------------------
  // Splash + Tutorial
  // -----------------------------
  const SPLASH_KEY = "chs_splash_seen_once";
  const TUTORIAL_KEY = "chs_tutorial_completed";

  function hideSplash(immediate = false) {
    const splash = $("#splash-overlay");
    if (!splash) return;

    splash.classList.add("fade-out");
    document.body.classList.remove("splash-active");

    setTimeout(() => {
      splash.style.display = "none";
      checkTutorial();
    }, immediate ? 0 : 600);
  }

  function checkTutorial() {
    const tutorial = $("#tutorial-overlay");
    if (!tutorial) return;

    if (localStorage.getItem(TUTORIAL_KEY) !== "true") {
      setTimeout(() => tutorial.classList.add("active"), 300);
    } else {
      startDiscovery();
    }
  }

  function startDiscovery() {
    setTimeout(() => {
      $("#discovery-tracker")?.classList.add("visible");
      $(".media-container")?.classList.add("idle");
    }, 500);
  }

  function initSplashTutorial() {
    const splash = $("#splash-overlay");
    const tutorial = $("#tutorial-overlay");
    const cBtn = $("#community-site-btn");
    const pBtn = $("#public-site-btn");
    const skipBtn = $("#skip-tutorial");
    const box = $("#dont-show-again");

    function dismissSplash() {
      if (box?.checked) localStorage.setItem(SPLASH_KEY, "true");
      hideSplash(false);
    }

    function closeTutorial() {
      tutorial?.classList.remove("active");
      localStorage.setItem(TUTORIAL_KEY, "true");
      startDiscovery();
    }

    skipBtn?.addEventListener("click", closeTutorial);

    if (localStorage.getItem(SPLASH_KEY) === "true") {
      hideSplash(true);
    } else {
      if (splash) {
        splash.style.display = "flex";
        document.body.classList.add("splash-active");
      }
      cBtn && (cBtn.onclick = (e) => { e.preventDefault(); dismissSplash(); });
      pBtn && (pBtn.onclick = (e) => {
        e.preventDefault();
        dismissSplash();
        window.location.href = "https://charlestonhacks.mailchimpsites.com/";
      });
    }

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && tutorial?.classList.contains("active")) closeTutorial();
    });
  }

  // -----------------------------
  // Discovery Progress
  // -----------------------------
  const DISCOVERED_KEY = "chs_discovered_portals";
  const TOTAL_PORTALS = 9;
  const discoveredPortals = new Set(JSON.parse(localStorage.getItem(DISCOVERED_KEY) || "[]"));

  function updateProgressUI() {
    const count = discoveredPortals.size;
    const pct = (count / TOTAL_PORTALS) * 100;

    const countEl = $("#portals-count");
    const fillEl = $("#progress-fill");
    if (countEl) countEl.textContent = String(count);
    if (fillEl) fillEl.style.width = pct + "%";

    if (count === TOTAL_PORTALS) {
      const tracker = $("#discovery-tracker");
      if (!tracker) return;
      tracker.style.borderColor = "var(--gold)";
      tracker.style.boxShadow = "0 0 30px var(--gold-glow)";
      setTimeout(() => { tracker.style.borderColor = ""; tracker.style.boxShadow = ""; }, 2000);
    }
  }

  function markDiscovered(portalId) {
    if (!portalId) return;
    if (!discoveredPortals.has(portalId)) {
      discoveredPortals.add(portalId);
      localStorage.setItem(DISCOVERED_KEY, JSON.stringify([...discoveredPortals]));
      updateProgressUI();
      playSoundById("chimeSound");
    }
  }

  // Expose a tiny API if you want
  window.charlestonHacks = window.charlestonHacks || {};
  window.charlestonHacks.markDiscovered = markDiscovered;
  window.charlestonHacks.getProgress = () => discoveredPortals.size;

  // -----------------------------
  // BTC cache
  // -----------------------------
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

    $("#btc-main-price").textContent =
      "$" + btc.usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

    const changePercent = btc.usd_24h_change || 0;
    const changeElem = $("#btc-24h-change");
    changeElem.textContent = (changePercent >= 0 ? "+" : "") + changePercent.toFixed(2) + "%";
    changeElem.className = "btc-stat-value " + (changePercent >= 0 ? "positive" : "negative");

    const high = details?.high_24h?.usd;
    const low = details?.low_24h?.usd;

    $("#btc-24h-high").textContent =
      (typeof high === "number")
        ? "$" + high.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "--";

    $("#btc-24h-low").textContent =
      (typeof low === "number")
        ? "$" + low.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        : "--";

    const marketCap = btc.usd_market_cap || 0;
    $("#btc-market-cap").textContent = "$" + (marketCap / 1e9).toFixed(2) + "B";

    const volume = btc.usd_24h_vol || 0;
    $("#btc-volume").textContent = "$" + (volume / 1e9).toFixed(2) + "B";

    const updateTime = new Date((btc.last_updated_at || 0) * 1000);
    $("#btc-last-update").textContent =
      updateTime.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  }

  async function fetchBTCData() {
    const loading = $("#btc-loading");
    const content = $("#btc-content");

    const cached = getCachedBTC();
    if (cached) {
      renderBTC(cached);
      if (loading) loading.style.display = "none";
      if (content) content.style.display = "block";
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
      } catch (_) {
        details = null;
      }

      const merged = { btc: data.bitcoin, details };
      setCachedBTC(merged);
      renderBTC(merged);

      setTimeout(() => {
        if (loading) loading.style.display = "none";
        if (content) content.style.display = "block";
      }, 200);
    } catch (err) {
      console.error("[PORTAL] Error fetching BTC data:", err);
      if (loading) loading.textContent = "ERROR LOADING DATA";
      setTimeout(() => {
        if (loading) loading.style.display = "none";
        if (content) content.style.display = "block";
        $("#btc-main-price").textContent = "DATA UNAVAILABLE";
      }, 400);
    }
  }

  window.fetchBTCData = fetchBTCData;

  // -----------------------------
  // Matrix animation (RAF + pause)
  // -----------------------------
  let matrixRaf = null;
  let matrixRunning = false;
  let matrixCtx = null;
  let matrixCanvas = null;
  let drops = [];
  let columns = 0;
  const btcChars = "₿$0123456789BITCOIN.";

  function matrixResize() {
    if (!matrixCanvas) return;
    matrixCanvas.width = window.innerWidth;
    matrixCanvas.height = window.innerHeight;
    columns = Math.floor(matrixCanvas.width / 20);
    drops = Array(columns).fill(1);
  }

  function matrixFrame() {
    if (!matrixRunning || !matrixCtx || !matrixCanvas) return;

    matrixCtx.fillStyle = "rgba(0, 0, 0, 0.05)";
    matrixCtx.fillRect(0, 0, matrixCanvas.width, matrixCanvas.height);

    matrixCtx.fillStyle = "#00ff00";
    matrixCtx.font = "15px Courier New";

    for (let i = 0; i < drops.length; i++) {
      const text = btcChars[Math.floor(Math.random() * btcChars.length)];
      matrixCtx.fillText(text, i * 20, drops[i] * 20);

      if (drops[i] * 20 > matrixCanvas.height && Math.random() > 0.975) drops[i] = 0;
      drops[i]++;
    }

    matrixRaf = requestAnimationFrame(matrixFrame);
  }

  function startMatrixRain() {
    matrixCanvas = $("#matrix-canvas");
    if (!matrixCanvas) return;

    matrixCtx = matrixCanvas.getContext("2d");
    matrixResize();

    matrixRunning = true;
    if (matrixRaf) cancelAnimationFrame(matrixRaf);
    matrixRaf = requestAnimationFrame(matrixFrame);

    setTimeout(() => $("#btc-data-container")?.classList.add("visible"), 1500);
  }

  function stopMatrixRain() {
    matrixRunning = false;
    if (matrixRaf) cancelAnimationFrame(matrixRaf);
    matrixRaf = null;
  }

  function openMatrixBTC() {
    const overlay = $("#matrix-btc-overlay");
    if (!overlay) return;

    overlay.classList.add("active");
    overlay.setAttribute("aria-hidden", "false");

    playSoundById("cardflipSound");
    startMatrixRain();
    fetchBTCData();
  }

  function closeMatrixBTC() {
    const overlay = $("#matrix-btc-overlay");
    overlay?.classList.remove("active");
    overlay?.setAttribute("aria-hidden", "true");

    stopMatrixRain();

    setTimeout(() => {
      $("#btc-data-container")?.classList.remove("visible");
      const loading = $("#btc-loading");
      const content = $("#btc-content");
      if (loading) { loading.style.display = "block"; loading.textContent = "LOADING BTC DATA..."; }
      if (content) content.style.display = "none";

      const canvas = $("#matrix-canvas");
      if (canvas) canvas.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
    }, 250);
  }

  // pause matrix if tab hidden while overlay open
  document.addEventListener("visibilitychange", () => {
    const overlayActive = $("#matrix-btc-overlay")?.classList.contains("active");
    if (!overlayActive) return;
    if (document.hidden) stopMatrixRain();
    else startMatrixRain();
  });

  window.addEventListener("resize", () => {
    if (matrixRunning) matrixResize();
  });

  // -----------------------------
  // Events feed loader (no polling)
  // -----------------------------
  async function loadEventsFeedModule() {
    if (typeof window.loadEvents === "function") return window.loadEvents;

    const module = await import("/assets/js/eventsFeed.js");
    if (module?.loadEvents) {
      window.loadEvents = module.loadEvents;
      return window.loadEvents;
    }
    return null;
  }

  // -----------------------------
  // Portal interactions
  // -----------------------------
  function initPortals() {
    const infoLine = $("#infoLine");
    const infoText = $("#infoText");
    const areas = $$(".clickable-area");

    areas.forEach(a => a.setAttribute("tabindex", "0"));

    areas.forEach((area) => {
      const portalId = area.dataset.portal;

      if (discoveredPortals.has(portalId)) area.classList.add("discovered");

      area.addEventListener("mouseenter", () => {
        if (!infoLine || !infoText) return;
        infoText.textContent = area.dataset.info || "";
        infoLine.classList.add("visible");
      });

      area.addEventListener("mouseleave", () => infoLine?.classList.remove("visible"));

      area.addEventListener("click", (e) => {
        e.preventDefault();

        // discovery
        markDiscovered(portalId);
        area.classList.add("discovered");

        // center portal opens BTC
        if (portalId === "center") {
          openMatrixBTC();
          return;
        }

        const soundKey = area.dataset.sound;
        if (soundKey) playSoundById(soundKey + "Sound");

        const url = area.dataset.url;
        if (url && url !== "#") setTimeout(() => { window.location.href = url; }, 200);
      });

      area.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") { e.preventDefault(); area.click(); }
      });
    });
  }

  // -----------------------------
  // Events modal controls
  // -----------------------------
  function initEventsModal() {
    const openCalendarBtn = $("#open-calendar");
    const eventsOverlay = $("#events-overlay");
    const closeBtn = $("#close-overlay");

    openCalendarBtn?.addEventListener("click", async (e) => {
      e.preventDefault();
      eventsOverlay?.classList.add("active");

      try {
        const fn = await loadEventsFeedModule();
        if (typeof fn === "function") fn();
      } catch (err) {
        console.error("[PORTAL] Failed to load events feed on demand:", err);
      }
    });

    closeBtn?.addEventListener("click", () => eventsOverlay?.classList.remove("active"));

    eventsOverlay?.addEventListener("click", (e) => {
      if (e.target === eventsOverlay) eventsOverlay.classList.remove("active");
    });
  }

  // -----------------------------
  // BTC overlay close controls
  // -----------------------------
  function initBTCModalControls() {
    $("#close-matrix-btc")?.addEventListener("click", closeMatrixBTC);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") closeMatrixBTC();
    });

    $("#matrix-btc-overlay")?.addEventListener("click", (e) => {
      if (e.target && e.target.id === "matrix-btc-overlay") closeMatrixBTC();
    });
  }

  // -----------------------------
  // Boot
  // -----------------------------
  window.addEventListener("DOMContentLoaded", async () => {
    initSplashTutorial();
    updateProgressUI();
    initPortals();
    initEventsModal();
    initBTCModalControls();

    // Optional: warm-load events module after idle, but don't block paint
    if ("requestIdleCallback" in window) {
      requestIdleCallback(() => loadEventsFeedModule().catch(() => {}), { timeout: 1500 });
    } else {
      setTimeout(() => loadEventsFeedModule().catch(() => {}), 1200);
    }
  });
})();
