// CharlestonHacks public BBS, authenticated posting, and Zork mode.
import { startZork, sendZorkCommand, stopZork } from "./zorkLoader.js?v=20261123";
import { supabase } from "./supabaseClient.js";

const HISTORY_PAGE_SIZE = 150;
const MAX_MESSAGE_LENGTH = 500;
const COUNTER_THRESHOLD = 400;
const HEARTBEAT_MS = 10000;
const PRESENCE_MS = 7000;
const MESSAGE_FIELDS = "id, user_id, username, text, created_at";

let initialized = false;
let currentMode = "chat";
let currentAuthUser = null;
let currentProfile = null;

// Chat state: every loaded message, sorted oldest → newest.
let messages = [];
let messageIds = new Set();
let hasOlderHistory = false;
let loadingOlder = false;
let unseenCount = 0;   // arrived while scrolled up
let unreadCount = 0;   // arrived while the tab was hidden
let realtimeStatus = "connecting";
let wasDisconnected = false;
let baseTitle = "";
let els = {};
let zorkSession = 0;        // increments per game so late engine output is dropped after exit
let zorkChatPending = 0;    // chat messages that arrived during a game
let zorkHistory = [];
let zorkHistoryIndex = -1;

function returnToBuildspaceAfterAuthFailure() {
  try {
    const requestedAt = Number(localStorage.getItem("ch:portal-return-to-buildspace"));
    const pending = Number.isFinite(requestedAt) &&
      requestedAt <= Date.now() &&
      Date.now() - requestedAt < 10 * 60 * 1000;
    if (!pending) return false;
    localStorage.setItem("ch:portal-auth-feedback", "Sign-in was cancelled or could not be completed. Please try again.");
    localStorage.removeItem("ch:bbs-return-to-hub");
    window.location.replace("/hub.html");
    return true;
  } catch {
    return false;
  }
}

