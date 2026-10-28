import { supabase } from "./supabaseClient.js";

const CHANNEL = "chs-buildspace-auth-v1";
const BUILDSPACE_ORIGIN = "https://deckerd451.github.io";
const BUILDSPACE_PATH = "/innovation-engine/";
const frame = document.getElementById("portal-buildspace-frame");
const accountControls = document.getElementById("portal-account-controls");
const accountName = document.getElementById("portal-account-name");
const signOutButton = document.getElementById("portal-sign-out");

let activeSession = null;
let activeMember = false;
let activeProfileName = "";
let pendingNonce = null;
let authRevision = 0;

function getBuildspaceFrame() {
  if (!frame?.contentWindow || !frame.hasAttribute("src")) return null;
  try {
    const url = new URL(frame.src);
    if (url.origin !== BUILDSPACE_ORIGIN || url.pathname !== BUILDSPACE_PATH) return null;
    return frame.contentWindow;
  } catch {
    return null;
  }
}

function sendToBuildspace(type, extra = {}) {
  const target = getBuildspaceFrame();
  if (!target || !pendingNonce) return;
  target.postMessage({ channel: CHANNEL, type, nonce: pendingNonce, ...extra }, BUILDSPACE_ORIGIN);
}

async function refreshMemberAccess(session) {
  const revision = ++authRevision;
  activeSession = session || null;
  activeMember = false;
  window.__CH_SESSION__ = activeSession;
  window.__CH_MEMBER_AUTH__ = false;

  if (activeSession?.user?.id) {
    try {
      const { data: profile, error } = await supabase
        .from("community")
        .select("name, is_disabled")
        .eq("user_id", activeSession.user.id)
        .maybeSingle();
      if (revision !== authRevision) return;
      activeProfileName = !error && profile ? (profile.name || "") : "";
      activeMember = !error && Boolean(profile) && profile.is_disabled !== true;
    } catch (error) {
      console.warn("[PORTAL AUTH] Member check failed:", error);
    }
  }

  if (revision !== authRevision) return;
  window.__CH_MEMBER_AUTH__ = activeMember;
  if (accountControls) accountControls.hidden = !activeSession?.user;
  if (accountName) accountName.textContent = activeProfileName || activeSession?.user?.email || "Signed in";
  if (signOutButton) {
    signOutButton.disabled = false;
    signOutButton.textContent = "Sign out";
  }
  window.dispatchEvent(new CustomEvent("ch:member-auth-changed", {
    detail: { authorized: activeMember }
  }));

  if (pendingNonce) {
    if (activeMember && activeSession?.access_token && activeSession?.refresh_token) {
      sendToBuildspace("SESSION", {
        tokens: {
          access_token: activeSession.access_token,
          refresh_token: activeSession.refresh_token
        }
      });
    } else {
      sendToBuildspace("AUTH_REQUIRED");
    }
  }
}

function validNonce(value) {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{20,80}$/.test(value);
}

signOutButton?.addEventListener("click", async () => {
  if (!signOutButton) return;
  signOutButton.disabled = true;
  signOutButton.textContent = "Signing out…";
  const { error } = await supabase.auth.signOut({ scope: "local" });
  if (error) {
    console.error("[PORTAL AUTH] Sign-out failed:", error);
    signOutButton.disabled = false;
    signOutButton.textContent = "Try again";
  }
});

window.addEventListener("message", async (event) => {
  if (event.origin !== BUILDSPACE_ORIGIN || event.source !== getBuildspaceFrame()) return;
  const message = event.data;
  if (!message || message.channel !== CHANNEL || !validNonce(message.nonce)) return;

  if (message.type === "REQUEST") {
    pendingNonce = message.nonce;
    const { data, error } = await supabase.auth.getSession();
    if (error) {
      console.warn("[PORTAL AUTH] Session lookup failed:", error);
      await refreshMemberAccess(null);
      return;
    }
    await refreshMemberAccess(data?.session || null);
    return;
  }

  if (message.type === "SIGN_OUT_REQUEST" && message.nonce === pendingNonce) {
    await supabase.auth.signOut({ scope: "local" });
  }
});

supabase.auth.onAuthStateChange((_event, session) => {
  setTimeout(() => refreshMemberAccess(session), 0);
});

(async () => {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    await refreshMemberAccess(data?.session || null);
  } catch (error) {
    console.warn("[PORTAL AUTH] Initial session check failed:", error);
    await refreshMemberAccess(null);
  }
})();
