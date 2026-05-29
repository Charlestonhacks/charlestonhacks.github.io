// zorkLoader.js – real Z-machine using zmachine@0.3.0

const ZM_ESM = 'https://cdn.jsdelivr.net/npm/zmachine@0.3.0/dist/zmachine.esm.min.js';
const STORY_PATH = '/assets/zork/zork1.z3';

let zm = null;
let lineResolve = null;
let charResolve = null;

class BbsIOAdapter {
  constructor(writeFn) {
    this._write = writeFn;
    this._buf = '';
  }

  _flush() {
    if (!this._buf) return;
    this._write(this._buf);
    this._buf = '';
  }

  initialize() {}

  print(text) {
    this._buf += text;
    if (this._buf.includes('\n')) this._flush();
  }

  printLine(text) {
    this._buf += (text || '') + '\n';
    this._flush();
  }

  newLine() {
    this._buf += '\n';
    this._flush();
  }

  readLine(maxLength = 78) {
    this._flush();
    return new Promise(resolve => { lineResolve = resolve; });
  }

  readChar() {
    this._flush();
    return new Promise(resolve => { charResolve = resolve; });
  }

  quit() {
    this._flush();
    this._write('\n[ZORK ended — type zork to start over]\n');
    zm = null;
    lineResolve = null;
    charResolve = null;
  }

  restart() {
    this._flush();
    this._write('\n[ZORK restarted]\n');
  }

  // Optional stubs to satisfy the interface
  setWindow() {}
  splitWindow() {}
  eraseWindow() {}
  showStatusLine() {}
  setTextStyle() {}
  setBufferMode() {}
  getBufferMode() { return true; }
  verify() { return true; }
}

export async function startZork(write) {
  if (zm) {
    write('[ZORK already running — type /exit to leave]\n');
    return;
  }

  write('Loading ZORK I…\n');

  let ZMachine;
  try {
    ({ ZMachine } = await import(ZM_ESM));
  } catch (err) {
    write(`[Failed to load Z-machine engine: ${err.message}]\n`);
    return;
  }

  let storyBuffer;
  try {
    storyBuffer = await fetch(STORY_PATH).then(r => {
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      return r.arrayBuffer();
    });
  } catch (err) {
    write(`[Failed to fetch story file: ${err.message}]\n`);
    return;
  }

  const io = new BbsIOAdapter(write);

  try {
    zm = ZMachine.load(storyBuffer, io);
  } catch (err) {
    write(`[Failed to initialize Z-machine: ${err.message}]\n`);
    zm = null;
    return;
  }

  zm.run().catch(err => {
    write(`[ZORK error: ${err.message}]\n`);
    zm = null;
    lineResolve = null;
    charResolve = null;
  });
}

export function sendZorkCommand(cmd, write) {
  if (!zm) {
    write('[No ZORK session active]\n');
    return;
  }
  if (lineResolve) {
    const resolve = lineResolve;
    lineResolve = null;
    resolve({ text: cmd, terminator: 13 });
  } else if (charResolve) {
    const resolve = charResolve;
    charResolve = null;
    resolve(cmd.charCodeAt(0) || 13);
  }
}

// Save/restore stubs — kept for API compatibility with bbs.js
export function getZorkState() {
  return null;
}

export function setZorkState() {}
