/**
 * channel.js — BroadcastChannel + localStorage bridge
 *
 * Provides a unified messaging layer for control room → projector sync.
 * BroadcastChannel is used when both windows are open simultaneously.
 * localStorage is used to persist state so a projector opened after the
 * show started can still restore the current state.
 *
 * Channel name:  'hackertheater-projector'
 * Storage key:   'charlestonhacks.hackertheater.projectorState.v1'
 */

const Channel = (() => {
  const CHANNEL_NAME = 'hackertheater-projector';
  const LS_KEY       = 'charlestonhacks.hackertheater.projectorState.v1';

  let bc        = null;
  let _handlers = {};   // { messageType: [fn, ...] }

  // ---- Init BroadcastChannel (safe — not supported in all browsers) ----

  try {
    bc = new BroadcastChannel(CHANNEL_NAME);
    bc.onmessage = (ev) => {
      const { type, payload } = ev.data || {};
      if (type) _dispatch(type, payload);
    };
  } catch (e) {
    console.warn('[Channel] BroadcastChannel unavailable — sync is localStorage-only.');
  }

  function _dispatch(type, payload) {
    const fns = _handlers[type] || [];
    fns.forEach(fn => { try { fn(payload); } catch (e) { console.warn('[Channel] handler error', type, e); } });

    // Also fire wildcard listeners
    (_handlers['*'] || []).forEach(fn => { try { fn(type, payload); } catch {} });
  }

  // ---- Public API ----

  /** Send a typed message to any other open windows. Does NOT save to LS. */
  function send(type, payload) {
    if (!bc) return;
    try { bc.postMessage({ type, payload: payload || {} }); } catch (e) {
      console.warn('[Channel] send error:', e.message);
    }
  }

  /** Register a handler for a message type. Use '*' to catch all types. */
  function on(type, fn) {
    if (!_handlers[type]) _handlers[type] = [];
    _handlers[type].push(fn);
  }

  /** Persist full state snapshot to localStorage (survives page reload). */
  function saveState(snapshot) {
    try {
      localStorage.setItem(LS_KEY, JSON.stringify({ ...snapshot, _savedAt: Date.now() }));
    } catch (e) {
      console.warn('[Channel] saveState error:', e.message);
    }
  }

  /** Retrieve the last saved state, or null if none. */
  function loadState() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  /** Remove saved state (e.g., at show end). */
  function clearState() {
    try { localStorage.removeItem(LS_KEY); } catch {}
  }

  return { send, on, saveState, loadState, clearState };
})();
