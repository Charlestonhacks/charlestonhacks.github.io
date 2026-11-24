// Zork map data for the CharlestonHacks BBS: rooms visited and the exits
// tried from each. Saved in this browser only. Grid positions are kept so an
// overview could be drawn again later.

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
    } else if (dir && prevId === id && !died) {
      // Any compass move that leaves you where you were was refused, whatever
      // the message ("You can't go that way", "The mountains are impassable",
      // "The door is closed"…). It clears if that direction works later.
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

  /** Directions the player has actually taken out of the current room. */
  function knownExits() {
    return new Set(Object.keys(state.exits[state.current] || {}));
  }

  /** Directions tried from the current room that the game refused. */
  function blockedExits() {
    return new Set(Object.keys(state.blocked[state.current] || {}));
  }

  /** The current room plus where each direction tried from it leads. */
  function hereInfo() {
    const here = state.current;
    const room = here ? state.rooms[here] : null;
    const exits = {};
    for (const [dir, toId] of Object.entries(state.exits[here] || {})) {
      const to = state.rooms[toId];
      exits[dir] = { id: toId, name: to ? (to.name || "Dark place") : "?" };
    }
    return {
      name: room ? (room.name || "Dark place") : "",
      exits,
      blocked: blockedExits()
    };
  }

  return { recordTurn, clear, roomCount, currentName, knownExits, blockedExits, hereInfo };
}
