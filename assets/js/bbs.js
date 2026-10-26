// ======================================================================
// CharlestonHacks BBS – FINAL 2025 BUILD (Option B + Close Button)
// ======================================================================

import { startZork, sendZorkCommand, getZorkState, setZorkState } from "./zorkLoader.js";
import { supabase } from "./supabaseClient.js";
import { saveZorkState, loadZorkState } from "./zork-supabase.js";

let initialized = false;
let currentScreenRef = null;
let currentMode = "chat";

// ================================================================
// ENTRY POINT
// ================================================================
export async function initBBS() {
  if (initialized) return;
  initialized = true;

  const modal = document.getElementById("bbs-modal");
  modal.innerHTML = BBS_HTML;
  modal.style.display = "flex";
  modal.style.alignItems = "center";
  modal.style.justifyContent = "center";

  const screen = modal.querySelector("#bbs-screen");
  const form = modal.querySelector("#bbs-form");
  const input = modal.querySelector("#bbs-input");
  const onlineDiv = modal.querySelector("#bbs-online");
  const feedbackDiv = modal.querySelector("#bbs-feedback");
  const closeBtn = modal.querySelector("#bbs-close");

  currentScreenRef = screen;
  currentMode = "chat";

  // Close button handler
  closeBtn.addEventListener("click", () => {
    if (currentMode === "zork") {
      write(screen, "Exited ZORK mode.\n");
      currentMode = "chat";
    }
    modal.style.display = "none";
  });

  const username = loadOrGenerateUsername();
  window.bbsUsername = username;

  await loadMessages(screen, feedbackDiv);

  supabase
    .channel("bbs_messages_channel")
    .on(
      "postgres_changes",
      { event: "INSERT", schema: "public", table: "bbs_messages" },
      (payload) => {
        const msg = payload.new;
        if (msg.username !== username) {
          writeChatMessage(screen, msg.username, msg.text, msg.created_at);
        }
      }
    )
    .subscribe();

  heartbeat(username);
  setInterval(() => heartbeat(username), 10000);

  loadOnlineUsers(onlineDiv);
  setInterval(() => loadOnlineUsers(onlineDiv), 7000);

  let mode = "chat";

  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    const text = input.value.trim();
    input.value = "";
    if (!text) return;

    if (mode === "zork") {
      if (text === "/exit") {
        write(screen, "Exited ZORK mode.\n");
        mode = "chat";
        currentMode = "chat";
        return;
      }

      if (text === "save") {
        await saveGame(username);
        return;
      }

      if (text === "restore") {
        await restoreGame(username);
        return;
      }

      sendZorkCommand(text, (txt) => write(screen, txt));
      return;
    }

    if (text === "zork" || text === "play zork" || text === "/zork") {
      write(screen, "Initializing ZORK… Type /exit to leave.\n");
      mode = "zork";
      currentMode = "zork";
      startZork((txt) => write(screen, txt));
      return;
    }

    feedbackDiv.textContent = "";
    const createdAt = new Date().toISOString();
    writeChatMessage(screen, username, text, createdAt);

    const { error } = await supabase.from("bbs_messages").insert({
      username,
      text
    });

    if (error) {
      console.error("[BBS] Insert error:", error);
      feedbackDiv.textContent = "Message not sent. Please try again.";
    }
  });
}

