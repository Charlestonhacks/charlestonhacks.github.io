/**
 * clips.js — YouTube IFrame Player API wrapper
 *
 * Key invariant: `player` is the YT.Player object, set the moment
 * onYouTubeIframeAPIReady fires, but its methods (cueVideoById, etc.)
 * are only safe to call after `onReady` fires. The `playerReady` flag
 * tracks that second boundary. Any call that arrives before `playerReady`
 * is stored as `pendingAction` and replayed in `_onPlayerReady`.
 *
 * All player method calls are wrapped in try/catch so a broken or
 * non-embeddable video never throws an uncaught exception.
 */

const Clips = (() => {

  let player        = null;  // YT.Player object (set at API ready)
  let playerReady   = false; // true only after onReady fires
  let pendingAction = null;  // latest queued action, executed on onReady
  let pendingMute   = false; // if mute() is called before ready, apply it on onReady
  let pollInterval  = null;
  let endTime       = null;
  let onEndCallback          = null;
  let onStateChangeCallback  = null;

  // Dev-only logging: active on localhost / file:// only
  const DEV = (location.hostname === 'localhost' ||
               location.hostname === '127.0.0.1' ||
               location.protocol === 'file:');
  const _log  = (...a) => { if (DEV) console.log('[Clips]',  ...a); };
  const _warn = (...a) => console.warn('[Clips]', ...a);

  // ---- YouTube IFrame API bootstrap ----

  window.onYouTubeIframeAPIReady = () => {
    _log('YT API ready — creating player');
    try {
      player = new YT.Player('yt-player', {
        height: '100%',
        width:  '100%',
        playerVars: {
          autoplay:       0,
          controls:       0,  // moderator uses our UI
          rel:            0,
          modestbranding: 1,
          fs:             0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          disablekb:      1,  // we handle keyboard ourselves
        },
        events: {
          onReady:       _onPlayerReady,
          onStateChange: _onPlayerStateChange,
          onError:       _onPlayerError,
        },
      });
    } catch (e) {
      _warn('Failed to create YT.Player:', e.message);
    }
  };

  function _onPlayerReady() {
    _log('Player onReady — methods now available');
    playerReady = true;

    const ph = document.getElementById('video-placeholder');
    if (ph) ph.classList.add('hidden');

    // Drain any action that arrived before the player was ready
    if (pendingAction) {
      _log('Draining pendingAction');
      const action  = pendingAction;
      pendingAction = null;
      try { action(); } catch (e) { _warn('Pending action threw:', e.message); }
    }

    // Apply a mute that was requested before the player was ready
    if (pendingMute) {
      pendingMute = false;
      try { player.mute(); } catch (e) { _warn('Deferred mute threw:', e.message); }
    }
  }

  function _onPlayerStateChange(event) {
    _clearPoll();
    if (event.data === YT.PlayerState.PLAYING) {
      _startEndPoll();
    }
    if (typeof onStateChangeCallback === 'function') {
      onStateChangeCallback(event.data);
    }
  }

  function _onPlayerError(event) {
    _clearPoll();
    const MESSAGES = {
      2:   'Invalid video ID.',
      5:   'This video cannot play in an embedded player.',
      100: 'Video not found or is private.',
      101: 'The video owner has disabled embedded playback.',
      150: 'The video owner has disabled embedded playback.',
    };
    const msg = MESSAGES[event.data] || `YouTube player error (code ${event.data}).`;
    _warn('onError:', msg);
    if (typeof onStateChangeCallback === 'function') {
      onStateChangeCallback('error', msg);
    }
  }

  // Poll every 250ms to detect the end timestamp.
  // YT.onStateChange does not fire at arbitrary timestamps.
  function _startEndPoll() {
    if (endTime == null) return;
    pollInterval = setInterval(() => {
      if (!playerReady) return;
      try {
        if (player.getCurrentTime() >= endTime) {
          _clearPoll();
          player.pauseVideo();
          if (typeof onEndCallback === 'function') onEndCallback();
        }
      } catch (e) {
        _warn('End-poll error:', e.message);
        _clearPoll();
      }
    }, 250);
  }

  function _clearPoll() {
    if (pollInterval) { clearInterval(pollInterval); pollInterval = null; }
  }

  /**
   * Execute `fn` immediately if the player is ready, otherwise queue it.
   * Only the most recent queued action is kept (old ones are stale).
   */
  function _exec(fn) {
    if (!player) {
      _warn('_exec: player object not created yet — is the YT API script loaded?');
      return;
    }
    if (!playerReady) {
      _log('_exec: player not ready, queuing');
      pendingAction = fn;
      return;
    }
    try { fn(); } catch (e) { _warn('Player action threw:', e.message); }
  }

  // ============================================================
  // Public API
  // ============================================================

  /**
   * Cue a video segment without auto-playing.
   * Safe to call before the player is ready.
   */
  function cue(videoId, startSeconds, endSeconds) {
    if (!videoId) { _warn('cue() called with empty videoId — skipping'); return; }
    endTime = (endSeconds != null) ? endSeconds : null;
    _clearPoll();
    _exec(() => {
      _log('cueVideoById', videoId, '@', startSeconds);
      player.cueVideoById({ videoId, startSeconds: startSeconds || 0 });
    });
  }

  /**
   * Load and immediately play a video segment.
   * Safe to call before the player is ready.
   */
  function play(videoId, startSeconds, endSeconds) {
    if (!videoId) { _warn('play() called with empty videoId — skipping'); return; }
    endTime = (endSeconds != null) ? endSeconds : null;
    _clearPoll();
    _exec(() => {
      _log('loadVideoById', videoId, '@', startSeconds);
      player.loadVideoById({ videoId, startSeconds: startSeconds || 0 });
    });
  }

  /** Pause playback. */
  function pause() {
    _clearPoll();
    if (!playerReady) return;
    try { player.pauseVideo(); } catch (e) { _warn('pauseVideo threw:', e.message); }
  }

  /** Resume playback on the currently loaded video (no seek). */
  function resume() {
    _exec(() => player.playVideo());
  }

  /**
   * Seek to `startSeconds` on the currently loaded video and play.
   * Updates the end-time boundary for the stop poll.
   */
  function replay(startSeconds, endSeconds) {
    endTime = (endSeconds != null) ? endSeconds : null;
    _clearPoll();
    _exec(() => {
      _log('replay @', startSeconds);
      player.seekTo(startSeconds || 0, true);
      player.playVideo();
    });
  }

  /** True only if the player is in the PLAYING state right now. */
  function isPlaying() {
    if (!playerReady) return false;
    try { return player.getPlayerState() === YT.PlayerState.PLAYING; }
    catch { return false; }
  }

  /** True once the player's onReady event has fired (methods are callable). */
  function isReady() { return playerReady; }

  /** Mute the player. Safe to call before ready — applied on onReady. */
  function mute() {
    if (!playerReady) { pendingMute = true; return; }
    try { player.mute(); } catch (e) { _warn('mute threw:', e.message); }
  }

  /** Unmute the player. */
  function unmute() {
    pendingMute = false;
    if (!playerReady) return;
    try { player.unMute(); } catch (e) { _warn('unMute threw:', e.message); }
  }

  /** Returns true if the player is currently muted. */
  function isMuted() {
    if (!playerReady) return false;
    try { return player.isMuted(); } catch { return false; }
  }

  function setOnEnd(cb)         { onEndCallback         = cb; }
  function setOnStateChange(cb) { onStateChangeCallback = cb; }

  return { cue, play, pause, resume, replay, isPlaying, isReady, mute, unmute, isMuted, setOnEnd, setOnStateChange };

})();
