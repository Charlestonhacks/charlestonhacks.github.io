// Self-drawing Zork map for the CharlestonHacks BBS.
// Rooms appear as the player discovers them and are saved in this browser only.

const CELL_W = 128;
const CELL_H = 64;
const BOX_W = 108;
const BOX_H = 40;
const PAD = 24;
const SVG_NS = "http://www.w3.org/2000/svg";

const DIRECTIONS = {
  n: "n", north: "n", s: "s", south: "s", e: "e", east: "e", w: "w", west: "w",
  ne: "ne", northeast: "ne", nw: "nw", northwest: "nw",
  se: "se", southeast: "se", sw: "sw", southwest: "sw",
  u: "up", up: "up", d: "down", down: "down",
  in: "in", inside: "in", enter: "in", out: "out", outside: "out", exit: "out"
};

const VECTORS = {
  n: [0, -1], s: [0, 1], e: [1, 0], w: [-1, 0],
  ne: [1, -1], nw: [-1, -1], se: [1, 1], sw: [-1, 1]
};

const OPPOSITE = { n: "s", s: "n", e: "w", w: "e", ne: "sw", sw: "ne", nw: "se", se: "nw", up: "down", down: "up", in: "out", out: "in" };

// Commands that change rooms without walking there; never draw a connection for them.
const NON_TRAVEL = /^(restore|restart|undo|quit|load)\b/;

const BADGES = { up: "↑", down: "↓", in: "in", out: "out" };

function emptyState() {
  // exits: directions actually taken out of each room; blocked: tried and refused.
  return { version: 2, rooms: {}, edges: {}, exits: {}, blocked: {}, current: null };
}

export function parseDirection(command) {
  const words = String(command || "").toLowerCase().trim()
    .replace(/^(go|walk|run|move|head|climb|crawl)\s+/, "")
    .replace(/^(to the|to)\s+/, "")
    .split(/\s+/);
  return DIRECTIONS[words[0]] || null;
}