// ================================================================
// HTML
// ================================================================
const BBS_HTML = `
  <div id="bbs-wrapper"
       style="background:black; border:3px solid #0f0; padding:20px;
              width:min(90vw, 600px); max-height:90vh;
              border-radius:12px; box-shadow:0 0 20px #0f0;
              position:relative; margin:auto; display:flex;
              flex-direction:column;">

    <button id="bbs-close"
            style="position:absolute; top:8px; right:10px;
                   background:black; color:#0f0; border:1px solid #0f0;
                   font-family:monospace; cursor:pointer; padding:4px 8px;
                   font-size:1rem; line-height:1;">
      ✕
    </button>

    <h2 style="color:#0f0; text-align:center; margin-bottom:12px;
               font-family:monospace; font-size:clamp(1.2rem, 3vw, 1.5rem);">
      CharlestonHacks BBS
    </h2>

    <div id="bbs-screen" role="region" aria-label="Public chat messages" tabindex="0"
         style="background:#000; color:#0f0;
                height:min(300px, 40vh); overflow-y:auto;
                padding:10px; border:2px solid #0f0; margin-bottom:10px;
                font-family:monospace; font-size:clamp(0.85rem, 2vw, 1rem);
                line-height:1.4;"></div>

    <form id="bbs-form" style="display:flex; gap:10px; flex-wrap:wrap;">
      <input id="bbs-input" type="text" maxlength="500" autocomplete="off"
             aria-label="Type a public message" placeholder="type message..."
             style="flex:1; min-width:200px; background:black; color:#0f0;
                    border:2px solid #0f0; padding:8px;
                    font-family:monospace; font-size:0.95rem;" />
      <button type="submit" style="padding:8px 16px; background:#0f0;
                     color:black; border:none; font-family:monospace;
                     font-weight:bold; cursor:pointer;">
        Send
      </button>
    </form>

    <div id="bbs-feedback" role="status" aria-live="polite"
         style="min-height:1.3em; margin-top:8px; color:#ffd166; font:0.85rem monospace;"></div>
    <div style="margin-top:12px; color:#0f0; font-family:monospace;
                font-size:0.9rem;">
      People online: <span id="bbs-online" aria-live="polite">Checking…</span>
    </div>
  </div>
`;

// ================================================================
// HELPERS
// ================================================================
function writeChatMessage(screen, username, text, createdAt) {
  const row = document.createElement("div");
  row.className = "bbs-chat-message";

  const date = createdAt ? new Date(createdAt) : null;
  if (date && !Number.isNaN(date.getTime())) {
    const time = document.createElement("time");
    time.dateTime = date.toISOString();
    time.textContent = `[${date.toLocaleString([], { dateStyle: "short", timeStyle: "short" })}] `;
    time.style.color = "rgba(0, 255, 0, 0.68)";
    row.appendChild(time);
  }

  const message = document.createElement("span");
  message.textContent = `[${username || "Guest"}] ${text || ""}`;
  row.appendChild(message);

  const wasNearBottom = screen.scrollHeight - screen.scrollTop - screen.clientHeight < 32;
  screen.appendChild(row);
  if (wasNearBottom) screen.scrollTop = screen.scrollHeight;
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
  const { data, error } = await supabase
    .from("bbs_messages")
    .select("*")
    .order("created_at", { ascending: true });

  screen.replaceChildren();
  if (error) {
    console.error("[BBS] History load error:", error);
    feedbackDiv.textContent = "Chat history could not be loaded. You can still try sending a message.";
    return;
  }

  data?.forEach((msg) => writeChatMessage(screen, msg.username, msg.text, msg.created_at));
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
  const names = data?.map((u) => u.username).filter(Boolean) || [];
  div.textContent = names.length
    ? `${names.length} online: ${names.join(", ")}`
    : "0 people online right now";
}

async function heartbeat(username) {
  await supabase.from("bbs_online").upsert({
    username,
    last_seen: new Date().toISOString(),
    zork_mode: currentMode === "zork"
  });
}

function loadOrGenerateUsername() {
  const stored = localStorage.getItem("bbs_username");
  if (stored) return stored;

  const g = "Guest" + Math.floor(Math.random() * 9999);
  localStorage.setItem("bbs_username", g);
  return g;
}

// ================================================================
// SAVE / RESTORE
// ================================================================
async function saveGame(username) {
  const state = getZorkState();
  if (!state) {
    write(currentScreenRef, "No game is active to save.\n");
    return;
  }
  const encoded = new TextEncoder().encode(JSON.stringify(state));
  await saveZorkState(username, encoded);
  write(currentScreenRef, "Game saved.\n");
}

async function restoreGame(username) {
  const data = await loadZorkState(username);
  if (!data) {
    write(currentScreenRef, "No saved game found.\n");
    return;
  }
  const json = JSON.parse(new TextDecoder().decode(data));
  setZorkState(json);
  write(currentScreenRef, "Game restored.\n");
}
