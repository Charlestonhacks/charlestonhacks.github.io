// CharlestonHacks public BBS, authenticated posting, and Zork mode.
import { startZork, sendZorkCommand, stopZork } from "./zorkLoader.js";
import { supabase } from "./supabaseClient.js";

let initialized = false;
let currentMode = "chat";
let renderedMessageIds = new Set();
let currentAuthUser = null;
let currentProfile = null;

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
  const feedbackDiv = modal.querySelector("#bbs-feedback");
  const authDiv = modal.querySelector("#bbs-auth");
  const closeBtn = modal.querySelector("#bbs-close");
  const guestName = loadOrGenerateUsername();
  window.bbsUsername = guestName;

  closeBtn.addEventListener("click", () => {
    if (currentMode === "zork") {
      stopZork();
      write(screen, "Exited ZORK mode.\n");
      currentMode = "chat";
      setBbsInputMode(input, sendButton, false);
    }
    modal.style.display = "none";
  });

  authDiv.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-provider]");
    if (!button) return;
    button.disabled = true;
    feedbackDiv.textContent = "Opening sign-in…";

    const embedded = window.self !== window.top;
    if (embedded) {
      try { localStorage.setItem("ch:bbs-return-to-hub", "1"); } catch (_) {}
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
    } else {
      let returnToHub = false;
      try {
        returnToHub = localStorage.getItem("ch:bbs-return-to-hub") === "1";
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
  if (url.searchParams.has("error")) {
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
      writeChatMessage(screen, msg, currentProfile?.user_role === "Admin");
    })
    .on("postgres_changes", { event: "DELETE", schema: "public", table: "bbs_messages" }, ({ old: msg }) => {
      removeChatMessage(screen, msg.id);
    })
    .subscribe();

  heartbeat(guestName);
  window.setInterval(() => heartbeat(guestName), 10000);
  loadOnlineUsers(onlineDiv);
  window.setInterval(() => loadOnlineUsers(onlineDiv), 7000);

  // Admin moderation is enforced by RLS; this delegated handler only exposes the control.
  screen.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-delete-message]");
    if (!button || currentProfile?.user_role !== "Admin") return;
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

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    input.value = "";

    if (currentMode === "zork") {
      if (text === "/exit") {
        stopZork();
        write(screen, "Exited ZORK mode.\n");
        currentMode = "chat";
        setBbsInputMode(input, sendButton, false);
        return;
      }
      if (text.toLowerCase() === "/chs") {
        write(screen, "A signal resolves: CHARLESTONHACKS, CHARLESTON, SC.\nBy the harbor, builders, designers, and curious minds gather for hackathons—to form teams, share skills, and make things together.\nThe next challenge is aboveground; yours waits below.\n");
        return;
      }
      sendZorkCommand(text);
      return;
    }

    if (["zork", "play zork", "/zork"].includes(text.toLowerCase())) {
      write(screen, "CHARLESTONHACKS BBS PRESENTS: ZORK I\nA classic Great Underground Empire adventure.\nType /exit to return to chat; /chs for a CharlestonHacks signal.\nSave with save; later, start Zork and type restore.\nYour save is tied to this browser guest name; each new save replaces the last.\n");
      currentMode = "zork";
      setBbsInputMode(input, sendButton, true);
      input.disabled = true;
      const started = await startZork((output) => write(screen, output), {
        username: guestName,
        onEnd: () => {
          currentMode = "chat";
          setBbsInputMode(input, sendButton, false);
        }
      });
      input.disabled = false;
      if (!started) {
        currentMode = "chat";
        setBbsInputMode(input, sendButton, false);
      }
      return;
    }

    if (!currentAuthUser || !currentProfile || currentProfile.is_disabled) {
      feedbackDiv.textContent = "Sign in with an active member account to post.";
      return;
    }
    feedbackDiv.textContent = "";
    sendButton.disabled = true;
    const { data: message, error } = await supabase.from("bbs_messages").insert({
      user_id: currentAuthUser.id,
      username: currentProfile.name,
      text
    }).select("id, user_id, username, text, created_at").single();
    sendButton.disabled = false;
    if (error) {
      console.error("[BBS] Insert error:", error);
      feedbackDiv.textContent = "Message not sent. Please try again.";
      return;
    }
    writeChatMessage(screen, message, currentProfile.user_role === "Admin");
  });
}

