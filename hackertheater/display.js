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
    timerDisplay: $('timer-display'),
    timerBar:     $('timer-bar'),
  };

  // ---- YouTube player ----

  let player      = null;
  let playerReady = false;
  let pendingVideoAction = null;   // queued until playerReady

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
          onReady: _onPlayerReady,
          onError: _onPlayerError,
        },
      });
    } catch (e) {
      console.warn('[Display] Failed to create YT.Player:', e.message);
    }
  };

  function _onPlayerReady() {
    playerReady = true;
    dom.placeholder.classList.add('hidden');
    if (pendingVideoAction) {
      const a = pendingVideoAction;
      pendingVideoAction = null;
      try { a(); } catch (e) { console.warn('[Display] pending action threw:', e.message); }
    }
  }

  function _onPlayerError(ev) {
    console.warn('[Display] YT player error:', ev.data);
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
      dom.questionText.textContent = snap.questionText;
    }
    if (snap.questionVisible) {
      dom.questionCard.classList.add('revealed');
      dom.questionText.classList.remove('blurred');
    } else {
      dom.questionCard.classList.remove('revealed');
      dom.questionText.classList.add('blurred');
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

    // Video
    if (snap.videoId) {
      _execVideo(() => {
        if (snap.playbackState === 'playing') {
          player.loadVideoById({ videoId: snap.videoId, startSeconds: snap.videoStart || 0 });
        } else {
          player.cueVideoById({ videoId: snap.videoId, startSeconds: snap.videoStart || 0 });
        }
      });
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
    const seg = p.segment || {};
    dom.segTitle.textContent    = seg.title    || '—';
    dom.segPanelist.textContent = seg.panelist ? `↳ ${seg.panelist}` : '';
    if (p.index != null && p.totalSegments) {
      dom.segCounter.textContent = `${p.index + 1} / ${p.totalSegments}`;
    }
    // Reset question
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.add('blurred');
    if (seg.question) dom.questionText.textContent = seg.question;

    // Reset timer display
    _stopTimer();
    timer.total = timer.remaining = 0;
    _renderTimer();

    // Cue the video without playing
    if (seg.youtubeId) {
      _execVideo(() => {
        player.cueVideoById({ videoId: seg.youtubeId, startSeconds: seg.start || 0 });
      });
    }
  });

  Channel.on('play', (p) => {
    _noteActivity();
    if (!p.videoId) return;
    _execVideo(() => {
      player.loadVideoById({ videoId: p.videoId, startSeconds: p.start || 0 });
    });
  });

  Channel.on('pause', () => {
    _noteActivity();
    if (playerReady) try { player.pauseVideo(); } catch {}
  });

  Channel.on('replay', (p) => {
    _noteActivity();
    if (!playerReady) return;
    try {
      player.seekTo(p.start || 0, true);
      player.playVideo();
    } catch (e) { console.warn('[Display] replay error:', e.message); }
  });

  Channel.on('showQuestion', (p) => {
    _noteActivity();
    if (p.text) dom.questionText.textContent = p.text;
    dom.questionCard.classList.add('revealed');
    dom.questionText.classList.remove('blurred');
  });

  Channel.on('hideQuestion', () => {
    _noteActivity();
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.add('blurred');
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
    _activateBlack();
    if (playerReady) try { player.pauseVideo(); } catch {}
  });

  Channel.on('intermission', () => {
    _noteActivity();
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