export async function initBBS() {
  if (initialized) return;
  const modal = document.getElementById("bbs-modal");
  if (!modal) return;
  initialized = true;

  modal.innerHTML = BBS_HTML;
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  const screen = modal.querySelector("#bbs-screen");
  const form = modal.querySelector("#bbs-form");
  const input = modal.querySelector("#bbs-input");
  const sendButton = modal.querySelector("#bbs-send");
  const onlineDiv = modal.querySelector("#bbs-online");
  const liveDiv = modal.querySelector("#bbs-live");
  const feedbackDiv = modal.querySelector("#bbs-feedback");
  const authDiv = modal.querySelector("#bbs-auth");
  const closeBtn = modal.querySelector("#bbs-close");
  const olderBtn = modal.querySelector("#bbs-older");
  const jumpBtn = modal.querySelector("#bbs-jump");
  const counter = modal.querySelector("#bbs-count");
  const zorkNote = modal.querySelector("#bbs-zork-note");
  els = { screen, input, sendButton, olderBtn, jumpBtn, liveDiv, counter, feedbackDiv, zorkNote };
  baseTitle = document.title;

  const guestName = loadOrGenerateUsername();
  window.bbsUsername = guestName;

  closeBtn.addEventListener("click", () => {
    if (currentMode === "zork") leaveZork("Exited ZORK mode.");
    modal.style.display = "none";
  });

  authDiv.addEventListener("click", async (event) => {
    const signOutButton = event.target.closest("[data-bbs-sign-out]");
    if (signOutButton) {
      signOutButton.disabled = true;
      signOutButton.textContent = "Signing out…";
      try {
        const { error } = await supabase.auth.signOut({ scope: "local" });
        if (error) throw error;
        feedbackDiv.textContent = "Signed out.";
      } catch (error) {
        console.error("[BBS] Sign-out error:", error);
        feedbackDiv.textContent = "Sign-out failed. Please try again.";
        signOutButton.disabled = false;
        signOutButton.textContent = "Sign out";
      }
      return;
    }

    const button = event.target.closest("[data-provider]");
    if (!button) return;
    button.disabled = true;
    feedbackDiv.textContent = "Opening sign-in…";

    const embedded = window.self !== window.top;
    if (embedded) {
      try { localStorage.setItem("ch:bbs-return-to-hub", String(Date.now())); } catch (_) {}
    }
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: button.dataset.provider,
      options: {
        redirectTo: window.location.origin + "/bbs.html",
        skipBrowserRedirect: embedded
      }
    });
    if (error) {
      console.error("[BBS] OAuth error:", error);
      try { localStorage.removeItem("ch:bbs-return-to-hub"); } catch (_) {}
      feedbackDiv.textContent = "Sign-in could not start. Please try again.";
      button.disabled = false;
      return;
    }
    if (embedded && data?.url) {
      // OAuth providers block authentication inside many cross-frame contexts.
      // Continue in the top-level tab, then return to the member portal.
      try {
        window.top.location.href = data.url;
      } catch (navigationError) {
        console.error("[BBS] Top-level OAuth navigation failed:", navigationError);
        try { localStorage.removeItem("ch:bbs-return-to-hub"); } catch (_) {}
        feedbackDiv.textContent = "Open Community Chat separately to sign in.";
        button.disabled = false;
      }
    } else if (embedded) {
      try { localStorage.removeItem("ch:bbs-return-to-hub"); } catch (_) {}
      feedbackDiv.textContent = "Sign-in could not start. Please try again.";
      button.disabled = false;
    }
  });

  const url = new URL(window.location.href);
  const oauthError = url.searchParams.get("error_description");
  if (oauthError) feedbackDiv.textContent = "Sign-in was cancelled or could not be completed. Please try again.";
  if (url.searchParams.has("code")) {
    const { error } = await supabase.auth.exchangeCodeForSession(url.searchParams.get("code"));
    if (error) {
      console.error("[BBS] OAuth callback error:", error);
      feedbackDiv.textContent = "Sign-in could not be completed. Please try again.";
      try { localStorage.removeItem("ch:bbs-return-to-hub"); } catch (_) {}
      if (returnToBuildspaceAfterAuthFailure()) return;
    } else {
      let returnToHub = false;
      try {
        const requestedAt = Number(localStorage.getItem("ch:bbs-return-to-hub"));
        returnToHub = Number.isFinite(requestedAt) && Date.now() - requestedAt < 10 * 60 * 1000;
        localStorage.removeItem("ch:bbs-return-to-hub");
      } catch (_) {}
      if (returnToHub) {
        window.location.replace("/hub.html");
        return;
      }
    }
    url.search = "";
    window.history.replaceState({}, document.title, url.toString());
  }
  if (url.searchParams.has("error") || (oauthError && !url.searchParams.has("code"))) {
    if (returnToBuildspaceAfterAuthFailure()) return;
    try { localStorage.removeItem("ch:bbs-return-to-hub"); } catch (_) {}
    url.search = "";
    window.history.replaceState({}, document.title, url.toString());
  }

  await refreshBbsIdentity(authDiv, form, input, sendButton, feedbackDiv);
  supabase.auth.onAuthStateChange((_event, session) => {
    // Defer Supabase queries until after its auth callback lock is released.
    setTimeout(() => refreshBbsIdentity(authDiv, form, input, sendButton, feedbackDiv, session?.user || null), 0);
  });

  await loadMessages(screen, feedbackDiv);
  supabase
    .channel("bbs_messages_channel")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "bbs_messages" }, ({ new: msg }) => {
      addIncomingMessage(msg);
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "bbs_messages" }, ({ old: msg }) => {
      removeChatMessage(screen, msg.id);
    })
    .subscribe((status) => {
      if (status === "SUBSCRIBED") {
        realtimeStatus = "live";
        // Fill any gap left while the realtime connection was down.
        if (wasDisconnected) catchUpMessages();
        wasDisconnected = false;
      } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
        realtimeStatus = "reconnecting";
        wasDisconnected = true;
      }
      renderLiveStatus();
    });

  // Presence: skip network work while the tab is hidden and refresh on return.
  const pollPresence = (force = false) => {
    if (document.hidden && !force) return;
    heartbeat(guestName);
    loadOnlineUsers(onlineDiv);
  };
  pollPresence(true);
  window.setInterval(() => { if (!document.hidden) heartbeat(guestName); }, HEARTBEAT_MS);
  window.setInterval(() => { if (!document.hidden) loadOnlineUsers(onlineDiv); }, PRESENCE_MS);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) return;
    unreadCount = 0;
    updateDocumentTitle();
    pollPresence(true);
    if (realtimeStatus !== "live") catchUpMessages();
  });

  screen.addEventListener("scroll", () => {
    if (isNearBottom(screen)) {
      unseenCount = 0;
      renderJumpButton();
    }
  }, { passive: true });

  jumpBtn.addEventListener("click", () => {
    scrollToBottom(screen);
    unseenCount = 0;
    renderJumpButton();
    if (!input.disabled) input.focus();
  });

  olderBtn.addEventListener("click", () => loadOlderMessages(feedbackDiv));

  input.addEventListener("input", renderCounter);
  input.addEventListener("keydown", (event) => {
    if (currentMode !== "zork" || !zorkHistory.length) return;
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") return;
    event.preventDefault();
    if (event.key === "ArrowUp") {
      zorkHistoryIndex = zorkHistoryIndex < 0 ? zorkHistory.length - 1 : Math.max(0, zorkHistoryIndex - 1);
    } else if (zorkHistoryIndex >= 0) {
      zorkHistoryIndex += 1;
      if (zorkHistoryIndex >= zorkHistory.length) zorkHistoryIndex = -1;
    }
    input.value = zorkHistoryIndex < 0 ? "" : zorkHistory[zorkHistoryIndex];
    const end = input.value.length;
    requestAnimationFrame(() => input.setSelectionRange(end, end));
  });

  leaveZork = (note, { keepScreen = false } = {}) => {
    const wasPlaying = currentMode === "zork";
    currentMode = "chat";
    zorkSession += 1;
    if (wasPlaying) stopZork();
    zorkChatPending = 0;
    renderZorkNote();
    // Back to a clean chat view, including anything posted during the game.
    if (!keepScreen) renderAllMessages();
    if (note) write(screen, note);
    setBbsInputMode(input, sendButton, false);
  };

  // Admin moderation is enforced by RLS; this delegated handler only exposes the control.
  screen.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-message]");
    if (!button || !isAdmin()) return;
    if (!window.confirm("Remove this public message? This cannot be undone.")) return;
    button.disabled = true;
    const { error } = await supabase.from("bbs_messages").delete().eq("id", button.dataset.deleteMessage);
    if (error) {
      console.error("[BBS] Delete error:", error);
      feedbackDiv.textContent = "Message could not be removed.";
      button.disabled = false;
    } else {
      removeChatMessage(screen, button.dataset.deleteMessage);
      feedbackDiv.textContent = "Message removed.";
    }
  });

  let sending = false;
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (sending) return;
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    renderCounter();

    if (currentMode === "zork") {
      rememberZorkCommand(text);
      if (text.toLowerCase() === "/exit") {
        leaveZork("Exited ZORK mode. Type zork to play again.");
        return;
      }
      if (text.toLowerCase() === "/chs") {
        write(screen, "A signal resolves: CHARLESTONHACKS, CHARLESTON, SC.\nBy the harbor, builders, designers, and curious minds gather for hackathons—to form teams, share skills, and make things together.\nThe next challenge is aboveground; yours waits below.\n");
        return;
      }
      if (sendZorkCommand(text)) echoZorkCommand(screen, text);
      return;
    }

    if (["zork", "play zork", "/zork"].includes(text.toLowerCase())) {
      write(screen, "CHARLESTONHACKS BBS PRESENTS: ZORK I\nA classic Great Underground Empire adventure.\n\nHOW TO PLAY: type short commands like look, inventory (or i),\nn / s / e / w / up / down, open mailbox, take leaflet, read leaflet.\nPress ↑ / ↓ to reuse earlier commands.\nType save to save, restore to load, /exit to return to chat.\nYour save is tied to this browser's guest name; each new save replaces the last.\n");
      const session = ++zorkSession;
      currentMode = "zork";
      zorkChatPending = 0;
      zorkHistoryIndex = -1;
      renderZorkNote();
      olderBtn.hidden = true;
      unseenCount = 0;
      renderJumpButton();
      setBbsInputMode(input, sendButton, true);
      input.disabled = true;
      const active = () => currentMode === "zork" && session === zorkSession;
      const started = await startZork((output) => { if (active()) write(screen, output); }, {
        username: guestName,
        onEnd: () => { if (active()) leaveZork("ZORK ended. Type zork to play again."); }
      });
      if (!active()) return;
      input.disabled = false;
      input.focus();
      if (!started) leaveZork(null, { keepScreen: true });
      return;
    }

    if (!canPost()) {
      input.value = text;
      renderCounter();
      feedbackDiv.textContent = "Sign in with an active member account to post.";
      return;
    }
    feedbackDiv.textContent = "";
    sending = true;
    sendButton.disabled = true;
    sendButton.textContent = "Sending…";
    const { data: message, error } = await supabase.from("bbs_messages").insert({
      user_id: currentAuthUser.id,
      username: currentProfile.name,
      text
    }).select(MESSAGE_FIELDS).single();
    sending = false;
    sendButton.disabled = !canPost();
    sendButton.textContent = "Send";
    if (error) {
      console.error("[BBS] Insert error:", error);
      // Give the draft back so nothing typed is lost.
      if (!input.value) input.value = text;
      renderCounter();
      feedbackDiv.textContent = "Message not sent. Your text is still in the box — press Send to try again.";
      input.focus();
      return;
    }
    addIncomingMessage(message, { forceScroll: true });
    input.focus();
  });
}

