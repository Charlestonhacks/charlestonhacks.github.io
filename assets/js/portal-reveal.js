const REVEAL_SEEN_KEY = "chs_portal_cinematic_reveal_seen_v1";
const CLIPS = [
  "/images/Descartesvideo.mp4",
  "/images/medusa%20best.mp4",
  "/images/Alexandorvideo.mp4",
];

const reveal = document.getElementById("portal-card-reveal");
const cardInner = document.getElementById("portal-card-reveal-inner");
const cardStage = document.querySelector(".card-stage");
const video = document.getElementById("portal-reveal-video");
const skipButton = document.getElementById("skip-portal-reveal");
const guide = document.getElementById("portal-discovery-guide");
const portalButtons = [...document.querySelectorAll(".clickable-area")];
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let isPlaying = false;
let skipRequested = false;
let skipClipWait = null;
let guideTimer = null;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

function showPortalGuide() {
  if (!guide || !portalButtons.length) return;

  guide.textContent = window.matchMedia("(any-hover: hover)").matches
    ? "Tap an icon to explore · hover or focus to preview"
    : "Tap an icon to explore";
  guide.hidden = false;
  requestAnimationFrame(() => guide.classList.add("is-visible"));

  let index = 0;
  const pulseNext = () => {
    portalButtons.forEach((button) => button.classList.remove("is-guided"));
    if (index >= portalButtons.length) return;
    portalButtons[index++].classList.add("is-guided");
    guideTimer = window.setTimeout(pulseNext, 420);
  };
  pulseNext();

  guideTimer = window.setTimeout(() => {
    portalButtons.forEach((button) => button.classList.remove("is-guided"));
    guide.classList.remove("is-visible");
    window.setTimeout(() => { guide.hidden = true; }, 240);
  }, 420 * (portalButtons.length + 1));
}

function playClip(src) {
  return new Promise(async (resolve) => {
    video.classList.add("is-changing");
    video.pause();
    video.src = new URL(src, window.location.href).href;
    video.load();
    await wait(180);

    try {
      await video.play();
      video.classList.remove("is-changing");
      await new Promise((done) => {
        const timer = window.setTimeout(done, 1350);
        skipClipWait = () => {
          window.clearTimeout(timer);
          done();
        };
      });
    } catch {
      await wait(250);
    }

    skipClipWait = null;
    video.pause();
    try { video.currentTime = 0; } catch {}
    video.classList.remove("is-changing");
    await wait(120);
    resolve();
  });
}

async function runReveal({ automatic = false } = {}) {
  if (isPlaying || !reveal || !cardInner || !cardStage || !video) return;
  if (automatic && (document.hidden || localStorage.getItem(REVEAL_SEEN_KEY) === "true")) return;

  if (automatic && prefersReducedMotion.matches) {
    localStorage.setItem(REVEAL_SEEN_KEY, "true");
    showPortalGuide();
    return;
  }

  const restoreFocus = document.activeElement === skipButton;
  isPlaying = true;
  skipRequested = false;
  cardStage.inert = true;
  reveal.hidden = false;
  reveal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => reveal.classList.add("is-active"));
  await wait(40);

  cardInner.classList.add("is-flipped");
  await wait(760);

  for (const clip of CLIPS) {
    if (skipRequested || document.hidden) break;
    await playClip(clip);
  }

  if (!document.hidden) {
    cardInner.classList.remove("is-flipped");
    await wait(760);
  } else {
    cardInner.classList.remove("is-flipped");
  }

  reveal.classList.remove("is-active");
  await wait(220);
  reveal.hidden = true;
  reveal.setAttribute("aria-hidden", "true");
  cardStage.inert = false;
  video.pause();
  video.removeAttribute("src");
  video.load();
  localStorage.setItem(REVEAL_SEEN_KEY, "true");
  isPlaying = false;

  if (restoreFocus) cardStage.querySelector(".clickable-area")?.focus({ preventScroll: true });
  if (automatic || skipRequested) showPortalGuide();
}

document.addEventListener("chs:portal-ready", () => runReveal({ automatic: true }));

skipButton?.addEventListener("click", () => {
  skipRequested = true;
  video?.pause();
  skipClipWait?.();
});
