// Supabase persistence for Z-machine Quetzal save files.
// Each browser keeps a random secret save key; the database stores only its hash
// and is reached through zork_save()/zork_load(), never the table directly.
import { supabase } from "./supabaseClient.js";

const SAVE_KEY_STORAGE = "ch:zork-save-key";

function toBase64(bytes) {
  const array = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const chunkSize = 0x8000;
  let binary = "";
  for (let offset = 0; offset < array.length; offset += chunkSize) {
    binary += String.fromCharCode(...array.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

function fromBase64(encoded) {
  const binary = atob(encoded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function newSaveKey() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// Returns this browser's save key, creating one on first use.
export function getSaveKey({ create = true } = {}) {
  let key = null;
  try { key = localStorage.getItem(SAVE_KEY_STORAGE); } catch (_) { /* storage blocked */ }
  if (key && /^[0-9a-f]{64}$/.test(key)) return key;
  if (!create) return null;
  key = newSaveKey();
  try { localStorage.setItem(SAVE_KEY_STORAGE, key); } catch (_) {
    throw new Error("Saving needs browser storage, which is blocked here.");
  }
  return key;
}

// The guest name is no longer used to find saves; kept in the signature for callers.
export async function saveZorkState(_username, saveData) {
  const bytes = saveData instanceof Uint8Array ? saveData : new Uint8Array(saveData);
  const { error } = await supabase.rpc("zork_save", { p_key: getSaveKey(), p_data: toBase64(bytes) });
  if (error) throw error;
}

export async function loadZorkState(_username) {
  const key = getSaveKey({ create: false });
  if (!key) return null;
  const { data, error } = await supabase.rpc("zork_load", { p_key: key });
  if (error) throw error;
  if (!data) return null;
  return fromBase64(data);
}