let leaveZork = () => {};

function rememberZorkCommand(text) {
  if (zorkHistory[zorkHistory.length - 1] !== text) zorkHistory.push(text);
  if (zorkHistory.length > 50) zorkHistory.shift();
  zorkHistoryIndex = -1;
}

// The Z-machine never echoes input, so show the typed command after its ">" prompt.
function echoZorkCommand(screen, text) {
  const last = screen.lastElementChild;
  const span = document.createElement("span");
  span.className = "bbs-zork-cmd";
  span.textContent = text;
  if (last && last.textContent.trimEnd().endsWith(">") && !last.querySelector(".bbs-zork-cmd")) {
    last.appendChild(span);
  } else {
    const line = document.createElement("div");
    line.textContent = ">";
    line.appendChild(span);
    screen.appendChild(line);
  }
  screen.scrollTop = screen.scrollHeight;
}

function renderZorkNote() {
  const note = els.zorkNote;
  if (!note) return;
  note.hidden = !(currentMode === "zork" && zorkChatPending > 0);
  note.textContent = `💬 ${zorkChatPending} new chat message${zorkChatPending === 1 ? "" : "s"} — type /exit to read`;
}

function canPost() {
  return Boolean(currentAuthUser && currentProfile && !currentProfile.is_disabled);
}

