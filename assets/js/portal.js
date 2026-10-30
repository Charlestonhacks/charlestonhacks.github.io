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

  const VERSION = "portal-js-v21-nearify-in-card-20261029";
  console.log(`[PORTAL] loaded ${VERSION}`);

  const BUILDSPACE_RETURN_KEY = "ch:portal-return-to-buildspace";
  function consumeBuildspaceReturn() {
    try {
      const requestedAt = Number(localStorage.getItem(BUILDSPACE_RETURN_KEY));
      localStorage.removeItem(BUILDSPACE_RETURN_KEY);
      return Number.isFinite(requestedAt) && requestedAt <= Date.now() && Date.now() - requestedAt < 10 * 60 * 1000;
    } catch {
      return false;
    }
  }

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
      chat: "chime", poster: "chime", swag: "chime",
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
  // Events feed loader (no polling)
  // ------------------------------------------------
  async function loadEventsFeedModule() {
    if (typeof window.loadEvents === "function") return window.loadEvents;

    const module = await import("/assets/js/eventsFeed.js?v=chronological-20261028");
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
    { id: "innovation", title: "Buildspace", icon: "fas fa-people-arrows", description: "Projects, connections, and collaboration.", view: "buildspace" },
    { id: "chat", title: "Community Chat", icon: "fas fa-comments", description: "Meet other builders and continue the conversation.", view: "chat" },
    { id: "discord", title: "Discord", icon: "fa-brands fa-discord", description: "Join the CharlestonHacks Discord community.", view: "discord" },
    { id: "nearify", title: "Nearify", icon: "fas fa-user-group", description: "Meet people at events and follow up with context.", src: "https://nearify.org/" },
    { id: "sandbox", title: "Sandbox", icon: "fas fa-flask", description: "Experimental projects and prototypes.", view: "sandbox" },
    { id: "news", title: "News", icon: "fas fa-newspaper", description: "CharlestonHacks updates and community stories.", view: "news" },
    { id: "poster", title: "Event Poster", icon: "fas fa-image", description: "View the event poster.", src: "/Poster.html" },
    { id: "swag", title: "Swag Vote", icon: "fas fa-shirt", description: "Browse and vote on CharlestonHacks swag.", src: "/swag.html" },
    { id: "game", title: "Avatar Matching Game", icon: "fas fa-gamepad", description: "Play the community avatar matching game.", src: "/cardmatchgame.html" },
  ];


  const DECK_PREFERENCES_KEY = "ch:portal-deck-preferences:v1";

  function normalizeDeckPreferences(value) {
    const validIds = new Set(features.map((feature) => feature.id));
    const hidden = Array.isArray(value?.hidden)
      ? [...new Set(value.hidden.filter((id) => validIds.has(id)))]
      : [];
    const pinned = Array.isArray(value?.pinned)
      ? [...new Set(value.pinned.filter((id) => validIds.has(id) && !hidden.includes(id)))]
      : [];
    return { hidden, pinned };
  }

  function readDeckPreferences() {
    try {
      return normalizeDeckPreferences(JSON.parse(localStorage.getItem(DECK_PREFERENCES_KEY) || "{}"));
    } catch {
      return { hidden: [], pinned: [] };
    }
  }

  let deckPreferences = readDeckPreferences();

  function orderedDeckFeatures(preferences = deckPreferences) {
    const available = features.filter((feature) => !preferences.hidden.includes(feature.id));
    const availableIds = new Set(available.map((feature) => feature.id));
    const pinned = preferences.pinned.filter((id) => availableIds.has(id));
    const pinnedIds = new Set(pinned);
    return [
      ...pinned.map((id) => available.find((feature) => feature.id === id)).filter(Boolean),
      ...available.filter((feature) => !pinnedIds.has(feature.id)),
    ];
  }

  function saveDeckPreferences(value) {
    deckPreferences = normalizeDeckPreferences(value);
    try {
      localStorage.setItem(DECK_PREFERENCES_KEY, JSON.stringify(deckPreferences));
    } catch {
      // Keep the current preference for this page even when storage is unavailable.
    }
    return deckPreferences;
  }

  function initFeatureViews() {
    const sourcePanel = document.getElementById("portal-view-panel");
    const viewNodes = new Map();
    sourcePanel?.querySelectorAll("[data-view]").forEach((node) => {
      viewNodes.set(node.dataset.view, node);
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

    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const homeManageButton = document.getElementById("portal-manage-deck");
    const manager = document.getElementById("portal-deck-manager");
    const managerList = document.getElementById("portal-deck-options");
    const managerClose = document.getElementById("portal-deck-close");
    const managerCancel = document.getElementById("portal-deck-cancel");
    const managerSave = document.getElementById("portal-deck-save");
    let draftPreferences = null;

    function updateManagerPinButton(button, featureId) {
      const hidden = draftPreferences?.hidden.includes(featureId) ?? false;
      const pinned = draftPreferences?.pinned.includes(featureId) ?? false;
      button.disabled = hidden;
      button.setAttribute("aria-pressed", String(pinned));
      button.setAttribute("aria-label", hidden ? "Add " + features.find((feature) => feature.id === featureId)?.title + " before pinning" : (pinned ? "Unpin " + features.find((feature) => feature.id === featureId)?.title : "Pin " + features.find((feature) => feature.id === featureId)?.title + " to the front"));
      button.textContent = pinned ? "Pinned" : "Pin to front";
      button.title = hidden ? "Add this card to pin it" : (pinned ? "Unpin this card" : "Pin this card to the front");
    }

    function renderManagerOptions() {
      if (!managerList || !draftPreferences) return;
      managerList.replaceChildren();

      features.forEach((feature) => {
        const row = document.createElement("div");
        row.className = "portal-deck-option";
        row.dataset.featureId = feature.id;

        const main = document.createElement("div");
        main.className = "portal-deck-option-main";

        const featureIcon = document.createElement("i");
        featureIcon.className = "portal-deck-option-icon " + feature.icon;
        featureIcon.setAttribute("aria-hidden", "true");

        const copy = document.createElement("span");
        copy.className = "portal-deck-option-copy";
        const title = document.createElement("strong");
        title.textContent = feature.title;
        const status = document.createElement("small");
        copy.append(title, status);
        main.append(featureIcon, copy);

        const includeButton = document.createElement("button");
        includeButton.type = "button";
        includeButton.className = "portal-deck-toggle";

        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.className = "portal-deck-pin-toggle";

        function syncOptionState() {
          const included = !draftPreferences.hidden.includes(feature.id);
          includeButton.textContent = included ? "Remove" : "Add";
          includeButton.dataset.included = String(included);
          includeButton.setAttribute("aria-label", (included ? "Remove " : "Add ") + feature.title + (included ? " from" : " to") + " the swipe deck");
          status.textContent = included
            ? (draftPreferences.pinned.includes(feature.id) ? "Pinned to the front" : "In swipe deck")
            : "Removed from deck";
          row.classList.toggle("is-excluded", !included);
          row.classList.toggle("is-pinned", draftPreferences.pinned.includes(feature.id));
          updateManagerPinButton(pinButton, feature.id);
        }

        syncOptionState();

        includeButton.addEventListener("click", () => {
          const hidden = new Set(draftPreferences.hidden);
          if (hidden.has(feature.id)) hidden.delete(feature.id);
          else {
            hidden.add(feature.id);
            draftPreferences.pinned = draftPreferences.pinned.filter((id) => id !== feature.id);
          }
          draftPreferences.hidden = [...hidden];
          syncOptionState();
          row.classList.remove("portal-option-changed");
          void row.offsetWidth;
          row.classList.add("portal-option-changed");
        });

        pinButton.addEventListener("click", () => {
          if (draftPreferences.hidden.includes(feature.id)) return;
          const isPinned = draftPreferences.pinned.includes(feature.id);
          draftPreferences.pinned = isPinned
            ? draftPreferences.pinned.filter((id) => id !== feature.id)
            : [feature.id, ...draftPreferences.pinned.filter((id) => id !== feature.id)];
          syncOptionState();
          row.classList.remove("portal-option-changed");
          void row.offsetWidth;
          row.classList.add("portal-option-changed");
        });

        row.append(main, includeButton, pinButton);
        managerList.append(row);
      });
    }
    function openDeckManager() {
      if (!manager || !managerList) return;
      draftPreferences = {
        hidden: [...deckPreferences.hidden],
        pinned: [...deckPreferences.pinned],
      };
      renderManagerOptions();
      if (typeof manager.showModal === "function") manager.showModal();
      else manager.setAttribute("open", "");
    }

    function closeDeckManager() {
      if (!manager) return;
      if (typeof manager.close === "function" && manager.open) manager.close();
      else manager.removeAttribute("open");
    }

    homeManageButton?.addEventListener("click", openDeckManager);
    managerClose?.addEventListener("click", closeDeckManager);
    managerCancel?.addEventListener("click", closeDeckManager);

    managerSave?.addEventListener("click", () => {
      if (!draftPreferences) return;
      const nextPreferences = saveDeckPreferences(draftPreferences);
      const currentStillIncluded = !nextPreferences.hidden.includes(activeFeatureId);
      const orderedFeatures = orderedDeckFeatures(nextPreferences);
      const firstPinned = orderedFeatures[0]?.id;
      const nextFeatureId = nextPreferences.pinned.length
        ? firstPinned
        : (currentStillIncluded ? activeFeatureId : firstPinned);
      draftPreferences = null;
      closeDeckManager();
      renderDeck(nextFeatureId || "home", true);
    });

    manager?.addEventListener("click", (event) => {
      if (event.target === manager) closeDeckManager();
    });

    let shouldRestoreBuildspace = consumeBuildspaceReturn();

    function renderDeck(startFeatureId = "home", animate = false) {
      if (featureSwiper) {
        featureSwiper.destroy(true, true);
        featureSwiper = null;
      }
      container.classList.remove("portal-deck-restacking");
      slidesContainer.querySelectorAll(".portal-feature-slide").forEach((slide) => slide.remove());

      const deckFeatures = orderedDeckFeatures();
      featureIndexes = new Map(deckFeatures.map((feature, index) => [feature.id, index + 1]));

      deckFeatures.forEach((feature, index) => {
        const slide = document.createElement("div");
        slide.className = "swiper-slide portal-feature-slide";
        slide.setAttribute("aria-label", "Feature " + (index + 1) + " of " + deckFeatures.length + ": " + feature.title);

        const card = document.createElement("article");
        card.className = "portal-feature-card";
        card.dataset.featureId = feature.id;

        const header = document.createElement("div");
        header.className = "portal-feature-header";
        header.setAttribute("aria-label", "Swipe area. " + feature.title + ", feature " + (index + 1) + " of " + deckFeatures.length);

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
        if (feature.id === "nearify") {
          const openLink = document.createElement("a");
          openLink.className = "portal-feature-subtitle portal-feature-open-link swiper-no-swiping";
          openLink.href = feature.src;
          openLink.target = "_blank";
          openLink.rel = "noopener noreferrer";
          openLink.textContent = "Open Nearify in a new tab";
          openLink.setAttribute("aria-label", "Open Nearify in a new tab");
          heading.append(openLink);
        }

        const isPinned = deckPreferences.pinned.includes(feature.id);
        const pinButton = document.createElement("button");
        pinButton.type = "button";
        pinButton.className = "portal-feature-pin swiper-no-swiping";
        pinButton.setAttribute("aria-label", (isPinned ? "Unpin " : "Pin ") + feature.title + (isPinned ? " from" : " to") + " the front");
        pinButton.setAttribute("aria-pressed", String(isPinned));
        pinButton.title = isPinned ? "Unpin card" : "Pin card to front";
        pinButton.innerHTML = '<i class="fas fa-thumbtack" aria-hidden="true"></i>';
        pinButton.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          const currentlyPinned = deckPreferences.pinned.includes(feature.id);
          const nextPreferences = {
            hidden: [...deckPreferences.hidden],
            pinned: currentlyPinned
              ? deckPreferences.pinned.filter((id) => id !== feature.id)
              : [feature.id, ...deckPreferences.pinned.filter((id) => id !== feature.id)],
          };
          saveDeckPreferences(nextPreferences);
          const newFront = orderedDeckFeatures()[0]?.id || "home";
          renderDeck(newFront, true);
        });

        const number = document.createElement("span");
        number.className = "portal-feature-number";
        number.textContent = String(index + 1).padStart(2, "0") + " / " + String(deckFeatures.length).padStart(2, "0");
        header.append(iconWrap, heading, pinButton, number);

        const content = document.createElement("div");
        content.className = "portal-feature-content";
        content.setAttribute("aria-label", feature.title + " content");

        const nativeView = feature.view ? viewNodes.get(feature.view) : null;
        if (nativeView) {
          nativeView.hidden = false;
          content.append(nativeView);
        } else {
          const frame = document.createElement("iframe");
          frame.title = "CharlestonHacks " + feature.title;
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

      featureSwiper = new window.Swiper(container, {
        effect: "cards",
        direction: "horizontal",
        slidesPerView: 1,
        speed: reducedMotion ? 0 : 280,
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
        const feature = activeIndex === 0 ? null : deckFeatures[activeIndex - 1];
        activeFeatureId = feature?.id || "home";
        document.body.classList.toggle("portal-buildspace-active", activeFeatureId === "innovation");
        counter.textContent = feature ? activeIndex + " / " + deckFeatures.length + " · " + feature.title.toUpperCase() : "PORTAL";
        [...slidesContainer.children].forEach((slide, index) => {
          const active = index === activeIndex;
          slide.setAttribute("aria-hidden", active ? "false" : "true");
          slide.inert = !active;
        });

        if (!feature) return;

        if (feature.id === "events") loadEventsIntoPanel();
        if (feature.id === "innovation") updateBuildspaceAccess();
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
        if (Number.isInteger(index) && featureSwiper) featureSwiper.slideTo(index);
      };

      if (shouldRestoreBuildspace && featureIndexes.has("innovation")) {
        startFeatureId = "innovation";
      }
      shouldRestoreBuildspace = false;
      const targetIndex = featureIndexes.get(startFeatureId);
      featureSwiper.slideTo(Number.isInteger(targetIndex) ? targetIndex : 0, 0);
      featureSwiper.on("slideChange", syncDeck);
      syncDeck();

      if (animate && !reducedMotion) {
        container.classList.add("portal-deck-restacking");
        const arrivingCard = slidesContainer.children[featureSwiper.activeIndex]?.querySelector(".portal-feature-card");
        arrivingCard?.classList.add("portal-card-arriving");
        window.setTimeout(() => {
          container.classList.remove("portal-deck-restacking");
          arrivingCard?.classList.remove("portal-card-arriving");
        }, 760);
      }
    }

    renderDeck(shouldRestoreBuildspace ? "innovation" : "home");
  }

  // ------------------------------------------------
  // Boot
  // ------------------------------------------------
  window.addEventListener("DOMContentLoaded", () => {
    const viewNodes = initFeatureViews();
    initCardGestures(viewNodes);
    initQuickAccessTooltips();
    setIdleSoon();

  });
})();