export function createZorkMap({ storageKey }) {
  let state = load();

  function load() {
    try {
      const raw = localStorage.getItem(storageKey);
      const parsed = raw ? JSON.parse(raw) : null;
      if (parsed?.version === 2 && parsed.rooms && parsed.edges) {
        parsed.exits ||= {};
        parsed.blocked ||= {};
        return parsed;
      }
    } catch (_) { /* storage unavailable or corrupt: start fresh */ }
    return emptyState();
  }

  function save() {
    try { localStorage.setItem(storageKey, JSON.stringify(state)); } catch (_) { /* ignore */ }
  }

  function occupied(x, y, ignoreId = null) {
    return Object.entries(state.rooms).some(([rid, room]) => rid !== ignoreId && room.x === x && room.y === y);
  }

  function hasGridEdge(id) {
    return Object.values(state.edges).some((e) => (e.a === id || e.b === id) && VECTORS[e.dir]);
  }

  // A room reached by "enter window", "up" etc. was placed by guess. If a later
  // compass move from it is blocked, slide it to a nearby cell where both fit.
  function relocateFloating(id, vec) {
    const room = state.rooms[id];
    const anchor = room?.anchor ? state.rooms[room.anchor] : null;
    if (!room?.floating || !anchor || hasGridEdge(id)) return false;
    for (let r = 1; r <= 2; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          const x = anchor.x + dx, y = anchor.y + dy;
          if (occupied(x, y, id) || occupied(x + vec[0], y + vec[1], id)) continue;
          room.x = x; room.y = y;
          return true;
        }
      }
    }
    return false;
  }

  // Nearest free grid cell to (x, y), searching outward ring by ring.
  function freeCellNear(x, y) {
    if (!occupied(x, y)) return [x, y];
    for (let r = 1; r < 40; r += 1) {
      for (let dy = -r; dy <= r; dy += 1) {
        for (let dx = -r; dx <= r; dx += 1) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!occupied(x + dx, y + dy)) return [x + dx, y + dy];
        }
      }
    }
    return [x + 40, y];
  }

  /**
   * Record one game turn.
   * @param {string|null} command  the command that led to this turn (null at game start)
   * @param {{roomId:number, roomName:string, output:string}} info
   * @returns {boolean} whether the map changed
   */
  function recordTurn(command, info) {
    if (!info || !info.roomId) return false;
    const id = String(info.roomId);
    const prevId = state.current;
    const output = info.output || "";
    const dark = /pitch black/i.test(output);
    const died = /you have died/i.test(output);
    let changed = false;

    const known = state.rooms[id];
    if (!known) {
      const dir = parseDirection(command);
      const prev = prevId ? state.rooms[prevId] : null;
      const vec = dir && VECTORS[dir];
      let target;
      if (prev && vec) {
        target = [prev.x + vec[0], prev.y + vec[1]];
        if (occupied(target[0], target[1]) && relocateFloating(prevId, vec)) {
          target = [prev.x + vec[0], prev.y + vec[1]];
        }
      } else if (prev) {
        // No compass direction: up/down drawn diagonally, anything else to the side.
        const guess = dir === "up" ? [1, -1] : dir === "down" ? [1, 1] : [1, 0];
        target = [prev.x + guess[0], prev.y + guess[1]];
      } else {
        target = [0, 0];
      }
      const [x, y] = freeCellNear(target[0], target[1]);
      state.rooms[id] = {
        name: dark ? "" : info.roomName, x, y,
        floating: Boolean(prev && !vec), anchor: prev && !vec ? prevId : null
      };
      changed = true;
    } else if (!dark && info.roomName && known.name !== info.roomName) {
      // A room first seen in the dark gets its real name once lit.
      known.name = info.roomName;
      changed = true;
    }

    const travelled = prevId && prevId !== id && command && !died && !NON_TRAVEL.test(command.toLowerCase().trim());
    if (travelled) {
      const key = [prevId, id].sort().join("|");
      if (!state.edges[key]) {
        // a → b is the way the player actually went.
        state.edges[key] = { a: prevId, b: id, dir: parseDirection(command) };
        changed = true;
      }
    }

    // Remember which directions work (or don't) from each room. Zork's paths
    // aren't always two-way, so only directions actually tried count.
    const dir = command ? parseDirection(command) : null;
    if (dir && travelled) {
      (state.exits[prevId] ||= {})[dir] = id;
      if (state.blocked[prevId]) delete state.blocked[prevId][dir];
      changed = true;
    } else if (dir && prevId === id && /can't go that way|cannot go that way|no way to go/i.test(output)) {
      (state.blocked[id] ||= {})[dir] = true;
      changed = true;
    }

    if (state.current !== id) { state.current = id; changed = true; }
    if (changed) save();
    return changed;
  }

  function clear() {
    state = emptyState();
    try { localStorage.removeItem(storageKey); } catch (_) { /* ignore */ }
  }

  function roomCount() {
    return Object.keys(state.rooms).length;
  }

  function currentName() {
    const room = state.current ? state.rooms[state.current] : null;
    return room ? (room.name || "a dark place") : "";
  }

  function wrapName(name) {
    const words = (name || "Dark place").split(/\s+/);
    const lines = [""];
    for (const word of words) {
      const line = lines[lines.length - 1];
      if ((line + " " + word).trim().length > 13 && line) lines.push(word);
      else lines[lines.length - 1] = (line + " " + word).trim();
    }
    if (lines.length > 2) lines.splice(2, lines.length - 2, lines.slice(1).join(" ").slice(0, 12) + "…");
    return lines;
  }

  function el(tag, attrs = {}, text) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
    if (text !== undefined) node.textContent = text;
    return node;
  }

  /** Draw the map into `container` and scroll the current room into view. */
  function render(container) {
    const rooms = Object.entries(state.rooms).filter(([, r]) => r);
    container.replaceChildren();
    if (!rooms.length) {
      const empty = document.createElement("p");
      empty.className = "bbs-map-empty";
      empty.textContent = "Your map fills in as you explore. Try moving: n, s, e, w, up, down.";
      container.appendChild(empty);
      return;
    }
    const xs = rooms.map(([, r]) => r.x);
    const ys = rooms.map(([, r]) => r.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const width = (maxX - minX) * CELL_W + BOX_W + PAD * 2;
    const height = (maxY - minY) * CELL_H + BOX_H + PAD * 2;
    const cx = (r) => PAD + (r.x - minX) * CELL_W + BOX_W / 2;
    const cy = (r) => PAD + (r.y - minY) * CELL_H + BOX_H / 2;

    // Shrink to fit narrow screens, but never so small the names are unreadable.
    const available = Math.max(0, container.clientWidth - 4);
    const scale = available ? Math.min(1, Math.max(0.68, available / width)) : 1;
    const svg = el("svg", {
      width: Math.round(width * scale), height: Math.round(height * scale), viewBox: `0 0 ${width} ${height}`, role: "img",
      "aria-label": `Map of ${rooms.length} explored room${rooms.length === 1 ? "" : "s"}. You are in ${currentName()}.`
    });

    const edgeLayer = el("g", { class: "bbs-map-edges" });
    for (const edge of Object.values(state.edges)) {
      const a = state.rooms[edge.a], b = state.rooms[edge.b];
      if (!a || !b) continue;
      const grid = edge.dir && VECTORS[edge.dir];
      const line = el("line", {
        x1: cx(a), y1: cy(a), x2: cx(b), y2: cy(b),
        class: grid ? "bbs-map-edge" : "bbs-map-edge is-special"
      });
      edgeLayer.appendChild(line);
    }
    svg.appendChild(edgeLayer);

    // Non-compass exits (up, down, in, out) show as small badges on each room.
    const badges = {};
    const addBadge = (id, text) => { (badges[id] ||= new Set()).add(text); };
    for (const edge of Object.values(state.edges)) {
      if (VECTORS[edge.dir]) continue;
      addBadge(edge.a, BADGES[edge.dir] || "⋯");
      addBadge(edge.b, BADGES[OPPOSITE[edge.dir]] || "⋯");
    }

    let currentNode = null;
    for (const [id, room] of rooms) {
      const isCurrent = id === state.current;
      const g = el("g", { class: `bbs-map-room${isCurrent ? " is-current" : ""}${room.name ? "" : " is-dark"}` });
      g.appendChild(el("title", {}, room.name || "Dark place"));
      g.appendChild(el("rect", {
        x: cx(room) - BOX_W / 2, y: cy(room) - BOX_H / 2, width: BOX_W, height: BOX_H, rx: 6
      }));
      const lines = wrapName(room.name);
      lines.forEach((line, i) => {
        const offset = (i - (lines.length - 1) / 2) * 13;
        g.appendChild(el("text", { x: cx(room), y: cy(room) + offset + 4, "text-anchor": "middle" }, line));
      });
      if (badges[id]) {
        g.appendChild(el("text", {
          x: cx(room) + BOX_W / 2 - 4, y: cy(room) - BOX_H / 2 + 11,
          "text-anchor": "end", class: "bbs-map-badge"
        }, [...badges[id]].join(" ")));
      }
      svg.appendChild(g);
      if (isCurrent) currentNode = { x: cx(room), y: cy(room) };
    }

    container.appendChild(svg);
    if (currentNode) {
      container.scrollLeft = Math.max(0, currentNode.x * scale - container.clientWidth / 2);
      container.scrollTop = Math.max(0, currentNode.y * scale - container.clientHeight / 2);
    }
  }

  /** Directions the player has actually taken out of the current room. */
  function knownExits() {
    return new Set(Object.keys(state.exits[state.current] || {}));
  }

  /** Directions tried from the current room that the game refused. */
  function blockedExits() {
    return new Set(Object.keys(state.blocked[state.current] || {}));
  }

  return { recordTurn, render, clear, roomCount, currentName, knownExits, blockedExits };
}
