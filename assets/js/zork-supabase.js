// Supabase persistence for Z-machine Quetzal save files.
import { supabase } from "./supabaseClient.js";

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

export async function saveZorkState(username, saveData) {
  if (!username) throw new Error("A guest name is required to save the game.");
  const bytes = saveData instanceof Uint8Array ? saveData : new Uint8Array(saveData);
  const { error } = await supabase
    .from("zork_saves")
    .upsert({
      username,
      save_data: toBase64(bytes),
      updated_at: new Date().toISOString()
    }, { onConflict: "username" });
  if (error) throw error;
}

export async function loadZorkState(username) {
  if (!username) throw new Error("A guest name is required to restore the game.");
  const { data, error } = await supabase
    .from("zork_saves")
    .select("save_data")
    .eq("username", username)
    .maybeSingle();
  if (error) throw error;
  if (!data?.save_data) return null;
  return fromBase64(data.save_data);
}
