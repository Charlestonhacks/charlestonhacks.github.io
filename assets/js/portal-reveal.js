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
const replayButton = document.getElementById("replay-portal-reveal");
const skipButton = document.getElementById("skip-portal-reveal");
const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

let isPlaying = false;
let skipRequested = false;
let skipClipWait = null;

function wait(ms) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
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
  if (automatic && (prefersReducedMotion.matches || document.hidden)) return;
  if (automatic && localStorage.getItem(REVEAL_SEEN_KEY) === "true") return;

  const returnFocus = document.activeElement === skipButton || document.activeElement === replayButton;
  isPlaying = true;
  skipRequested = false;
  replayButton.disabled = true;
  cardStage.inert = true;
  reveal.hidden = false;
  reveal.setAttribute("aria-hidden", "false");

  requestAnimationFrame(() => reveal.classList.add("is-active"));
  await wait(40);

  if (!prefersReducedMotion.matches) {
    cardInner.classList.add("is-flipped");
    await wait(760);
  }

  for (const clip of CLIPS) {
    if (skipRequested || document.hidden) break;
    await playClip(clip);
  }

  if (!prefersReducedMotion.matches && !document.hidden) {
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
  replayButton.disabled = false;
  video.pause();
  video.removeAttribute("src");
  video.load();
  localStorage.setItem(REVEAL_SEEN_KEY, "true");
  isPlaying = false;

  if (returnFocus) replayButton.focus({ preventScroll: true });
}

document.addEventListener("chs:portal-ready", () => {
  runReveal({ automatic: true });
});

replayButton?.addEventListener("click", () => runReveal());

skipButton?.addEventListener("click", () => {
  skipRequested = true;
  video?.pause();
  skipClipWait?.();
});