function isAdmin() {
  return currentProfile?.user_role === "Admin";
}

async function refreshBbsIdentity(authDiv, form, input, sendButton, feedbackDiv, userOverride) {
  let user = userOverride;
  if (user === undefined) {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("[BBS] Session lookup error:", error);
    user = data?.session?.user || null;
  }
  const previousUserId = currentAuthUser?.id || null;
  const previousRole = currentProfile?.user_role || null;
  currentAuthUser = user;
  currentProfile = null;
  if (user) {
    const { data: profile, error } = await supabase
      .from("community")
      .select("name, user_role, is_disabled")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) console.error("[BBS] Profile lookup error:", error);
    currentProfile = profile || null;
  }

  const postAllowed = canPost();
  input.disabled = !postAllowed;
  sendButton.disabled = !postAllowed;
  input.placeholder = currentMode === "zork"
    ? "Zork command…"
    : (postAllowed ? "Type a message…" : "Sign in to post…");
  if (postAllowed) {
    authDiv.innerHTML = `<span>Posting as <strong></strong></span> <button type="button" data-bbs-sign-out aria-label="Sign out of Community Chat">Sign out</button>`;
    authDiv.querySelector("strong").textContent = currentProfile.name;
    feedbackDiv.textContent = isAdmin() ? "Admin tools enabled." : "";
  } else {
    authDiv.innerHTML = `<span>Sign in to post:</span> <button type="button" data-provider="google"><i class="fab fa-google" aria-hidden="true"></i> Google</button> <button type="button" data-provider="github"><i class="fab fa-github" aria-hidden="true"></i> GitHub</button>`;
    if (user && !currentProfile) feedbackDiv.textContent = "An active CharlestonHacks member profile is required to post.";
    else if (user && currentProfile?.is_disabled) feedbackDiv.textContent = "This account cannot post messages.";
  }
  // The Zork command prompt remains usable to guests.
  if (currentMode === "zork") {
    input.disabled = false;
    sendButton.disabled = false;
  }
  form.setAttribute("aria-label", postAllowed ? "Send a public message" : "Sign in required to post a public message");

  // Own-message highlighting and admin Remove buttons depend on who is signed in.
  const identityChanged = previousUserId !== (currentAuthUser?.id || null) ||
    previousRole !== (currentProfile?.user_role || null);
  if (identityChanged) refreshMessageDecorations();
}