async function refreshBbsIdentity(authDiv, form, input, sendButton, feedbackDiv, userOverride) {
  let user = userOverride;
  if (user === undefined) {
    const { data, error } = await supabase.auth.getSession();
    if (error) console.error("[BBS] Session lookup error:", error);
    user = data?.session?.user || null;
  }
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

  const canPost = Boolean(user && currentProfile && !currentProfile.is_disabled);
  input.disabled = !canPost;
  sendButton.disabled = !canPost;
  input.placeholder = currentMode === "zork"
    ? "Zork command (or /exit)..."
    : (canPost ? "type message..." : "Sign in to post…");
  if (canPost) {
    authDiv.innerHTML = `<span>Posting as <strong></strong></span>`;
    authDiv.querySelector("strong").textContent = currentProfile.name;
    feedbackDiv.textContent = currentProfile.user_role === "Admin" ? "Admin tools enabled." : "";
  } else {
    authDiv.innerHTML = `<span>Sign in to post:</span> <button type="button" data-provider="google">Google</button> <button type="button" data-provider="github">GitHub</button>`;
    if (user && !currentProfile) feedbackDiv.textContent = "An active CharlestonHacks member profile is required to post.";
    else if (user && currentProfile?.is_disabled) feedbackDiv.textContent = "This account cannot post messages.";
  }
  // The Zork command prompt remains usable to guests.
  if (currentMode === "zork") {
    input.disabled = false;
    sendButton.disabled = false;
  }
  form.setAttribute("aria-label", canPost ? "Send a public message" : "Sign in required to post a public message");
}

const BBS_HTML = `
  <div id="bbs-wrapper" style="background:black; border:3px solid #0f0; padding:20px; width:min(90vw, 600px); max-height:90vh; border-radius:12px; box-shadow:0 0 20px #0f0; position:relative; margin:auto; display:flex; flex-direction:column;">
    <button id="bbs-close" aria-label="Close chat" style="position:absolute; top:8px; right:10px; background:black; color:#0f0; border:1px solid #0f0; font-family:monospace; cursor:pointer; padding:4px 8px; font-size:1rem; line-height:1;">✕</button>
    <h2 style="color:#0f0; text-align:center; margin-bottom:12px; font-family:monospace; font-size:clamp(1.2rem, 3vw, 1.5rem);">CharlestonHacks BBS</h2>
    <div id="bbs-auth" style="display:flex; align-items:center; justify-content:center; flex-wrap:wrap; gap:8px; margin-bottom:10px; color:#9cff9c; font:0.9rem monospace;" aria-live="polite"></div>
    <div id="bbs-screen" role="region" aria-label="Public chat messages" tabindex="0" style="background:#000; color:#0f0; height:min(300px, 40vh); overflow-y:auto; padding:10px; border:2px solid #0f0; margin-bottom:10px; font-family:monospace; font-size:clamp(0.85rem, 2vw, 1rem); line-height:1.4;"></div>
    <form id="bbs-form" style="display:grid; grid-template-columns:minmax(0, 1fr) auto; align-items:stretch; width:100%; min-width:0; gap:10px;">
      <input id="bbs-input" type="text" maxlength="500" autocomplete="off" aria-label="Type a public message" placeholder="Sign in to post…" style="width:100%; min-width:0; background:black; color:#0f0; border:2px solid #0f0; padding:8px; font-family:monospace; font-size:16px; line-height:1.4;" />
      <button id="bbs-send" type="submit" style="padding:8px 16px; background:#0f0; color:black; border:none; font-family:monospace; font-weight:bold; cursor:pointer; white-space:nowrap;">Send</button>
    </form>
    <div id="bbs-feedback" role="status" aria-live="polite" style="min-height:1.3em; margin-top:8px; color:#ffd166; font:0.85rem monospace;"></div>
    <div style="margin-top:12px; color:#0f0; font-family:monospace; font-size:0.9rem;">People online: <span id="bbs-online" aria-live="polite">Checking…</span></div>
  </div>`;

