/**
 * display.js — Projector display logic
 *
 * Maintains its own YouTube player and responds to Channel messages
 * from the control room. On load, restores state from localStorage,
 * then sends requestSync to get a live update if the control room
 * is also open.
 */

(function () {

  // ---- DOM refs ----
  const $ = id => document.getElementById(id);

  const dom = {
    eventName:    $('event-name'),
    segCounter:   $('seg-counter'),
    connPill:     $('conn-pill'),
    connLabel:    $('conn-label'),
    blackOverlay: $('black-overlay'),
    intermOverlay:$('interm-overlay'),
    intermClock:  $('interm-clock'),
    placeholder:  $('video-placeholder'),
    segTitle:     $('seg-title'),
    segPanelist:  $('seg-panelist'),
    questionCard: $('question-card'),
    questionText: $('question-text'),
    questionLt:   $('question-lower-third'),  // lower-third overlay
    questionLtText: $('question-lt-text'),    // lower-third text span
    timerDisplay: $('timer-display'),
    timerBar:     $('timer-bar'),
    launchPanel:  $('launch-panel'),
    btnPresentation: $('btn-presentation'),
    fsBlocked:    $('fs-blocked'),
  };

  // Apply questionDisplayMode from show data ('below-video' | 'lower-third').
  // Drives the lower-third-mode body class which CSS keyes off.
  function _applyQuestionDisplayMode(mode) {
    if (mode === 'lower-third') {
      document.body.classList.add('lower-third-mode');
    } else {
      document.body.classList.remove('lower-third-mode');
    }
  }

  // Keep the lower-third text in sync whenever question text changes.
  function _syncQuestionText(text) {
    if (text) {
      dom.questionText.textContent = text;
      if (dom.questionLtText) dom.questionLtText.textContent = text;
    }
  }

  // Set to true to log timing events to the console.
  const DEBUG_TIMING = false;

  // Unique identifier for this display instance — used by the controller to
  // target commands at the active window and prevent stale windows from
  // responding to play/resume/replay messages.
  const displayInstanceId = Math.random().toString(36).slice(2, 10);
  console.log('[Display] Instance ID:', displayInstanceId);

  // ---- YouTube player ----

  let player      = null;
  let playerReady = false;
  let pendingVideoAction = null;   // queued until playerReady (before onReady)

  // ---- Segment / readiness tracking ----
  //
  // These variables form the "readiness gate" that prevents play commands from
  // reaching YouTube before the video is fully cued.
  //
  // currentSegment: the segment currently being cued or playing.
  // segmentCued:    true after YouTube fires the CUED state for currentSegment.
  //                 Resets to false whenever we start loading a new video.
  // pendingPlay:    a play command that arrived before segmentCued was true;
  //                 drained automatically once CUED fires.
  // _hasEverPlayed: false until the first PLAYING state — used to gate the
  //                 one-shot late-join error retry.
  // _retryCount:    error retry counter, capped at 1 to prevent loops.
  // _lastCommand:   last channel command received, included in error logs.

  let currentSegment  = { videoId: null, start: 0, end: null, index: null };
  let segmentCued     = false;
  let pendingPlay     = null;
  let _hasEverPlayed  = false;
  let _retryCount     = 0;
  let _lastCommand    = null;

  // Deduplication: ignore repeated projector commands with the same key within 400ms.
  let _lastProjectorCommandKey = null;
  let _lastProjectorCommandTs  = 0;
  const PROJECTOR_DEDUP_MS = 400;

  function _isDuplicateCommand(key) {
    const now = Date.now();
    if (key === _lastProjectorCommandKey && (now - _lastProjectorCommandTs) < PROJECTOR_DEDUP_MS) {
      return true;
    }
    _lastProjectorCommandKey = key;
    _lastProjectorCommandTs  = now;
    return false;
  }

  // ---- End-time enforcement ----

  let endTime       = null;  // current clip end timestamp (seconds), null = no limit
  let _endPollHandle = null;

  function _startEndPoll() {
    _clearEndPoll(); // prevent duplicate intervals
    if (endTime == null || !playerReady) return;
    if (DEBUG_TIMING) console.log('[Display/Timing] poll start, endTime=', endTime);
    _endPollHandle = setInterval(() => {
      if (!playerReady) return;
      try {
        const cur = player.getCurrentTime();
        if (DEBUG_TIMING) console.log('[Display/Timing] currentTime=', cur.toFixed(2), '/ endTime=', endTime);
        if (cur >= endTime - 0.15) {
          if (DEBUG_TIMING) console.log('[Display/Timing] auto-stop fired at', cur.toFixed(2));
          _clearEndPoll();
          player.pauseVideo();
          _onDisplayClipEnded();
        }
      } catch (e) {
        console.warn('[Display] end-poll error:', e.message);
        _clearEndPoll();
      }
    }, 250);
  }

  function _clearEndPoll() {
    if (_endPollHandle) {
      clearInterval(_endPollHandle);
      _endPollHandle = null;
      if (DEBUG_TIMING) console.log('[Display/Timing] poll stopped');
    }
  }

  // Called when the projector's end-poll determines the clip is done.
  function _onDisplayClipEnded() {
    // Reveal the question if it isn't already showing
    dom.questionCard.classList.add('revealed');
    dom.questionText.classList.remove('blurred');
    document.body.classList.add('question-visible');
  }

  window.onYouTubeIframeAPIReady = () => {
    try {
      player = new YT.Player('yt-player', {
        height: '100%',
        width:  '100%',
        playerVars: {
          autoplay:       0,
          controls:       0,
          rel:            0,
          modestbranding: 1,
          fs:             0,
          iv_load_policy: 3,
          cc_load_policy: 0,
          disablekb:      1,
        },
        events: {
          onReady:       _onPlayerReady,
          onError:       _onPlayerError,
          onStateChange: _onPlayerStateChange,
        },
      });
    } catch (e) {
      console.warn('[Display] Failed to create YT.Player:', e.message);
    }
  };

  function _onPlayerReady() {
    playerReady = true;
    dom.placeholder.classList.add('hidden');

    // Remove the YT iframe from the tab order so keyboard focus can't reach it.
    const iframe = document.querySelector('#yt-player iframe');
    if (iframe) iframe.setAttribute('tabindex', '-1');

    if (DEBUG_TIMING) console.log('[Display] playerReady — draining pendingVideoAction');

    // Recovery cue: if a segment was received via loadSegment/fullSync while the
    // YT player was still null (API script not yet loaded), _execVideo silently
    // dropped the cueVideoById call.  Re-cue now so pendingPlay can drain via CUED.
    if (!pendingVideoAction && currentSegment.videoId && !segmentCued) {
      console.log('[Display] onReady recovery cue:', currentSegment.videoId, '@', currentSegment.start);
      try {
        player.cueVideoById({ videoId: currentSegment.videoId, startSeconds: currentSegment.start || 0 });
      } catch (e) { console.warn('[Display] recovery cue error:', e.message); }
    }

    if (pendingVideoAction) {
      const a = pendingVideoAction;
      pendingVideoAction = null;
      try { a(); } catch (e) { console.warn('[Display] pending action threw:', e.message); }
    }

    // Announce readiness to the controller so it can flush any queued play command.
    console.log('[Display] Player ready — sending displayReady (instanceId:', displayInstanceId, ')');
    Channel.send('displayReady', { displayInstanceId });
  }

  function _onPlayerError(ev) {
    _clearEndPoll();
    const debugInfo = {
      errorCode:    ev.data,
      videoId:      currentSegment.videoId,
      segmentIndex: currentSegment.index,
      start:        currentSegment.start,
      end:          currentSegment.end,
      playerReady,
      segmentCued,
      lastCommand:  _lastCommand,
    };
    console.warn('[Display] YT player error:', debugInfo);

    // One-shot retry during late-join startup: if we haven't successfully played
    // anything yet and this is the first error, re-cue and replay pending command.
    if (!_hasEverPlayed && _retryCount < 1 && currentSegment.videoId) {
      _retryCount++;
      console.warn('[Display] Late-join error — re-cueing in 600ms, retry', _retryCount);
      setTimeout(() => {
        segmentCued = false;
        if (!pendingPlay && _lastCommand && _lastCommand.type === 'play') {
          pendingPlay = {
            videoId: currentSegment.videoId,
            start:   currentSegment.start || 0,
            end:     currentSegment.end,
          };
        }
        _execVideo(() => {
          if (DEBUG_TIMING) console.log('[Display] retry cueVideoById:', currentSegment.videoId, '@', currentSegment.start);
          player.cueVideoById({ videoId: currentSegment.videoId, startSeconds: currentSegment.start || 0 });
        });
      }, 600);
    }
  }

  // Drive end-poll start/stop from actual player state so buffering pauses
  // don't kill the interval — the poll restarts automatically when PLAYING fires.
  function _onPlayerStateChange(event) {
    if (typeof YT === 'undefined') return;
    const s = event.data;

    if (s === YT.PlayerState.CUED) {
      // cueVideoById completed — video is ready to play at the cued start time.
      segmentCued = true;
      _retryCount = 0; // successful cue clears the retry counter
      if (DEBUG_TIMING) console.log('[Display] CUED — segmentCued=true, segment=', currentSegment);
      _drainPendingPlay();
      _clearEndPoll(); // no end-poll while just cued
    } else if (s === YT.PlayerState.PLAYING) {
      _hasEverPlayed = true;
      _startEndPoll();
      if (DEBUG_TIMING) console.log('[Display] PLAYING — end poll started, endTime=', endTime);
    } else if (s === YT.PlayerState.PAUSED  ||
               s === YT.PlayerState.ENDED   ||
               s === -1 /* UNSTARTED */) {
      _clearEndPoll();
    }
    // BUFFERING (3): do nothing — poll persists across rebuffer events
  }

  // Execute a queued play command now that segmentCued is true.
  function _drainPendingPlay() {
    if (!pendingPlay || !segmentCued || !playerReady) return;
    const pp = pendingPlay;
    pendingPlay = null;
    const isHardSync = pp.isHardSync === true;
    if (isHardSync) {
      console.log('[Display] Hard sync: seekTo', pp.start);
    }
    console.log('[Display] Projector player: playVideo() — seekTo', pp.start,
                isHardSync ? '(hardSync)' : '(drained pendingPlay)');
    try {
      player.seekTo(pp.start || 0, true);
      if (isHardSync) console.log('[Display] Hard sync: playVideo');
      player.playVideo();
      Channel.send('displayPlayingAck', {
        displayInstanceId,
        videoId: pp.videoId,
        start:   pp.start,
        action:  isHardSync ? 'hardSync' : 'pendingPlay',
      });
    } catch (e) { console.warn('[Display] pendingPlay drain error:', e.message); }
  }

  function _execVideo(fn) {
    if (!player) return;
    if (!playerReady) { pendingVideoAction = fn; return; }
    try { fn(); } catch (e) { console.warn('[Display] player action threw:', e.message); }
  }

  // ---- Timer ----

  const timer = {
    total:     0,
    remaining: 0,
    running:   false,
    handle:    null,
  };

  function _startTimer(total, remaining) {
    _stopTimer();
    timer.total     = total;
    timer.remaining = remaining;
    timer.running   = true;
    timer.handle    = setInterval(_tickTimer, 1000);
    _renderTimer();
  }

  function _stopTimer() {
    timer.running = false;
    clearInterval(timer.handle);
    timer.handle = null;
  }

  function _tickTimer() {
    if (!timer.running) return;
    if (timer.remaining <= 0) { _stopTimer(); _renderTimer(); return; }
    timer.remaining -= 1;
    _renderTimer();
  }

  function _renderTimer() {
    const r = timer.remaining;
    const t = timer.total;
    if (t === 0 && r === 0) { dom.timerDisplay.textContent = '—:——'; dom.timerBar.style.width = '100%'; return; }

    const m = Math.floor(r / 60);
    const s = r % 60;
    dom.timerDisplay.textContent = `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
    dom.timerBar.style.width = `${t > 0 ? (r / t) * 100 : 0}%`;

    for (const el of [dom.timerDisplay, dom.timerBar]) {
      el.classList.remove('warn-60','warn-30','warn-0');
      if      (r === 0)  el.classList.add('warn-0');
      else if (r <= 30)  el.classList.add('warn-30');
      else if (r <= 60)  el.classList.add('warn-60');
    }
  }

  // ---- Connection status ----

  let _lastActivity = 0;
  let _connCheckHandle = null;

  function _setConnected(label) {
    dom.connPill.className   = 'conn-pill connected';
    dom.connLabel.textContent = label || 'Synced';
    _lastActivity = Date.now();
  }

  function _setConnecting() {
    dom.connPill.className    = 'conn-pill connecting';
    dom.connLabel.textContent = 'Connecting…';
  }

  function _setDisconnected() {
    dom.connPill.className    = 'conn-pill disconnected';
    dom.connLabel.textContent = 'No control room';
  }

  function _noteActivity() {
    _lastActivity = Date.now();
    _setConnected('Live');
  }

  // Periodically check if we've heard from the control room recently
  _connCheckHandle = setInterval(() => {
    if (_lastActivity === 0) return; // still waiting for first sync
    const age = Date.now() - _lastActivity;
    if (age > 12000) _setDisconnected();       // >12s
    else if (age > 6000) _setConnecting();     // >6s
    else _setConnected('Live');
  }, 2000);

  // ---- Intermission clock ----

  let _intermHandle = null;
  function _startIntermClock() {
    _updateIntermClock();
    _intermHandle = setInterval(_updateIntermClock, 1000);
  }
  function _stopIntermClock() { clearInterval(_intermHandle); }
  function _updateIntermClock() {
    dom.intermClock.textContent = new Date().toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  // ---- Apply full snapshot (from localStorage or fullSync message) ----

  function applyFullSync(snap) {
    if (!snap) return;

    // Event info
    if (snap.show) {
      dom.eventName.textContent = snap.show.eventName || 'Hacker Theater';
      _applyQuestionDisplayMode(snap.show.questionDisplayMode || 'below-video');
      _applyPlayerInteractionOverride(snap.show.allowDirectPlayerInteraction);
    }

    // Segment info
    const seg = snap.segment;
    if (seg) {
      dom.segTitle.textContent    = seg.title    || '—';
      dom.segPanelist.textContent = seg.panelist ? `↳ ${seg.panelist}` : '';
    }
    if (snap.segmentIndex != null && snap.totalSegments) {
      dom.segCounter.textContent = `${snap.segmentIndex + 1} / ${snap.totalSegments}`;
    }

    // Question
    if (snap.questionText) {
      _syncQuestionText(snap.questionText);
    }
    if (snap.questionVisible) {
      dom.questionCard.classList.add('revealed');
      dom.questionText.classList.remove('blurred');
      document.body.classList.add('question-visible');
    } else {
      dom.questionCard.classList.remove('revealed');
      dom.questionText.classList.add('blurred');
      document.body.classList.remove('question-visible');
    }

    // Timer
    if (snap.timerTotal != null) {
      timer.total     = snap.timerTotal;
      timer.remaining = snap.timerRemaining != null ? snap.timerRemaining : snap.timerTotal;
      _stopTimer();
      if (snap.timerRunning) {
        timer.running = true;
        timer.handle  = setInterval(_tickTimer, 1000);
      }
      _renderTimer();
    }

    // Overlay
    if (snap.overlay === 'black') {
      _activateBlack();
    } else if (snap.overlay === 'intermission') {
      _activateIntermission();
    } else {
      _clearOverlays();
    }

    // Video — always cue (never auto-play) on fullSync.
    // The projector joining late should cue and wait for the next explicit play
    // command from the user pressing Play Clip. Auto-playing from fullSync while
    // the YT player is still initialising causes the YouTube errors this fix targets.
    if (snap.videoId) {
      endTime = (snap.videoEnd != null && snap.videoEnd > 0) ? snap.videoEnd : null;
      const newIndex = snap.segmentIndex != null ? snap.segmentIndex : null;
      if (DEBUG_TIMING) console.log('[Display] applyFullSync video:', snap.videoId, 'idx=', newIndex, 'state=', snap.playbackState, 'endTime=', endTime);

      // Only re-cue if the segment has actually changed, to avoid interrupting
      // an in-progress cue from a previous fullSync for the same segment.
      if (currentSegment.videoId !== snap.videoId || currentSegment.index !== newIndex) {
        currentSegment = { videoId: snap.videoId, start: snap.videoStart || 0, end: snap.videoEnd, index: newIndex };
        segmentCued    = false;
        pendingPlay    = null;
        _execVideo(() => {
          if (DEBUG_TIMING) console.log('[Display] applyFullSync — cueVideoById:', snap.videoId, '@', snap.videoStart);
          player.cueVideoById({ videoId: snap.videoId, startSeconds: snap.videoStart || 0 });
        });
      } else {
        if (DEBUG_TIMING) console.log('[Display] applyFullSync — same segment already tracked, skipping re-cue');
      }
    }
  }

  // ---- Overlay helpers ----

  function _activateBlack() {
    dom.blackOverlay.classList.add('active');
    dom.intermOverlay.classList.remove('active');
    _stopIntermClock();
  }

  function _activateIntermission() {
    dom.intermOverlay.classList.add('active');
    dom.blackOverlay.classList.remove('active');
    _startIntermClock();
  }

  function _clearOverlays() {
    dom.blackOverlay.classList.remove('active');
    dom.intermOverlay.classList.remove('active');
    _stopIntermClock();
  }

  // ---- Channel message handlers ----

  Channel.on('loadSegment', (p) => {
    _noteActivity();
    _lastCommand = { type: 'loadSegment', payload: p, ts: Date.now() };
    const seg = p.segment || {};
    dom.segTitle.textContent    = seg.title    || '—';
    dom.segPanelist.textContent = seg.panelist ? `↳ ${seg.panelist}` : '';
    if (p.index != null && p.totalSegments) {
      dom.segCounter.textContent = `${p.index + 1} / ${p.totalSegments}`;
    }
    // Reset question
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.add('blurred');
    document.body.classList.remove('question-visible');
    if (seg.question) _syncQuestionText(seg.question);

    // Reset timer display
    _stopTimer();
    timer.total = timer.remaining = 0;
    _renderTimer();

    // Clear end-poll and readiness state for the outgoing segment
    _clearEndPoll();
    endTime     = null;
    segmentCued = false;
    pendingPlay = null;
    currentSegment = {
      videoId: seg.youtubeId || null,
      start:   seg.start   || 0,
      end:     seg.end     || null,
      index:   p.index     != null ? p.index : null,
    };

    // Cue the new video without playing
    if (seg.youtubeId) {
      _execVideo(() => {
        if (DEBUG_TIMING) console.log('[Display] loadSegment — cueVideoById:', seg.youtubeId, '@', seg.start);
        player.cueVideoById({ videoId: seg.youtubeId, startSeconds: seg.start || 0 });
      });
    }
    if (DEBUG_TIMING) console.log('[Display] loadSegment idx=', p.index, 'start=', seg.start, 'end=', seg.end);
  });

  Channel.on('play', (p) => {
    _noteActivity();
    if (!p.videoId) return;

    // Ignore play commands targeted at a different display instance.
    if (p.targetDisplayId && p.targetDisplayId !== displayInstanceId) {
      console.log('[Display] play ignored: targetDisplayId mismatch (target:', p.targetDisplayId, 'this:', displayInstanceId, ')');
      return;
    }

    _lastCommand = { type: 'play', payload: p, ts: Date.now() };

    // Deduplicate: ignore the same play command arriving within PROJECTOR_DEDUP_MS.
    const cmdKey = `play:${p.videoId}:${p.start}:${p.segmentIndex}`;
    if (_isDuplicateCommand(cmdKey)) {
      console.log('[Display] Projector duplicate play ignored:', cmdKey);
      return;
    }

    endTime = (p.end != null && p.end > 0) ? p.end : null;
    _clearEndPoll();

    // Determine whether the projector already has this segment cued.
    // Match by videoId + segmentIndex (index sent since last session's fix).
    const sameVideo = currentSegment.videoId === p.videoId;
    const sameIndex = p.segmentIndex == null || currentSegment.index === p.segmentIndex;
    const alreadyCued = sameVideo && sameIndex && segmentCued;
    const awaitingCue = sameVideo && sameIndex && !segmentCued;

    if (DEBUG_TIMING) console.log('[Display] play received — sameVideo=', sameVideo, 'sameIndex=', sameIndex, 'segmentCued=', segmentCued, 'alreadyCued=', alreadyCued, 'awaitingCue=', awaitingCue, p);

    if (alreadyCued) {
      // Segment is already cued — seek to start and play immediately.
      // This is the normal path for a late-joining projector that applyFullSync
      // already cued while the user was navigating to the play button.
      console.log('[Display] Projector player: playVideo() — already cued, seekTo', p.start);
      _execVideo(() => {
        try {
          player.seekTo(p.start || 0, true);
          player.playVideo();
          Channel.send('displayPlayingAck', { displayInstanceId, videoId: p.videoId, start: p.start, action: 'play-cued' });
        } catch (e) { console.warn('[Display] play (cued) error:', e.message); }
      });
    } else if (awaitingCue) {
      // Same segment is being cued right now — store at most one pending play.
      // If an identical pendingPlay is already queued, skip to avoid duplicates.
      if (pendingPlay && pendingPlay.videoId === p.videoId && pendingPlay.start === (p.start || 0)) {
        console.log('[Display] Projector duplicate pendingPlay ignored — same segment already queued, start=', p.start);
      } else {
        if (pendingPlay) {
          console.log('[Display] pendingPlay replaced instead of appended — old start=', pendingPlay.start, 'new start=', p.start);
        } else {
          console.log('[Display] Projector player: play queued — same segment cueing in progress, start=', p.start);
        }
        pendingPlay = { videoId: p.videoId, start: p.start || 0, end: p.end };
      }
    } else {
      // Different segment or no cue in progress — update tracking and do a full load.
      // loadVideoById auto-plays, so this is an implicit playVideo call.
      console.log('[Display] Projector player: loadVideoById (auto-play) —', p.videoId, '@', p.start);
      currentSegment = { videoId: p.videoId, start: p.start || 0, end: p.end, index: p.segmentIndex != null ? p.segmentIndex : null };
      segmentCued    = false;
      pendingPlay    = null;
      _execVideo(() => {
        player.loadVideoById({ videoId: p.videoId, startSeconds: p.start || 0 });
        Channel.send('displayPlayingAck', { displayInstanceId, videoId: p.videoId, start: p.start, action: 'loadVideoById' });
      });
    }
  });

  // hardSyncPlay: unconditional stop → cueVideoById → wait for CUED → seekTo → playVideo.
  // Used for first play after display connects, after segment changes, and for replay.
  Channel.on('hardSyncPlay', (p) => {
    _noteActivity();
    if (!p.videoId) return;

    if (p.targetDisplayId && p.targetDisplayId !== displayInstanceId) {
      console.log('[Display] hardSyncPlay ignored: targetDisplayId mismatch (target:', p.targetDisplayId, 'this:', displayInstanceId, ')');
      return;
    }

    _lastCommand = { type: 'hardSyncPlay', payload: p, ts: Date.now() };

    const cmdKey = `hardSyncPlay:${p.videoId}:${p.start}:${p.segmentIndex}`;
    if (_isDuplicateCommand(cmdKey)) {
      console.log('[Display] Hard sync duplicate ignored:', cmdKey);
      return;
    }

    endTime = (p.end != null && p.end > 0) ? p.end : null;
    _clearEndPoll();

    console.log('[Display] Hard sync: cue/load video', p.videoId, '@', p.start);

    // Stop whatever is currently playing so we start from a clean state.
    if (playerReady) {
      try { player.stopVideo(); } catch (e) { console.warn('[Display] hardSync stopVideo error:', e.message); }
    }

    // Reset all segment tracking.
    currentSegment = {
      videoId: p.videoId,
      start:   p.start || 0,
      end:     p.end   || null,
      index:   p.segmentIndex != null ? p.segmentIndex : null,
    };
    segmentCued = false;
    // Mark this pendingPlay as a hard sync so _drainPendingPlay logs and ACKs correctly.
    pendingPlay = { videoId: p.videoId, start: p.start || 0, end: p.end, isHardSync: true };

    // Cue the video.  When the CUED state event fires, _drainPendingPlay will
    // seekTo(start) + playVideo() with the hard-sync log and ACK.
    _execVideo(() => {
      console.log('[Display] Hard sync: cueVideoById', p.videoId, '@', p.start);
      try {
        player.cueVideoById({ videoId: p.videoId, startSeconds: p.start || 0 });
      } catch (e) { console.warn('[Display] hardSync cueVideoById error:', e.message); }
    });
  });

  Channel.on('pause', () => {
    _noteActivity();
    _clearEndPoll();
    if (playerReady) try { player.pauseVideo(); } catch {}
  });

  Channel.on('resume', (p) => {
    _noteActivity();
    if (p && p.targetDisplayId && p.targetDisplayId !== displayInstanceId) {
      console.log('[Display] resume ignored: targetDisplayId mismatch (target:', p.targetDisplayId, 'this:', displayInstanceId, ')');
      return;
    }
    _lastCommand = { type: 'resume', payload: null, ts: Date.now() };
    if (!playerReady) return;
    if (_isDuplicateCommand('resume')) {
      console.log('[Display] Projector duplicate resume ignored');
      return;
    }
    console.log('[Display] Projector player: playVideo() (resume)');
    // endTime retained from the previous play message; poll restarts via onStateChange
    try { player.playVideo(); } catch (e) { console.warn('[Display] resume error:', e.message); }
  });

  Channel.on('replay', (p) => {
    _noteActivity();
    if (p.targetDisplayId && p.targetDisplayId !== displayInstanceId) {
      console.log('[Display] replay ignored: targetDisplayId mismatch (target:', p.targetDisplayId, 'this:', displayInstanceId, ')');
      return;
    }
    _lastCommand = { type: 'replay', payload: p, ts: Date.now() };
    if (!playerReady) return;
    const cmdKey = `replay:${p.start}`;
    if (_isDuplicateCommand(cmdKey)) {
      console.log('[Display] Projector duplicate replay ignored:', cmdKey);
      return;
    }
    endTime = (p.end != null && p.end > 0) ? p.end : null;
    if (DEBUG_TIMING) console.log('[Display] replay received, start=', p.start, 'end=', endTime);
    _clearEndPoll();
    // Replay always seeks to start — no readiness gate needed since the video
    // must already have been loaded to be replayable.
    console.log('[Display] Projector player: playVideo() (replay) — seekTo', p.start || 0);
    try {
      player.seekTo(p.start || 0, true);
      player.playVideo();
    } catch (e) { console.warn('[Display] replay error:', e.message); }
  });

  Channel.on('showQuestion', (p) => {
    _noteActivity();
    _syncQuestionText(p.text);
    dom.questionCard.classList.add('revealed');
    dom.questionText.classList.remove('blurred');
    document.body.classList.add('question-visible');
  });

  Channel.on('hideQuestion', () => {
    _noteActivity();
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.add('blurred');
    document.body.classList.remove('question-visible');
  });

  Channel.on('startDiscussionTimer', (p) => {
    _noteActivity();
    _startTimer(p.total || 0, p.remaining != null ? p.remaining : p.total || 0);
  });

  Channel.on('updateTimer', (p) => {
    _noteActivity();
    timer.total     = p.total != null ? p.total : timer.total;
    timer.remaining = p.remaining != null ? p.remaining : timer.remaining;
    _stopTimer();
    if (p.running !== false) {
      timer.running = true;
      timer.handle  = setInterval(_tickTimer, 1000);
    }
    _renderTimer();
  });

  Channel.on('blackScreen', () => {
    _noteActivity();
    _clearEndPoll();
    _activateBlack();
    if (playerReady) try { player.pauseVideo(); } catch {}
  });

  Channel.on('intermission', () => {
    _noteActivity();
    _clearEndPoll();
    _activateIntermission();
    if (playerReady) try { player.pauseVideo(); } catch {}
  });

  Channel.on('clearOverlay', () => {
    _noteActivity();
    _clearOverlays();
  });

  Channel.on('applyShowData', (p) => {
    _noteActivity();
    if (p && p.show) {
      dom.eventName.textContent = p.show.eventName || 'Hacker Theater';
      _applyQuestionDisplayMode(p.show.questionDisplayMode || 'below-video');
      _applyPlayerInteractionOverride(p.show.allowDirectPlayerInteraction);
    }
  });

  Channel.on('fullSync', (snap) => {
    _noteActivity();
    applyFullSync(snap);
  });

  Channel.on('heartbeat', () => {
    _noteActivity();
    // Reply so the control room knows the projector is alive
    Channel.send('ping');
  });

  Channel.on('pong', () => {
    _noteActivity();
  });

  // ---- Presentation mode (fullscreen) ----

  function _enterPresentationMode() {
    const el  = document.documentElement;
    const req = el.requestFullscreen || el.webkitRequestFullscreen;

    if (!req) {
      // Fullscreen API unavailable — apply class anyway for scaled-up layout
      document.body.classList.add('presentation-mode');
      dom.fsBlocked.textContent = 'Fullscreen not supported in this browser. Press F11 for full-window mode.';
      dom.fsBlocked.style.display = '';
      return;
    }

    let p;
    try { p = req.call(el); } catch { p = null; }

    if (p && typeof p.then === 'function') {
      p.then(() => {
        document.body.classList.add('presentation-mode');
        dom.fsBlocked.style.display = 'none';
      }).catch(() => {
        // Blocked — not triggered by a direct user gesture (e.g. remote command)
        dom.fsBlocked.textContent = 'Click "Enter Presentation Mode" on this screen to enable fullscreen.';
        dom.fsBlocked.style.display = '';
      });
    } else {
      // Older WebKit — no promise returned
      document.body.classList.add('presentation-mode');
      dom.fsBlocked.style.display = 'none';
    }
  }

  function _exitPresentationMode() {
    document.body.classList.remove('presentation-mode');
    if (dom.fsBlocked) dom.fsBlocked.style.display = 'none';
  }

  // Sync class with the actual fullscreen state so Escape exits cleanly
  function _onFullscreenChange() {
    const isFs = !!(document.fullscreenElement || document.webkitFullscreenElement);
    if (isFs) {
      document.body.classList.add('presentation-mode');
    } else {
      _exitPresentationMode();
    }
  }
  document.addEventListener('fullscreenchange',       _onFullscreenChange);
  document.addEventListener('webkitfullscreenchange', _onFullscreenChange);

  dom.btnPresentation.addEventListener('click', _enterPresentationMode);

  // P key enters presentation mode (only when not typing in a field)
  window.addEventListener('keydown', e => {
    if (e.code !== 'KeyP' || e.metaKey || e.ctrlKey || e.altKey) return;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    _enterPresentationMode();
  });

  Channel.on('enterPresentationMode', () => {
    _noteActivity();
    _enterPresentationMode();
  });

  // ---- Interaction shield ----

  /**
   * Blocks direct pointer interaction with the YouTube iframe on the projector.
   * Disabled by ?debugPlayer=1 in the URL; can also be disabled at runtime
   * via show.allowDirectPlayerInteraction = true (checked in applyFullSync /
   * applyShowData channel handlers).
   */
  function _setupInteractionShield() {
    const debugByUrl = new URLSearchParams(location.search).get('debugPlayer') === '1';
    const shield = document.getElementById('video-lock');
    if (!shield) return;

    if (debugByUrl) {
      shield.classList.add('video-interaction-lock--disabled');
      return;
    }

    const BLOCK_EVENTS = ['click', 'pointerdown', 'pointerup', 'touchstart', 'dblclick', 'contextmenu'];
    BLOCK_EVENTS.forEach(type => {
      shield.addEventListener(type, e => {
        e.preventDefault();
        e.stopPropagation();
      }, { passive: false, capture: true });
    });
  }

  function _applyPlayerInteractionOverride(allow) {
    if (!allow) return;
    const shield = document.getElementById('video-lock');
    if (shield) shield.classList.add('video-interaction-lock--disabled');
  }

  _setupInteractionShield();

  // ---- Boot ----

  // 1. Restore from localStorage (covers the case where display opens mid-show)
  const saved = Channel.loadState();
  if (saved) {
    applyFullSync(saved);
    _setConnecting();
  }

  // 2. Ask the control room for a live sync
  Channel.send('requestSync');

  // 3. Periodic ping so the control room can track connection
  setInterval(() => Channel.send('ping'), 4000);

})();