const BBS_STYLES = `
  #bbs-wrapper button { font-family: monospace; }
  #bbs-auth button[data-provider] {
    padding: 4px 10px; background: #000; color: #0f0; border: 1px solid #0f0;
    border-radius: 5px; cursor: pointer; font-size: 0.85rem;
  }
  #bbs-auth button[data-provider]:hover, #bbs-auth button[data-provider]:focus-visible {
    background: rgba(0,255,0,0.12); outline: 2px solid #0f0; outline-offset: 2px;
  }
  #bbs-auth button[data-provider]:disabled { opacity: 0.6; cursor: wait; }
  #bbs-screen:focus-visible { outline: 2px solid #9cff9c; outline-offset: 2px; }
  #bbs-screen::-webkit-scrollbar { width: 8px; }
  #bbs-screen::-webkit-scrollbar-thumb { background: rgba(0,255,0,0.35); border-radius: 4px; }
  #bbs-screen { scrollbar-color: rgba(0,255,0,0.35) transparent; }
  .bbs-older {
    display: block; margin: 0 auto 8px; padding: 3px 10px; background: #000; color: #9cff9c;
    border: 1px dashed rgba(0,255,0,0.5); border-radius: 4px; cursor: pointer; font-size: 0.8rem;
  }
  .bbs-older:hover, .bbs-older:focus-visible { background: rgba(0,255,0,0.1); outline: none; }
  .bbs-older:disabled { opacity: 0.6; cursor: wait; }
  .bbs-day {
    display: flex; align-items: center; gap: 8px; margin: 10px 0 6px;
    color: rgba(156,255,156,0.75); font-size: 0.78em; letter-spacing: 0.08em; text-transform: uppercase;
  }
  .bbs-day::before, .bbs-day::after { content: ""; flex: 1; border-top: 1px dashed rgba(0,255,0,0.25); }
  .bbs-chat-message {
    padding: 2px 6px; margin: 0 -6px; border-left: 2px solid transparent; border-radius: 2px;
    overflow-wrap: anywhere;
  }
  .bbs-chat-message:hover { background: rgba(0,255,0,0.05); }
  .bbs-chat-message.is-own { border-left-color: rgba(0,224,255,0.6); }
  .bbs-chat-message.is-mention { background: rgba(255,209,102,0.08); border-left-color: #ffd166; }
  .bbs-chat-message time { color: rgba(0,255,0,0.55); margin-right: 6px; font-size: 0.85em; }
  .bbs-name { font-weight: bold; margin-right: 6px; }
  .bbs-chat-message a { color: #00e0ff; text-decoration: underline; text-underline-offset: 2px; }
  .bbs-chat-message a:hover, .bbs-chat-message a:focus-visible { color: #fff; }
  .bbs-remove {
    margin-left: 8px; padding: 1px 5px; color: #ffd166; background: #000; border: 1px solid #775;
    cursor: pointer; font-size: 0.7rem; line-height: 1; opacity: 0.45;
  }
  .bbs-chat-message:hover .bbs-remove, .bbs-remove:focus-visible { opacity: 1; }
  .bbs-jump {
    align-self: center; margin: -4px 0 10px; padding: 4px 12px; border-radius: 999px;
    background: #0f0; color: #000; border: none; font-weight: bold; cursor: pointer; font-size: 0.85rem;
    box-shadow: 0 0 10px rgba(0,255,0,0.5);
  }
  .bbs-jump:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
  .bbs-zork-cmd { color: #fff; font-weight: bold; margin-left: 0.5ch; }
  .bbs-zork-note {
    align-self: center; margin: -4px 0 10px; padding: 3px 10px; border: 1px solid rgba(0,224,255,0.5);
    border-radius: 999px; color: #00e0ff; font-size: 0.8rem;
  }
  #bbs-send:disabled { opacity: 0.5; cursor: not-allowed; }
  #bbs-input:disabled { opacity: 0.6; }
  #bbs-input:focus-visible { outline: 2px solid #9cff9c; outline-offset: 1px; }
  .bbs-count { text-align: right; color: rgba(156,255,156,0.75); font-size: 0.78rem; margin-top: 4px; }
  .bbs-count.is-near { color: #ffd166; }
  .bbs-status-row {
    display: flex; flex-wrap: wrap; justify-content: space-between; gap: 6px 12px;
    margin-top: 12px; color: #0f0; font-size: 0.9rem;
  }
  .bbs-live::before { content: "●"; margin-right: 5px; }
  .bbs-live[data-state="live"] { color: #0f0; }
  .bbs-live[data-state="connecting"], .bbs-live[data-state="reconnecting"] { color: #ffd166; }
  @media (prefers-reduced-motion: no-preference) {
    .bbs-chat-message.is-new { animation: bbs-flash 1.2s ease-out; }
    @keyframes bbs-flash { from { background: rgba(0,255,0,0.18); } to { background: transparent; } }
  }
`;

const BBS_HTML = `
  <style>${BBS_STYLES}</style>
  <div id="bbs-wrapper" style="background:black; border:3px solid #0f0; padding:20px; width:min(90vw, 600px); max-height:90vh; border-radius:12px; box-shadow:0 0 20px #0f0; position:relative; margin:auto; display:flex; flex-direction:column;">
    <button id="bbs-close" aria-label="Close chat" style="position:absolute; top:8px; right:10px; background:black; color:#0f0; border:1px solid #0f0; font-family:monospace; cursor:pointer; padding:4px 8px; font-size:1rem; line-height:1;">✕</button>
    <h2 style="color:#0f0; text-align:center; margin-bottom:12px; font-family:monospace; font-size:clamp(1.2rem, 3vw, 1.5rem);">CharlestonHacks BBS</h2>
    <div id="bbs-auth" style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; color:#9cff9c; font:0.9rem monospace;" aria-live="polite"></div>
    <div id="bbs-screen" role="log" aria-label="Public chat messages" aria-live="polite" aria-relevant="additions" tabindex="0" style="background:#000; color:#0f0; height:min(300px, 40vh); overflow-y:auto; padding:10px; border:2px solid #0f0; margin-bottom:10px; font-family:monospace; font-size:clamp(0.85rem, 2vw, 1rem); line-height:1.45;"><button id="bbs-older" class="bbs-older" type="button" hidden>Load older messages</button></div>
    <button id="bbs-jump" class="bbs-jump" type="button" hidden></button>
    <div id="bbs-zork-note" class="bbs-zork-note" role="status" hidden></div>
    <form id="bbs-form" style="display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:stretch; width:100%; min-width:0; gap:10px;">
      <input id="bbs-input" type="text" maxlength="${MAX_MESSAGE_LENGTH}" autocomplete="off" enterkeyhint="send" aria-label="Type a public message" aria-describedby="bbs-count" placeholder="Sign in to post…" style="width:100%; min-width:0; background:black; color:#0f0; border:2px solid #0f0; padding:8px; font-family:monospace; font-size:16px; line-height:1.4;" />
      <button id="bbs-send" type="submit" style="padding:8px 16px; background:#0f0; color:black; border:none; font-family:monospace; font-weight:bold; cursor:pointer; white-space:nowrap;">Send</button>
    </form>
    <div id="bbs-count" class="bbs-count" aria-live="polite" hidden></div>
    <div id="bbs-feedback" role="status" aria-live="polite" style="min-height:1.3em; margin-top:8px; color:#ffd166; font:0.85rem monospace;"></div>
    <div class="bbs-status-row" style="font-family:monospace;">
      <span>Chat activity: <span id="bbs-online" aria-live="polite">Checking…</span></span>
      <span id="bbs-live" class="bbs-live" data-state="connecting">Connecting…</span>
    </div>
  </div>`;

