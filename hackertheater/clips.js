/**
 * clips.js — YouTube IFrame Player API wrapper
 *
 * Handles all YouTube player lifecycle events and exposes
 * a clean interface to controller.js. No DOM manipulation here
 * beyond the player element itself.
 */

const Clips = (() => {
  let player = null;
  let pollInterval = null;
  let endTime = null;
  let onEndCallback = null;
  let onStateChangeCallback = null;
  let apiReady = false;

  // Called by YouTube IFrame API when script loads
  window.onYouTubeIframeAPIReady = () => {
    apiReady = true;
    player = new YT.Player('yt-player', {
      height: '100%',
      width: '100%',
      playerVars: {
        autoplay: 0,
        controls: 0,        // hide native controls; moderator uses our UI
        rel: 0,             // no related videos at end
        modestbranding: 1,
        fs: 0,              // disable native fullscreen button
        iv_load_policy: 3,  // no annotations
        cc_load_policy: 0,
        disablekb: 1,       // we handle keyboard ourselves
      },
      events: {
        onReady: _onPlayerReady,
        onStateChange: _onPlayerStateChange,
        onError: _onPlayerError,
      },
    });
  };

  function _onPlayerReady() {
    // Player is ready; placeholder can be hidden
    const ph = document.getElementById('video-placeholder');
    if (ph) ph.classList.add('hidden');
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
    // Error codes: https://developers.google.com/youtube/iframe_api_reference#onError
    const messages = {
      2:   'Invalid video ID in show.json.',
      5:   'This video cannot play in the embedded player.',
      100: 'Video not found or private.',
      101: 'Video owner does not allow embedded playback.',
      150: 'Video owner does not allow embedded playback.',
    };
    const msg = messages[event.data] || `YouTube player error (code ${event.data}).`;
    if (typeof onStateChangeCallback === 'function') {
      onStateChangeCallback('error', msg);
    }
  }

  // Poll every 250ms to detect when we cross the end timestamp.
  // YouTube's onStateChange does not fire for timestamp-based stops.
  function _startEndPoll() {
    if (endTime == null) return;
    pollInterval = setInterval(() => {
      if (!player || typeof player.getCurrentTime !== 'function') return;
      const current = player.getCurrentTime();
      if (current >= endTime) {
        _clearPoll();
        player.pauseVideo();
        if (typeof onEndCallback === 'function') {
          onEndCallback();
        }
      }
    }, 250);
  }

  function _clearPoll() {
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  }

  // ---- Public API ----

  /**
   * Load a video and seek to start. Does not auto-play.
   * Call play() after load() if desired.
   */
  function load(videoId, startSeconds, endSeconds) {
    if (!player) return;
    endTime = endSeconds;
    _clearPoll();
    player.loadVideoById({
      videoId,
      startSeconds,
    });
    // loadVideoById auto-plays; we pause immediately after cuing
    // so the moderator controls playback explicitly.
    player.pauseVideo();
  }

  /** Cue (load without playing) and seek. */
  function cue(videoId, startSeconds, endSeconds) {
    if (!player) return;
    endTime = endSeconds;
    _clearPoll();
    player.cueVideoById({
      videoId,
      startSeconds,
    });
  }

  function play() {
    if (!player) return;
    player.playVideo();
  }

  function pause() {
    if (!player) return;
    _clearPoll();
    player.pauseVideo();
  }

  /** Seek back to segment start and resume playback. */
  function replay(startSeconds, endSeconds) {
    if (!player) return;
    endTime = endSeconds;
    _clearPoll();
    player.seekTo(startSeconds, true);
    player.playVideo();
  }

  function isPlaying() {
    if (!player) return false;
    return player.getPlayerState() === YT.PlayerState.PLAYING;
  }

  function setOnEnd(cb) {
    onEndCallback = cb;
  }

  function setOnStateChange(cb) {
    onStateChangeCallback = cb;
  }

  function isApiReady() {
    return apiReady && player !== null;
  }

  return { load, cue, play, pause, replay, isPlaying, setOnEnd, setOnStateChange, isApiReady };
})();
