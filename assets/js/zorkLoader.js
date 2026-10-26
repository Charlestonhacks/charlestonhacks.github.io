// Zork I browser adapter for the CharlestonHacks BBS.
const ZM_ESM = "https://cdn.jsdelivr.net/npm/zmachine@0.3.0/dist/zmachine.esm.min.js";
const STORY_PATH = "/assets/zork/zork1.z3";

let activeSession = null;
let pendingStart = null;

class BbsIOAdapter {
  constructor(write, username, onEnd) {
    this._write = write;
    this._username = username;
    this._onEnd = onEnd;
    this._buffer = "";
    this._lineResolver = null;
    this._charResolver = null;
    this._version = 0;
    this._stopRequested = false;
    this._stopQuitSent = false;
    this._ended = false;
  }

  initialize(version) { this._version = version; }

  _flush() {
    if (!this._buffer) return;
    this._write(this._buffer);
    this._buffer = "";
  }

  print(text) {
    this._buffer += text;
    if (this._buffer.includes("\n")) this._flush();
  }

  printLine(text) {
    this._buffer += (text || "") + "\n";
    this._flush();
  }

  newLine() {
    this._buffer += "\n";
    this._flush();
  }

  readLine(maxLength = 78) {
    this._flush();
    if (this._stopRequested && !this._stopQuitSent) {
      this._stopQuitSent = true;
      return Promise.resolve({ text: "quit", terminator: 13 });
    }
    if (this._stopRequested && this._stopQuitSent) {
      this._stopRequested = false;
      return Promise.resolve({ text: "yes", terminator: 13 });
    }
    return new Promise(resolve => {
      this._lineResolver = text => resolve({ text: text.slice(0, maxLength), terminator: 13 });
    });
  }

  readChar() {
    this._flush();
    return new Promise(resolve => { this._charResolver = resolve; });
  }

  acceptCommand(command) {
    if (this._ended) return false;
    if (this._lineResolver) {
      const resolve = this._lineResolver;
      this._lineResolver = null;
      resolve(command);
      return true;
    }
    if (this._charResolver) {
      const resolve = this._charResolver;
      this._charResolver = null;
      resolve(command.charCodeAt(0) || 13);
      return true;
    }
    return false;
  }

  async save(data) {
    try {
      const { saveZorkState } = await import("./zork-supabase.js");
      await saveZorkState(this._username, data);
      this._write("\n[Game saved for this guest name.]\n");
      return true;
    } catch (error) {
      console.error("[ZORK] Save failed:", error);
      this._write("\n[Could not save the game. Please try again later.]\n");
      return false;
    }
  }

  async restore() {
    try {
      const { loadZorkState } = await import("./zork-supabase.js");
      const data = await loadZorkState(this._username);
      if (!data) this._write("\n[No saved game was found for this guest name.]\n");
      return data;
    } catch (error) {
      console.error("[ZORK] Restore failed:", error);
      this._write("\n[Could not restore the game. Please try again later.]\n");
      return null;
    }
  }

  showStatusLine(left, right, isTime = false) {
    const status = isTime ? `Time: ${left}  ${right}` : `${left}  Score: ${right}`;
    this._write(`\n[${status}]\n`);
  }

  stop() {
    if (this._ended) return;
    this._stopRequested = true;
    if (this._lineResolver) {
      const resolve = this._lineResolver;
      this._lineResolver = null;
      this._stopQuitSent = true;
      resolve("quit");
    } else if (this._charResolver) {
      const resolve = this._charResolver;
      this._charResolver = null;
      this._stopQuitSent = true;
      resolve("q".charCodeAt(0));
    }
  }

  quit() {
    this._flush();
    if (this._ended) return;
    this._ended = true;
    this._lineResolver = null;
    this._charResolver = null;
    if (activeSession?.io === this) activeSession = null;
    this._write("\n[ZORK ended — type zork to start over]\n");
    this._onEnd?.();
  }

  restart() {
    this._flush();
    this._write("\n[ZORK restarted]\n");
  }

  setWindow() {}
  splitWindow() {}
  eraseWindow() {}
  setTextStyle() {}
  setBufferMode() {}
  getBufferMode() { return true; }
  verify() { return true; }
}

export async function startZork(write, { username = "Guest", onEnd } = {}) {
  if (activeSession || pendingStart) {
    write("[ZORK is already running — type /exit to return to chat.]\n");
    return false;
  }

  const request = { cancelled: false };
  pendingStart = request;
  write("Loading ZORK I…\n");

  let ZMachine;
  try {
    ({ ZMachine } = await import(ZM_ESM));
  } catch (error) {
    if (pendingStart === request) pendingStart = null;
    write("[Failed to load Z-machine engine: " + error.message + "]\n");
    return false;
  }
  if (request.cancelled) {
    if (pendingStart === request) pendingStart = null;
    return false;
  }

  let storyBuffer;
  try {
    const response = await fetch(STORY_PATH);
    if (!response.ok) throw new Error("HTTP " + response.status);
    storyBuffer = await response.arrayBuffer();
  } catch (error) {
    if (pendingStart === request) pendingStart = null;
    write("[Failed to fetch story file: " + error.message + "]\n");
    return false;
  }
  if (request.cancelled) {
    if (pendingStart === request) pendingStart = null;
    return false;
  }

  const io = new BbsIOAdapter(write, username, onEnd);
  let machine;
  try {
    machine = ZMachine.load(storyBuffer, io);
    io.initialize(machine.version);
  } catch (error) {
    if (pendingStart === request) pendingStart = null;
    write("[Failed to initialize Z-machine: " + error.message + "]\n");
    return false;
  }

  if (request.cancelled) {
    if (pendingStart === request) pendingStart = null;
    return false;
  }
  activeSession = { machine, io };
  if (pendingStart === request) pendingStart = null;
  machine.run().catch(error => {
    console.error("[ZORK] Interpreter error:", error);
    write("[ZORK error: " + error.message + "]\n");
    io.quit();
  });
  return true;
}
export function sendZorkCommand(command) {
  return activeSession?.io.acceptCommand(command) ?? false;
}

export function stopZork() {
  if (pendingStart) pendingStart.cancelled = true;
  activeSession?.io.stop();
}