function setBbsInputMode(input, sendButton, isZork) {
  input.placeholder = isZork
    ? "Zork command…"
    : (canPost() ? "Type a message…" : "Sign in to post…");
  input.setAttribute("aria-label", isZork ? "Enter a Zork command" : "Type a public message");
  input.maxLength = isZork ? 78 : MAX_MESSAGE_LENGTH;
  if (isZork) {
    input.disabled = false;
    sendButton.disabled = false;
  } else {
    input.disabled = !canPost();
    sendButton.disabled = !canPost();
    if (els.olderBtn) els.olderBtn.hidden = !hasOlderHistory;
  }
  renderCounter();
  input.focus();
}

/* ---------- Message rendering ---------- */

function parseDate(value) {
  const date = value ? new Date(value) : null;
  return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dayKey(date) {
  return date ? `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}` : "unknown";
}

function dayLabel(date) {
  if (!date) return "Earlier";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(date) === dayKey(today)) return "Today";
  if (dayKey(date) === dayKey(yesterday)) return "Yesterday";
  const sameYear = date.getFullYear() === today.getFullYear();
  return date.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric", ...(sameYear ? {} : { year: "numeric" }) });
}

function makeDaySeparator(date) {
  const sep = document.createElement("div");
  sep.className = "bbs-day";
  sep.setAttribute("role", "separator");
  sep.dataset.day = dayKey(date);
  sep.textContent = dayLabel(date);
  return sep;
}

// Stable, readable color per member name.
function nameColor(name) {
  let hash = 0;
  for (const ch of String(name)) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const hue = 70 + (hash % 220); // skip reds that read as errors on black
  return `hsl(${hue}, 85%, 66%)`;
}

const URL_PATTERN = /\bhttps?:\/\/[^\s<>"']+/gi;

// Builds text with safe, clickable http(s) links. Never uses innerHTML.
function appendLinkifiedText(parent, text) {
  let last = 0;
  for (const match of text.matchAll(URL_PATTERN)) {
    let href = match[0];
    // Trailing punctuation usually belongs to the sentence, not the URL.
    const trimmed = href.replace(/[.,!?;:)\]}]+$/, "");
    const start = match.index;
    href = trimmed;
    let parsed = null;
    try { parsed = new URL(href); } catch (_) {}
    if (!parsed || !/^https?:$/.test(parsed.protocol)) continue;
    if (start > last) parent.appendChild(document.createTextNode(text.slice(last, start)));
    const a = document.createElement("a");
    a.href = parsed.href;
    a.textContent = href;
    a.target = "_blank";
    a.rel = "noopener noreferrer nofollow ugc";
    parent.appendChild(a);
    last = start + href.length;
  }
  if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)));
}

function mentionsMe(msg) {
  const name = currentProfile?.name?.trim();
  if (!name || !msg.text || msg.user_id === currentAuthUser?.id) return false;
  return msg.text.toLowerCase().includes(`@${name.toLowerCase()}`) ||
    msg.text.toLowerCase().includes(`@${name.split(/\s+/)[0].toLowerCase()}`);
}

function buildMessageRow(msg) {
  const row = document.createElement("div");
  row.className = "bbs-chat-message";
  row.dataset.messageId = msg.id;
  const date = parseDate(msg.created_at);
  if (date) {
    const time = document.createElement("time");
    time.dateTime = date.toISOString();
    time.title = date.toLocaleString([], { dateStyle: "full", timeStyle: "short" });
    time.textContent = date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    row.appendChild(time);
  }
  const name = document.createElement("span");
  name.className = "bbs-name";
  name.textContent = msg.username || "Member";
  name.style.color = nameColor(msg.username || "Member");
  row.appendChild(name);
  const body = document.createElement("span");
  body.className = "bbs-text";
  appendLinkifiedText(body, msg.text || "");
  row.appendChild(body);
  decorateRow(row, msg);
  return row;
}