function setBbsInputMode(input, sendButton, isZork) {
  input.placeholder = isZork ? "Zork command (or /exit)..." : (currentAuthUser ? "type message..." : "Sign in to post…");
  input.setAttribute("aria-label", isZork ? "Enter a Zork command" : "Type a public message");
  input.maxLength = isZork ? 78 : 500;
  if (isZork) {
    input.disabled = false;
    sendButton.disabled = false;
  } else {
    const canPost = Boolean(currentAuthUser && currentProfile && !currentProfile.is_disabled);
    input.disabled = !canPost;
    sendButton.disabled = !canPost;
  }
  input.focus();
}

function writeChatMessage(screen, msg, isAdmin) {
  if (!msg || msg.id === undefined || renderedMessageIds.has(String(msg.id))) return;
  renderedMessageIds.add(String(msg.id));
  const row = document.createElement("div");
  row.className = "bbs-chat-message";
  row.dataset.messageId = msg.id;
  const date = msg.created_at ? new Date(msg.created_at) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const time = document.createElement("time");
    time.dateTime = date.toISOString();
    time.textContent = `[${date.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}] `;
    time.style.color = "rgba(0, 255, 0, 0.68)";
    row.appendChild(time);
  }
  const message = document.createElement("span");
  message.textContent = `[${msg.username || "Member"}] ${msg.text || ""}`;
  row.appendChild(message);
  if (isAdmin) {
    const removeButton = document.createElement("button");
    removeButton.type = "button";
    removeButton.dataset.deleteMessage = msg.id;
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", "Remove this message");
    removeButton.style.cssText = "margin-left:8px; padding:1px 5px; color:#ffd166; background:#000; border:1px solid #775; cursor:pointer; font:0.75rem monospace;";
    row.appendChild(removeButton);
  }
  const wasNearBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 32;
  screen.appendChild(row);
  if (wasNearBottom) screen.scrollTop = screen.scrollHeight;
}

function removeChatMessage(screen, id) {
  renderedMessageIds.delete(String(id));
  Array.from(screen.querySelectorAll("[data-message-id]"))
    .find((row) => row.dataset.messageId === String(id))?.remove();
}

function write(screen, text) {
  text.split("\n").forEach((line) => {
    const div = document.createElement("div");
    div.textContent = line;
    screen.appendChild(div);
  });
  screen.scrollTop = screen.scrollHeight;
}

async function loadMessages(screen, feedbackDiv) {
  const { data, error } = await supabase.from("bbs_messages")
    .select("id, user_id, username, text, created_at")
    .order("created_at", { ascending: true });
  screen.replaceChildren();
  renderedMessageIds = new Set();
  if (error) {
    console.error("[BBS] History load error:", error);
    feedbackDiv.textContent = "Chat history could not be loaded.";
    return;
  }
  data?.forEach((msg) => writeChatMessage(screen, msg, currentProfile?.user_role === "Admin"));
  if (!data?.length) write(screen, "Welcome! Start the conversation or type zork to play.");
  screen.scrollTop = screen.scrollHeight;
}

async function loadOnlineUsers(div) {
  const { data, error } = await supabase.from("bbs_online_active").select("*");
  if (error) {
    console.error("[BBS] Presence load error:", error);
    div.textContent = "unavailable";
    return;
  }
  const names = data?.map((user) => user.username).filter(Boolean) || [];
  div.textContent = names.length ? `${names.length} online: ${names.join(", ")}` : "0 people online right now";
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