function decorateRow(row, msg) {
  row.classList.toggle("is-own", Boolean(currentAuthUser && msg.user_id === currentAuthUser.id));
  row.classList.toggle("is-mention", mentionsMe(msg));
  const existing = row.querySelector("[data-delete-message]");
  if (isAdmin() && !existing) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.className = "bbs-remove";
    removeButton.dataset.deleteMessage = msg.id;
    removeButton.textContent = "✕";
    removeButton.title = "Remove message";
    removeButton.setAttribute("aria-label", `Remove message from ${msg.username || "member"}`);
    row.appendChild(removeButton);
  } else if (!isAdmin() && existing) {
    existing.remove();
  }
}

function refreshMessageDecorations() {
  const { screen } = els;
  if (!screen) return;
  const byId = new Map(messages.map((m) => [String(m.id), m]));
  screen.querySelectorAll("[data-message-id]").forEach((row) => {
    const msg = byId.get(row.dataset.messageId);
    if (msg) decorateRow(row, msg);
  });
}

function lastChatDayKey(screen) {
  const rows = screen.querySelectorAll(".bbs-day");
  return rows.length ? rows[rows.length - 1].dataset.day : null;
}

function isNearBottom(screen) {
  return screen.scrollHeight - screen.scrollTop - screen.clientHeight < 48;
}

function scrollToBottom(screen) {
  screen.scrollTop = screen.scrollHeight;
}

function insertSorted(msg) {
  const id = String(msg.id);
  if (messageIds.has(id)) return -1;
  messageIds.add(id);
  const t = parseDate(msg.created_at)?.getTime() ?? Infinity;
  let i = messages.length;
  while (i > 0 && (parseDate(messages[i - 1].created_at)?.getTime() ?? Infinity) > t) i--;
  messages.splice(i, 0, msg);
  return i;
}

// Fully rebuilds the chat transcript from state. Used for history loads.
function renderAllMessages({ keepBottomOffset = false } = {}) {
  const { screen, olderBtn } = els;
  const bottomOffset = screen.scrollHeight - screen.scrollTop;
  const frag = document.createDocumentFragment();
  frag.appendChild(olderBtn);
  olderBtn.hidden = !hasOlderHistory || currentMode === "zork";
  let lastDay = null;
  for (const msg of messages) {
    const date = parseDate(msg.created_at);
    const key = dayKey(date);
    if (key !== lastDay) {
      frag.appendChild(makeDaySeparator(date));
      lastDay = key;
    }
    frag.appendChild(buildMessageRow(msg));
  }
  screen.replaceChildren(frag);
  if (!messages.length) write(screen, "Welcome! Say hi to start the conversation, or type zork to play.");
  if (keepBottomOffset) screen.scrollTop = screen.scrollHeight - bottomOffset;
  else scrollToBottom(screen);
}

// Adds one message (realtime, own send, or catch-up) without disturbing Zork output.
function addIncomingMessage(msg, { forceScroll = false } = {}) {
  if (!msg || msg.id === undefined) return;
  const { screen } = els;
  const index = insertSorted(msg);
  if (index < 0) return;

  if (currentMode === "zork") {
    // Keep the game screen clean; the message shows when the player exits.
    zorkChatPending += 1;
    renderZorkNote();
    if (document.hidden) { unreadCount += 1; updateDocumentTitle(); }
    return;
  }

  if (index !== messages.length - 1 && currentMode !== "zork") {
    // Arrived out of order: rebuild so separators stay correct.
    const stick = isNearBottom(screen);
    renderAllMessages({ keepBottomOffset: !stick });
    return;
  }

  const wasNearBottom = isNearBottom(screen);
  // Drop the empty-state welcome line once the first real message arrives.
  if (messages.length === 1) {
    screen.querySelectorAll(":scope > div:not(.bbs-chat-message):not(.bbs-day)").forEach((el) => {
      if (el.textContent.startsWith("Welcome!")) el.remove();
    });
  }
  const date = parseDate(msg.created_at);
  if (lastChatDayKey(screen) !== dayKey(date)) screen.appendChild(makeDaySeparator(date));
  const row = buildMessageRow(msg);
  row.classList.add("is-new");
  screen.appendChild(row);

  const fromMe = currentAuthUser && msg.user_id === currentAuthUser.id;
  if (forceScroll || wasNearBottom || fromMe) {
    scrollToBottom(screen);
  } else {
    unseenCount += 1;
    renderJumpButton();
  }
  if (document.hidden && !fromMe) {
    unreadCount += 1;
    updateDocumentTitle();
  }
}

function removeChatMessage(screen, id) {
  const key = String(id);
  messageIds.delete(key);
  messages = messages.filter((m) => String(m.id) !== key);
  const row = Array.from(screen.querySelectorAll("[data-message-id]"))
    .find((el) => el.dataset.messageId === key);
  if (!row) return;
  const prev = row.previousElementSibling;
  const next = row.nextElementSibling;
  row.remove();
  // Remove a day separator left with no messages under it.
  if (prev?.classList.contains("bbs-day") && (!next || next.classList.contains("bbs-day"))) prev.remove();
}

function renderJumpButton() {
  const { jumpBtn } = els;
  if (!jumpBtn) return;
  jumpBtn.hidden = unseenCount === 0;
  jumpBtn.textContent = `↓ ${unseenCount} new message${unseenCount === 1 ? "" : "s"}`;
}

function renderCounter() {
  const { input, counter } = els;
  if (!input || !counter) return;
  const len = input.value.length;
  const show = currentMode === "chat" && len >= COUNTER_THRESHOLD;
  counter.hidden = !show;
  counter.textContent = show ? `${MAX_MESSAGE_LENGTH - len} characters left` : "";
  counter.classList.toggle("is-near", len >= MAX_MESSAGE_LENGTH - 25);
}

function renderLiveStatus() {
  const { liveDiv } = els;
  if (!liveDiv) return;
  liveDiv.dataset.state = realtimeStatus;
  liveDiv.textContent = realtimeStatus === "live" ? "Live"
    : realtimeStatus === "reconnecting" ? "Reconnecting…" : "Connecting…";
}

function updateDocumentTitle() {
  if (!baseTitle) return;
  document.title = unreadCount > 0 ? `(${unreadCount}) ${baseTitle}` : baseTitle;
}

function write(screen, text) {
  text.split("\n").forEach((line) => {
    const div = document.createElement("div");
    div.textContent = line || "\u00a0"; // keep blank lines visible
    screen.appendChild(div);
  });
  screen.scrollTop = screen.scrollHeight;
}

/* ---------- Data loading ---------- */

async function loadMessages(screen, feedbackDiv) {
  // Newest page only; older history loads on request instead of all at once.
  const { data, error } = await supabase.from("bbs_messages")
    .select(MESSAGE_FIELDS)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  messages = [];
  messageIds = new Set();
  if (error) {
    console.error("[BBS] History load error:", error);
    hasOlderHistory = false;
    screen.replaceChildren();
    feedbackDiv.textContent = "Chat history could not be loaded.";
    return;
  }
  (data || []).forEach(insertSorted);
  hasOlderHistory = (data || []).length === HISTORY_PAGE_SIZE;
  renderAllMessages();
}

async function loadOlderMessages(feedbackDiv) {
  if (loadingOlder || !messages.length || currentMode === "zork") return;
  const { olderBtn } = els;
  loadingOlder = true;
  olderBtn.disabled = true;
  olderBtn.textContent = "Loading…";
  const { data, error } = await supabase.from("bbs_messages")
    .select(MESSAGE_FIELDS)
    .lt("created_at", messages[0].created_at)
    .order("created_at", { ascending: false })
    .limit(HISTORY_PAGE_SIZE);
  loadingOlder = false;
  olderBtn.disabled = false;
  olderBtn.textContent = "Load older messages";
  if (error) {
    console.error("[BBS] Older history error:", error);
    feedbackDiv.textContent = "Older messages could not be loaded.";
    return;
  }
  (data || []).forEach(insertSorted);
  hasOlderHistory = (data || []).length === HISTORY_PAGE_SIZE;
  if (currentMode !== "zork") renderAllMessages({ keepBottomOffset: true });
}

async function catchUpMessages() {
  const newest = messages[messages.length - 1];
  let query = supabase.from("bbs_messages").select(MESSAGE_FIELDS)
    .order("created_at", { ascending: true })
    .limit(HISTORY_PAGE_SIZE);
  if (newest?.created_at) query = query.gte("created_at", newest.created_at);
  const { data, error } = await query;
  if (error) {
    console.error("[BBS] Catch-up error:", error);
    return;
  }
  (data || []).forEach((msg) => addIncomingMessage(msg));
}

async function loadOnlineUsers(div) {
  const { data, error } = await supabase.from("bbs_online_active").select("*");
  if (error) {
    console.error("[BBS] Presence load error:", error);
    div.textContent = "unavailable";
    return;
  }
  const names = data?.map((user) => user.username).filter(Boolean) || [];
  div.textContent = names.length ? `${names.length} active (${names.join(", ")})` : "0 active";
}

async function heartbeat(username) {
  await supabase.from("bbs_online").upsert({ username, last_seen: new Date().toISOString(), zork_mode: currentMode === "zork" });
}

function loadOrGenerateUsername() {
  const stored = localStorage.getItem("bbs_username");
  if (stored) return stored;
  const guestName = `Guest${Math.floor(Math.random() * 9999)}`;
  localStorage.setItem("bbs_username", guestName);
  return guestName;
}
