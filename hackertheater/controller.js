/**
 * controller.js — Hacker Theater Control Room logic
 *
 * Loads show.json, manages segment state, drives the UI,
 * handles keyboard shortcuts, and coordinates the timer.
 * Exposes window.ShowController for editor.js.
 * Depends on clips.js being loaded first.
 */

(async () => {
  // ?controlAudio=1 keeps the control-room player unmuted during testing.
  // Default: control room is muted whenever a projector is connected so the
  // projector is the sole audio source for the audience.
  const CONTROL_AUDIO_ENABLED = new URLSearchParams(location.search).get('controlAudio') === '1';

  // ============================================================
  // 1. LOAD SHOW DATA
  // ============================================================

  let show          = null;
  let publishedShow = null; // immutable reference to the fetched show.json
  let segments      = [];
  let currentIndex  = 0;

  try {
    const resp = await fetch('./show.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    show          = await resp.json();
    publishedShow = JSON.parse(JSON.stringify(show)); // deep-frozen reference
    segments      = show.segments || [];
    if (segments.length === 0) throw new Error('show.json contains no segments.');
  } catch (err) {
    showError(`Failed to load show.json: ${err.message}`);
    return;
  }

  // ============================================================
  // 2. DOM REFS
  // ============================================================

  const $ = id => document.getElementById(id);

  const dom = {
    eventName:     $('event-name'),
    eventDate:     $('event-date'),
    segmentLabel:  $('segment-label'),
    progressDots:  $('progress-dots'),
    segTitle:      $('seg-title'),
    segPanelist:   $('seg-panelist'),
    segTimestamps: $('seg-timestamps'),
    segDuration:   $('seg-duration'),
    questionCard:  $('question-card'),
    questionText:  $('question-text'),
    timerDisplay:  $('timer-display'),
    timerBar:      $('timer-bar'),
    statusDot:     $('status-dot'),
    statusText:    $('status-text'),
    queueList:     $('queue-list'),
    notesPanel:    $('notes-panel'),
    notesText:     $('notes-text'),
    notesBackup:   $('notes-backup'),
    notesPanelist: $('notes-panelist'),
    blackOverlay:  $('black-overlay'),
    intermOverlay: $('interm-overlay'),
    intermClock:   $('interm-clock'),
    errorBanner:   $('error-banner'),
    placeholder:   $('video-placeholder'),
  };

  // ============================================================
  // 3. STATE
  // ============================================================

  const state = {
    questionVisible:   false,
    notesVisible:      true,
    timerRunning:      false,
    timerTotal:        0,
    timerRemaining:    0,
    timerHandle:       null,
    completed:         new Set(),
    blackActive:       false,
    intermActive:      false,
    intermClockHandle: null,
    // Explicit clip lifecycle: idle → playing ↔ paused → ended
    // 'idle'   = segment loaded but never played yet
    // 'playing'= actively playing
    // 'paused' = paused mid-playback (resume resumes position)
    // 'ended'  = reached configured end timestamp (play restarts from start)
    clipState:         'idle',
  };

  // ============================================================
  // 4. INIT HEADER
  // ============================================================

  function _renderHeader() {
    dom.eventName.textContent = show.eventName || 'Hacker Theater';
    dom.eventDate.textContent = formatDate(show.eventDate);
  }

  _renderHeader();

  // ============================================================
  // 5. QUEUE
  // ============================================================

  function buildQueue() {
    dom.queueList.innerHTML = '';
    segments.forEach((seg, i) => {
      const item = document.createElement('div');
      item.className = 'queue-item';
      item.setAttribute('role', 'button');
      item.setAttribute('tabindex', '0');
      item.setAttribute('aria-label', `Segment ${i + 1}: ${seg.title}`);

      const clipSecs = (seg.end || 0) - (seg.start || 0);
      item.innerHTML = `
        <div class="queue-item__num">SEGMENT ${i + 1}</div>
        <div class="queue-item__title">${escHtml(seg.title)}</div>
        <div class="queue-item__panelist">${escHtml(seg.panelist || '')}</div>
        <div class="queue-item__meta">${fmtTime(clipSecs)} clip · ${seg.discussionMinutes || 5}min discussion</div>
      `;

      item.addEventListener('click', () => jumpTo(i));
      item.addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); jumpTo(i); }
      });
      dom.queueList.appendChild(item);
    });

    refreshQueue();
  }

  function refreshQueue() {
    const items = dom.queueList.querySelectorAll('.queue-item');
    items.forEach((el, i) => {
      el.classList.remove('completed', 'current');
      if (state.completed.has(i))  el.classList.add('completed');
      else if (i === currentIndex) el.classList.add('current');
    });

    const current = dom.queueList.querySelector('.queue-item.current');
    if (current) current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    dom.progressDots.innerHTML = '';
    segments.forEach((_, i) => {
      const dot = document.createElement('div');
      dot.className = 'progress-dot';
      if (state.completed.has(i)) dot.classList.add('completed');
      else if (i === currentIndex) dot.classList.add('current');
      dom.progressDots.appendChild(dot);
    });

    dom.segmentLabel.textContent = `${currentIndex + 1} / ${segments.length}`;
  }

  // ============================================================
  // 5b. TIMESTAMP PARSING
  // ============================================================

  /**
   * Normalise any timestamp representation to an integer number of seconds.
   * Accepts:  79  |  "79"  |  "1:19"  |  "00:01:19"  |  79.5  |  null/undefined
   * Returns: integer seconds, or 0 on unrecognised input.
   * This mirrors the parseTime() function in editor.js so show.json values edited
   * by hand or imported as mm:ss strings always reach the player as plain numbers.
   */
  function _parseTs(v) {
    if (v === null || v === undefined || v === '') return 0;
    if (typeof v === 'number') return Math.round(v);
    const s = String(v).trim();
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^\d+\.\d+$/.test(s)) return Math.round(parseFloat(s));
    const mmss = s.match(/^(\d{1,2}):(\d{2})$/);
    if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    const hhmmss = s.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hhmmss)
      return parseInt(hhmmss[1], 10) * 3600
           + parseInt(hhmmss[2], 10) * 60
           + parseInt(hhmmss[3], 10);
    console.warn('[Controller] _parseTs: unrecognised timestamp format:', JSON.stringify(v), '— using 0');
    return 0;
  }

  // ============================================================
  // 6. LOAD SEGMENT
  // ============================================================

  function loadSegment(index, autoPlay = false) {
    if (index < 0 || index >= segments.length) return;
    currentIndex = index;
    stopTimer();

    // Clear any error left over from a previous segment
    dom.errorBanner.classList.remove('visible');
    dom.errorBanner.textContent = '';

    const seg = segments[index];

    // Normalise timestamps once — guards against string values ("1:19") from
    // hand-edited or imported show.json files reaching the player as strings.
    seg.start = _parseTs(seg.start);
    seg.end   = _parseTs(seg.end);

    console.log('[Controller] Segment loaded — idx:', index,
                'title:', seg.title, 'videoId:', seg.youtubeId,
                'start:', seg.start, 'end:', seg.end);

    dom.segTitle.textContent      = seg.title    || '—';
    dom.segPanelist.textContent   = seg.panelist ? `↳ ${seg.panelist}` : '';
    dom.segTimestamps.textContent = `${fmtTime(seg.start)} → ${fmtTime(seg.end)}`;
    const clipLen = seg.end - seg.start;
    dom.segDuration.textContent = `Clip length: ${fmtTime(clipLen)}`;

    state.questionVisible = false;
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.remove('hidden-text');
    dom.questionText.textContent = seg.question || '(No question provided)';
    hideQuestionCard();

    const mins = seg.discussionMinutes || 5;
    state.timerTotal     = mins * 60;
    state.timerRemaining = state.timerTotal;
    renderTimer(state.timerRemaining, state.timerTotal);

    dom.notesText.textContent     = seg.moderatorNotes || '(No notes)';
    dom.notesPanelist.textContent = seg.panelist       || '—';
    dom.notesBackup.innerHTML     = '';
    (seg.backupQuestions || []).forEach(q => {
      const li = document.createElement('li');
      li.textContent = q;
      dom.notesBackup.appendChild(li);
    });

    // Cue the video; if the ID is missing, surface a recoverable warning
    // so the host can still use the question card, timer, and navigation.
    if (!seg.youtubeId) {
      toast(`Segment ${index + 1} has no YouTube video ID — video skipped.`, 'error');
      setStatus('error', 'No video ID configured');
    } else {
      ensureControllerMuted('cue');
      Clips.cue(seg.youtubeId, seg.start, seg.end);
    }

    state.clipState = 'idle';

    Clips.setOnEnd(() => {
      console.log('[Controller] onEnd fired for segment', index, '— projectorConnected:', projectorConnected);
      state.clipState = 'ended';
      setStatus('ended', 'Clip ended');
      state.completed.add(index);
      refreshQueue();
      revealQuestionCard();  // broadcasts showQuestion to projector
      startTimer();          // broadcasts startDiscussionTimer to projector
      // Only broadcast pause when NO projector is connected.
      // When a projector IS connected, the display's own end-poll is authoritative
      // and will pause itself at the correct elapsed duration. Broadcasting pause
      // from the controller's muted preview kills the projector's poll too early
      // because the preview player may report different timing.
      if (!projectorConnected) {
        console.log('[Controller] Broadcasting pause — reason: controller onEnd (no projector)');
        _broadcast('pause');
      } else {
        console.log('[Controller] Skipping pause broadcast — projector is authoritative for segment end');
      }
      toast('Clip ended — discussion question revealed.', 'info');
    });

    refreshQueue();
    setStatus('paused', 'Ready — press Play');

    _broadcast('loadSegment', { index, segment: seg, totalSegments: segments.length });

    // Segment changed — the next play command to the projector needs to seek to
    // the new start position, so arm hard sync regardless of current flag state.
    projectorNeedsHardSync = true;

    if (autoPlay) setTimeout(() => playClipFromStart(), 300);
  }

  function jumpTo(index) {
    if (Clips.isPlaying()) Clips.pause();
    loadSegment(index);
  }

  // ============================================================
  // 7. PROJECTOR CHANNEL
  // ============================================================

  let _lastTimerSave     = 0;
  let _lastProjectorPing = 0;
  let projectorConnected = false; // true while a display window is actively pinging us
  // Handshake state: displayReady is set only after the display's YT player onReady
  // fires and it sends 'displayReady'.  Until then play/resume/replay commands are
  // held in pendingProjectorCommand so the first clip always reaches the display.
  let displayReady            = false;
  let activeDisplayId         = null;  // displayInstanceId of the last display that sent displayReady
  let pendingProjectorCommand = null;  // { type, payload, clipsAction? } queued while displayReady=false
  // Hard-sync flag: when true the next play command sent to the projector is
  // upgraded to 'hardSyncPlay' so the display always starts from an exact position.
  // Set on display connect, segment change, and replay; cleared when the projector
  // acknowledges a hard-sync play.
  let projectorNeedsHardSync  = true;
  // Dedup: suppress identical resume commands sent within 500 ms.
  let _lastResumeSentTs = 0;
  const RESUME_DEDUP_MS = 500;

  function _buildSnapshot() {
    const seg = segments[currentIndex] || null;
    return {
      show:            { ...show, segments },
      segmentIndex:    currentIndex,
      totalSegments:   segments.length,
      segment:         seg,
      videoId:         seg ? seg.youtubeId : null,
      videoStart:      seg ? (seg.start || 0) : 0,
      videoEnd:        seg ? (seg.end   || 0) : 0,
      playbackState:   Clips.isPlaying() ? 'playing' : 'paused',
      questionVisible: state.questionVisible,
      questionText:    dom.questionText ? dom.questionText.textContent : null,
      timerTotal:      state.timerTotal,
      timerRemaining:  state.timerRemaining,
      timerRunning:    state.timerRunning,
      overlay:         state.blackActive ? 'black' : (state.intermActive ? 'intermission' : 'none'),
    };
  }

  function _broadcast(type, payload) {
    if (typeof Channel === 'undefined') return;
    Channel.send(type, payload || {});
    // Save state on all messages except high-frequency timer ticks
    // (for those, throttle to once per 5 seconds)
    if (type !== 'updateTimer') {
      Channel.saveState(_buildSnapshot());
    } else if (Date.now() - _lastTimerSave > 5000) {
      _lastTimerSave = Date.now();
      Channel.saveState(_buildSnapshot());
    }
  }

  // Listen for messages from the projector display
  if (typeof Channel !== 'undefined') {
    Channel.on('requestSync', () => {
      Channel.send('fullSync', _buildSnapshot());
      Channel.saveState(_buildSnapshot());
      _updateProjectorStatus(true);
    });

    Channel.on('ping', () => {
      _lastProjectorPing = Date.now();
      Channel.send('pong');
      _updateProjectorStatus(true);
    });

    Channel.on('pong', () => {
      _lastProjectorPing = Date.now();
      _updateProjectorStatus(true);
    });

    // Display signals its YT player is ready — safe to send play commands now.
    // This message arrives once on initial player load AND on every subsequent
    // heartbeat (display re-announces while playerReady).  Only the transition
    // from not-ready → ready (or a new display instance) should arm hard-sync
    // and flush the pending command.  Repeat heartbeat-driven messages update
    // the ping timestamp and connection status only — they must NOT re-arm
    // projectorNeedsHardSync or re-flush pendingProjectorCommand, since that
    // would re-trigger commands already sent and cause duplicate play/resume.
    Channel.on('displayReady', (p) => {
      _lastProjectorPing = Date.now();
      const newId         = p && p.displayInstanceId ? p.displayInstanceId : null;
      const isNewInstance = newId && newId !== activeDisplayId;
      const wasReady      = displayReady;

      if (newId) activeDisplayId = newId;
      displayReady = true;
      _updateProjectorStatus(true);

      if (isNewInstance || !wasReady) {
        // Genuine transition: new display window or first ready from this instance.
        if (isNewInstance) {
          console.log('[Controller] New display instance registered:', newId,
                      activeDisplayId ? '(replacing previous)' : '(first)');
        }
        projectorNeedsHardSync = true; // first play after connect must hard-sync
        console.log('[Controller] Display ready received — instanceId:', activeDisplayId,
                    '— hard sync armed');
        if (pendingProjectorCommand) {
          const cmd = pendingProjectorCommand;
          pendingProjectorCommand = null; // cleared before call — no re-flush on next displayReady
          console.log('[Controller] Projector ready; flushing queued', cmd.type);
          // Execute the deferred local Clips action before sending to projector.
          if (typeof cmd.clipsAction === 'function') {
            try { cmd.clipsAction(); } catch (e) { console.warn('[Controller] clipsAction threw:', e.message); }
          }
          _sendProjectorCommand(cmd);
        }
      }
      // else: repeated heartbeat-ready from same instance — ping timestamp updated, nothing else to do.
    });

    // Display acknowledges it has started playing.
    Channel.on('displayPlayingAck', (p) => {
      console.log('[Controller] Projector accepted playback — instanceId:', p.displayInstanceId,
                  'videoId:', p.videoId, 'start:', p.start, 'action:', p.action);
      if (p.action === 'hardSync') {
        projectorNeedsHardSync = false;
        console.log('[Controller] Projector hard sync acknowledged — projectorNeedsHardSync cleared');
      }
    });

    // Display signals it reached the segment end boundary and paused itself.
    // This is the authoritative end signal when a projector is connected.
    Channel.on('displaySegmentEnded', (p) => {
      _lastProjectorPing = Date.now();
      console.log('[Controller] Projector segment ended — segmentIndex:', p.segmentIndex);
      // If the controller hasn't already ended this clip, trigger the end flow.
      if (state.clipState === 'playing' || state.clipState === 'paused') {
        state.clipState = 'ended';
        setStatus('ended', 'Clip ended');
        state.completed.add(currentIndex);
        refreshQueue();
        revealQuestionCard();
        startTimer();
        Clips.pause();
        toast('Clip ended — discussion question revealed.', 'info');
      }
    });

    // Send periodic heartbeat so display.js knows control room is alive
    setInterval(() => {
      Channel.send('heartbeat');
      // Check whether projector has gone silent
      if (_lastProjectorPing > 0 && Date.now() - _lastProjectorPing > 10000) {
        _updateProjectorStatus(false);
      }
    }, 5000);
  }

  /**
   * Enforce mute on the controller preview player before any load/play/seek call.
   * Guards against YouTube silently resetting the mute state across video loads.
   * No-op when CONTROL_AUDIO_ENABLED or when no projector is connected.
   */
  function ensureControllerMuted(reason) {
    if (CONTROL_AUDIO_ENABLED) return;
    if (!projectorConnected) return;
    Clips.mute(); // sets _shouldBeMuted + calls player.mute() + setVolume(0)
    console.log('[Controller] Controller preview muted before', reason,
                '(projector owns audio, muted:', Clips.isMuted(), ')');
  }

  /**
   * Send a play/resume command to the active display instance.
   * Always includes targetDisplayId so stale windows ignore it.
   *
   * For 'play' commands the function decides between regular 'play' and
   * 'hardSyncPlay':
   *   - projectorNeedsHardSync=true  → always hardSyncPlay
   *   - drift > HARD_SYNC_DRIFT_S    → upgrade to hardSyncPlay
   *   - otherwise                    → regular play
   */
  const HARD_SYNC_DRIFT_S = 0.75;

  function _sendProjectorCommand(cmd) {
    const target = activeDisplayId ? { targetDisplayId: activeDisplayId } : {};

    if (cmd.type === 'play') {
      let useHardSync = projectorNeedsHardSync;

      // Drift guard: if the controller's player is already well past the
      // expected segment start, the display would land out-of-sync on a
      // regular play — upgrade to hardSyncPlay.
      if (!useHardSync && cmd.payload.start != null) {
        const ct = Clips.getCurrentTime();
        if (ct !== null && Math.abs(ct - cmd.payload.start) > HARD_SYNC_DRIFT_S) {
          console.log('[Controller] Projector drift detected (ctrlTime=', ct.toFixed(2),
                      'expectedStart=', cmd.payload.start, ') — upgrading to hardSyncPlay');
          useHardSync = true;
        }
      }

      if (useHardSync) {
        console.log('[Controller] → hardSyncPlay | videoId:', cmd.payload.videoId,
                    'start:', cmd.payload.start, 'end:', cmd.payload.end,
                    'segmentIndex:', cmd.payload.segmentIndex,
                    'targetDisplayId:', target.targetDisplayId || '(any)');
        _broadcast('hardSyncPlay', { ...cmd.payload, ...target });
      } else {
        console.log('[Controller] → play | videoId:', cmd.payload.videoId,
                    'start:', cmd.payload.start, 'end:', cmd.payload.end,
                    'segmentIndex:', cmd.payload.segmentIndex,
                    'targetDisplayId:', target.targetDisplayId || '(any)');
        _broadcast('play', { ...cmd.payload, ...target });
      }

    } else if (cmd.type === 'resume') {
      // If the display hasn't confirmed a hard-sync play yet, a bare resume would
      // land on a blank player.  Upgrade to hardSyncPlay using the current segment.
      if (projectorNeedsHardSync) {
        const seg = segments[currentIndex];
        if (seg && seg.youtubeId) {
          const start = _parseTs(seg.start);
          const end   = _parseTs(seg.end);
          console.log('[Controller] Projector resume upgraded to hardSyncPlay (projectorNeedsHardSync) —',
                      seg.youtubeId, '@', start);
          console.log('[Controller] → hardSyncPlay (from resume) | videoId:', seg.youtubeId,
                      'start:', start, 'end:', end, 'segmentIndex:', currentIndex,
                      'targetDisplayId:', target.targetDisplayId || '(any)');
          _broadcast('hardSyncPlay', {
            videoId: seg.youtubeId, start, end,
            segmentIndex: currentIndex, ...target,
          });
        } else {
          console.log('[Controller] Projector resume skipped — projectorNeedsHardSync but no segment');
        }
        return;
      }

      // Dedup: ignore repeated resume commands within 500 ms (can arrive when
      // displayReady fires multiple times in quick succession).
      const now = Date.now();
      if (now - _lastResumeSentTs < RESUME_DEDUP_MS) {
        console.log('[Controller] Projector resume dedup — skipped (last sent', now - _lastResumeSentTs, 'ms ago)');
        return;
      }
      _lastResumeSentTs = now;
      console.log('[Controller] → resume | targetDisplayId:', target.targetDisplayId || '(any)');
      _broadcast('resume', target);
    }
  }

  function _updateProjectorStatus(connected) {
    const wasConnected = projectorConnected;
    projectorConnected = connected;

    // Keep the control-room player muted whenever the projector is connected so
    // the projector is the sole audio source for the audience.
    // We re-enforce the mute on every call (not just on the transition) because
    // loadVideoById can silently reset YouTube's mute state after each clip load.
    // CONTROL_AUDIO_ENABLED (?controlAudio=1) bypasses this for testing.
    //
    // We do NOT unmute on heartbeat timeout: Chrome throttles setInterval in
    // background tabs to ~60 s, so the projector's 4 s ping becomes a 60 s ping,
    // falsely triggering the 10 s disconnect threshold and unmuting mid-show.
    // Once a projector has connected, the control room stays muted for the session.
    if (!CONTROL_AUDIO_ENABLED) {
      if (connected) {
        if (!wasConnected) {
          console.log('[Controller] Projector mode started — muting control-room player');
        }
        Clips.mute();
        console.log('[Controller] Control-room preview muted (projector connected, muted:', Clips.isMuted(), ')');
      }
      // Intentionally no Clips.unmute() here — see note above.
    }

    const dot   = $('proj-dot');
    const label = $('proj-label');
    if (!dot || !label) return;
    if (connected) {
      dot.className = 'proj-dot proj-dot--connected';
      const readyLabel = displayReady ? '' : ' · awaiting player';
      label.textContent = CONTROL_AUDIO_ENABLED
        ? `Projector view connected (audio on)${readyLabel}`
        : `Projector view connected · CR muted${readyLabel}`;
    } else {
      dot.className     = 'proj-dot';
      label.textContent = 'Projector view not open';
    }
  }

  // ============================================================
  // 8. REPLACE SHOW (called by editor.js via ShowController)
  // ============================================================

  function replaceShow(newShow) {
    if (!newShow || !Array.isArray(newShow.segments)) return;
    if (Clips.isPlaying()) Clips.pause();

    show     = JSON.parse(JSON.stringify(newShow));
    segments = show.segments;

    _renderHeader();
    state.completed = new Set();

    // If current segment index is now out of range, reset to first
    if (currentIndex >= segments.length) currentIndex = 0;

    buildQueue();
    if (segments.length > 0) {
      loadSegment(currentIndex);
    } else {
      setStatus('paused', 'No segments loaded');
    }
    _broadcast('applyShowData', { show });
  }

  // ============================================================
  // 8. PLAYBACK CONTROLS
  // ============================================================

  /**
   * Returns true if seg has valid, usable timestamps (both numbers, end > start).
   * Shows a toast and returns false otherwise.
   */
  function _validateTimestamps(seg) {
    const start = typeof seg.start === 'number' ? seg.start : null;
    const end   = typeof seg.end   === 'number' ? seg.end   : null;
    if (start === null || end === null) {
      toast('Segment is missing a start or end timestamp — cannot play.', 'error');
      return false;
    }
    if (end <= start) {
      toast(`Invalid timestamps: end (${end}s) must be greater than start (${start}s).`, 'error');
      return false;
    }
    if (DEBUG_TIMING) console.log('[Controller/Timing] segment start=', start, 'end=', end);
    return true;
  }

  // Load from segment start and play (first play, or after clip ended).
  function playClipFromStart() {
    const seg = segments[currentIndex];
    if (!seg) return;
    if (!seg.youtubeId) { toast('No YouTube video ID on this segment.', 'error'); return; }
    if (!_validateTimestamps(seg)) return;
    state.clipState = 'playing';
    ensureControllerMuted('play');
    const projState = projectorConnected ? (displayReady ? 'ready' : 'not-ready') : 'not-connected';
    // start/end already normalised to integers by loadSegment → _parseTs
    const start = _parseTs(seg.start);
    const end   = _parseTs(seg.end);
    console.log('[Controller] Play — idx:', currentIndex,
                'title:', seg.title, 'videoId:', seg.youtubeId,
                'start:', start, 'end:', end, '— projector:', projState, '— muted:', Clips.isMuted());
    setStatus('playing', 'Loading…');

    const payload = { videoId: seg.youtubeId, start, end, segmentIndex: currentIndex };
    if (projectorConnected && !displayReady) {
      // Block local Clips.play until the display is ready — cue only so the
      // controller preview loads the video without emitting audio.
      console.log('[Controller] Preview playback blocked — projector not ready; queued command');
      Clips.cue(seg.youtubeId, start, end);
      pendingProjectorCommand = {
        type:        'play',
        payload,
        clipsAction: () => {
          ensureControllerMuted('play (deferred)');
          Clips.play(seg.youtubeId, start, end);
        },
      };
    } else {
      Clips.play(seg.youtubeId, start, end);
      _sendProjectorCommand({ type: 'play', payload });
    }
  }

  // Resume from the current paused position — no seek.
  function resumeClip() {
    const seg = segments[currentIndex];
    if (!seg || !seg.youtubeId) return;
    state.clipState = 'playing';
    ensureControllerMuted('resume');
    console.log('[Controller] Controller preview resume — muted:', Clips.isMuted());
    setStatus('playing', 'Playing');

    if (projectorConnected && !displayReady) {
      console.log('[Controller] Preview playback blocked — projector not ready; queued command');
      pendingProjectorCommand = {
        type:        'resume',
        payload:     {},
        clipsAction: () => {
          ensureControllerMuted('resume (deferred)');
          Clips.resume();
        },
      };
    } else {
      Clips.resume();
      _sendProjectorCommand({ type: 'resume', payload: {} });
    }
  }

  // Play Clip button: resume if paused, restart if idle/ended, no-op if already playing.
  function playOrResume() {
    if (state.clipState === 'playing') return;
    if (state.clipState === 'paused')  { resumeClip(); return; }
    playClipFromStart(); // idle or ended → start from segment start
  }

  // Space bar: toggle between playing and paused.
  function togglePlayPause() {
    if (state.clipState === 'playing') { pauseClip(); return; }
    if (state.clipState === 'paused')  { resumeClip(); return; }
    playClipFromStart(); // idle or ended → start from segment start
  }

  function pauseClip() {
    state.clipState = 'paused';
    Clips.pause();
    setStatus('paused', 'Paused');
    _broadcast('pause');
  }

  function replayClip() {
    const seg = segments[currentIndex];
    if (!seg || !seg.youtubeId) return;
    if (!_validateTimestamps(seg)) return;
    state.clipState = 'playing';
    ensureControllerMuted('replay');
    const start = _parseTs(seg.start);
    const end   = _parseTs(seg.end);
    console.log('[Controller] Replay — idx:', currentIndex,
                'title:', seg.title, 'videoId:', seg.youtubeId,
                'start:', start, 'end:', end, '— muted:', Clips.isMuted());
    setStatus('playing', 'Replaying');

    // replay always seeks to the segment start — always hard-sync the projector.
    projectorNeedsHardSync = true;
    const payload = { videoId: seg.youtubeId, start, end, segmentIndex: currentIndex };
    if (projectorConnected && !displayReady) {
      console.log('[Controller] Preview playback blocked — projector not ready; queued command');
      Clips.cue(seg.youtubeId, start, end);
      pendingProjectorCommand = {
        type:        'play',
        payload,
        clipsAction: () => {
          ensureControllerMuted('replay (deferred)');
          Clips.replay(start, end);
        },
      };
    } else {
      Clips.replay(start, end);
      _sendProjectorCommand({ type: 'play', payload });
    }
  }

  function prevSegment() {
    if (currentIndex > 0) loadSegment(currentIndex - 1);
  }

  function nextSegment() {
    if (currentIndex < segments.length - 1) loadSegment(currentIndex + 1);
  }

  // ============================================================
  // 9. QUESTION CARD
  // ============================================================

  function revealQuestionCard() {
    state.questionVisible = true;
    dom.questionCard.classList.remove('hidden-card');
    dom.questionCard.classList.add('revealed');
    dom.questionText.classList.remove('hidden-text');
    $('btn-show-q').textContent = 'Hide Question';
    _broadcast('showQuestion', { text: dom.questionText.textContent });
  }

  function hideQuestionCard() {
    state.questionVisible = false;
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.add('hidden-text');
    $('btn-show-q').textContent = 'Show Question';
    _broadcast('hideQuestion');
  }

  function toggleQuestion() {
    if (state.questionVisible) hideQuestionCard();
    else revealQuestionCard();
  }

  function randomBackupQuestion() {
    const seg     = segments[currentIndex];
    const backups = seg.backupQuestions || [];
    if (backups.length === 0) { toast('No backup questions defined.', 'info'); return; }
    const q = backups[Math.floor(Math.random() * backups.length)];
    dom.questionText.textContent = q;
    revealQuestionCard();
    toast('Backup question loaded.', 'success');
  }

  // ============================================================
  // 10. DISCUSSION TIMER
  // ============================================================

  function startTimer() {
    if (state.timerRunning) return;
    state.timerRunning = true;
    state.timerHandle  = setInterval(tickTimer, 1000);
    _broadcast('startDiscussionTimer', { total: state.timerTotal, remaining: state.timerRemaining });
  }

  function pauseTimer() {
    state.timerRunning = false;
    clearInterval(state.timerHandle);
  }

  function resetTimer() {
    pauseTimer();
    state.timerRemaining = state.timerTotal;
    renderTimer(state.timerRemaining, state.timerTotal);
  }

  function stopTimer() {
    pauseTimer();
    state.timerRemaining = state.timerTotal;
    renderTimer(state.timerRemaining, state.timerTotal);
  }

  function tickTimer() {
    if (state.timerRemaining <= 0) {
      pauseTimer();
      renderTimer(0, state.timerTotal);
      _broadcast('updateTimer', { total: state.timerTotal, remaining: 0, running: false });
      return;
    }
    state.timerRemaining -= 1;
    renderTimer(state.timerRemaining, state.timerTotal);
    _broadcast('updateTimer', { total: state.timerTotal, remaining: state.timerRemaining, running: true });
  }

  function renderTimer(remaining, total) {
    const display = dom.timerDisplay;
    const bar     = dom.timerBar;
    const mins    = Math.floor(remaining / 60);
    const secs    = remaining % 60;

    display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    display.classList.remove('warn-60', 'warn-30', 'warn-0');
    bar.classList.remove('warn-60', 'warn-30', 'warn-0');

    if (remaining === 0)       { display.classList.add('warn-0');  bar.classList.add('warn-0');  }
    else if (remaining <= 30)  { display.classList.add('warn-30'); bar.classList.add('warn-30'); }
    else if (remaining <= 60)  { display.classList.add('warn-60'); bar.classList.add('warn-60'); }

    bar.style.width = `${total > 0 ? (remaining / total) * 100 : 0}%`;
  }

  // ============================================================
  // 11. BLACK SCREEN / INTERMISSION
  // ============================================================

  function activateBlack() {
    state.blackActive = true;
    dom.blackOverlay.classList.add('active');
    if (Clips.isPlaying()) Clips.pause();
    _broadcast('blackScreen');
  }

  function deactivateBlack() {
    state.blackActive = false;
    dom.blackOverlay.classList.remove('active');
    _broadcast('clearOverlay');
  }

  function activateIntermission() {
    state.intermActive = true;
    dom.intermOverlay.classList.add('active');
    if (Clips.isPlaying()) Clips.pause();
    updateIntermClock();
    state.intermClockHandle = setInterval(updateIntermClock, 1000);
    _broadcast('intermission');
  }

  function deactivateIntermission() {
    state.intermActive = false;
    dom.intermOverlay.classList.remove('active');
    clearInterval(state.intermClockHandle);
    _broadcast('clearOverlay');
  }

  function updateIntermClock() {
    const now = new Date();
    dom.intermClock.textContent = now.toLocaleTimeString([], {
      hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
  }

  dom.blackOverlay.addEventListener('click', deactivateBlack);
  dom.intermOverlay.addEventListener('click', deactivateIntermission);

  // ============================================================
  // 12. MODERATOR NOTES TOGGLE
  // ============================================================

  function toggleNotes() {
    state.notesVisible = !state.notesVisible;
    if (state.notesVisible) dom.notesPanel.classList.remove('collapsed');
    else                    dom.notesPanel.classList.add('collapsed');
  }

  $('notes-toggle-btn').addEventListener('click', toggleNotes);

  // ============================================================
  // 13. KEYBOARD SHORTCUTS
  // ============================================================

  // Set to true to log timing events (segment start/end, auto-stop) to the console.
  const DEBUG_TIMING = false;

  // Set to true to log every handled shortcut to the console.
  const DEBUG_SHORTCUTS = false;

  /**
   * Returns true when a keydown event should NOT trigger a shortcut.
   * Reasons: modifier key held, focus in a form field or contenteditable,
   * or the Show Editor modal is open.
   */
  function shouldIgnoreShortcut(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return true;
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (e.target.isContentEditable) return true;
    if (window.Editor && window.Editor.isOpen()) return true;
    return false;
  }

  /**
   * Single global keydown handler — registered exactly once on window.
   * Uses event.code (physical key position, layout-independent) for all
   * shortcut matching so Shift+key variants and non-QWERTY layouts work.
   */
  function handleGlobalShortcut(e) {
    // Overlay dismissal: any key collapses the overlay.
    // Still prevent default for Space/Arrows so the page doesn't scroll.
    if (state.blackActive || state.intermActive) {
      if (e.code === 'Space' || e.code === 'ArrowRight' || e.code === 'ArrowLeft') {
        e.preventDefault();
      }
      deactivateBlack();
      deactivateIntermission();
      return;
    }

    if (shouldIgnoreShortcut(e)) return;

    switch (e.code) {
      case 'Space':
        e.preventDefault();
        togglePlayPause();
        break;
      case 'ArrowRight': e.preventDefault(); nextSegment();    break;
      case 'ArrowLeft':  e.preventDefault(); prevSegment();    break;
      case 'KeyQ':       toggleQuestion();                     break;
      case 'KeyR':       replayClip();                         break;
      case 'KeyN':       toggleNotes();                        break;
      case 'KeyF':       requestFullscreen();                  break;
      case 'KeyB':       activateBlack();                      break;
      case 'KeyI':       activateIntermission();               break;
      default: return; // unhandled key — skip DEBUG log
    }

    if (DEBUG_SHORTCUTS) console.log('[Shortcuts] handled:', e.code);
  }

  // Guard: register exactly once even if this IIFE were somehow re-evaluated.
  let _shortcutRegistered = false;
  if (!_shortcutRegistered) {
    _shortcutRegistered = true;
    window.addEventListener('keydown', handleGlobalShortcut);
  }

  // ============================================================
  // 14. FULLSCREEN
  // ============================================================

  function requestFullscreen() {
    const el = document.querySelector('.video-wrapper');
    if (!el) return;
    if      (el.requestFullscreen)          el.requestFullscreen();
    else if (el.webkitRequestFullscreen)    el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)       el.mozRequestFullScreen();
  }

  // ============================================================
  // 15. PLAYBACK STATUS
  // ============================================================

  function setStatus(statusClass, text) {
    dom.statusDot.className    = `status-dot ${statusClass}`;
    dom.statusText.textContent = text;
  }

  Clips.setOnStateChange((ytState, errMsg) => {
    if (ytState === 'error') {
      setStatus('error', errMsg || 'Playback error');
      showError(errMsg || 'YouTube playback error. Check the video ID in show.json.');
      return;
    }
    if (typeof YT === 'undefined') return;
    if (ytState === YT.PlayerState.PLAYING) {
      state.clipState = 'playing';
      setStatus('playing', 'Playing');
    } else if (ytState === YT.PlayerState.PAUSED) {
      // Don't overwrite 'ended': the end-poll calls player.pauseVideo() which
      // fires this PAUSED event before our onEnd callback sets clipState to
      // 'ended'. Guard here so the state machine stays correct.
      if (state.clipState !== 'ended') state.clipState = 'paused';
      setStatus('paused', 'Paused');
    } else if (ytState === YT.PlayerState.ENDED) {
      state.clipState = 'ended';
      setStatus('ended', 'Ended');
    } else if (ytState === YT.PlayerState.BUFFERING) {
      setStatus('playing', 'Buffering…');
    }
  });

  // ============================================================
  // 16. WIRE CONTROL BUTTONS
  // ============================================================

  function wireBtn(id, fn) {
    const el = $(id);
    if (el) el.addEventListener('click', fn);
  }

  wireBtn('btn-play',        playOrResume);
  wireBtn('btn-pause',       pauseClip);
  wireBtn('btn-replay',      replayClip);
  wireBtn('btn-prev',        prevSegment);
  wireBtn('btn-next',        nextSegment);
  wireBtn('btn-show-q',      toggleQuestion);
  wireBtn('btn-backup-q',    randomBackupQuestion);
  wireBtn('btn-toggle-n',    toggleNotes);
  wireBtn('btn-fullscreen',  requestFullscreen);
  wireBtn('btn-black',       activateBlack);
  wireBtn('btn-interm',      activateIntermission);
  wireBtn('btn-timer-start', startTimer);
  wireBtn('btn-timer-pause', pauseTimer);
  wireBtn('btn-timer-reset', resetTimer);
  wireBtn('btn-projector', () => {
    // Do NOT pass 'noopener' here: the HTML spec forces the window name to the
    // empty string when noopener is set, which makes the named-target
    // deduplication ('hackertheater-projector') completely ineffective — every
    // button click opens a new window. Multiple windows each receive every
    // BroadcastChannel play/resume command, causing duplicate audio.
    // Both pages are same-origin so the opener reference carries no new risk.
    window.open('./display.html', 'hackertheater-projector');
    // Warn if the display hasn't sent displayReady within 2 s — helps diagnose
    // hangs where the BroadcastChannel message was missed.
    setTimeout(() => {
      if (!displayReady) {
        console.log('[Controller] Waiting for displayReady from projector — player may still be loading');
      }
    }, 2000);
  });
  wireBtn('btn-enter-presentation', () => _broadcast('enterPresentationMode'));

  // ============================================================
  // 17. TOAST / ERROR
  // ============================================================

  function toast(message, type = 'info') {
    const container = $('toast-container');
    const el        = document.createElement('div');
    el.className    = `toast toast--${type}`;
    el.textContent  = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function showError(msg) {
    dom.errorBanner.textContent = msg;
    dom.errorBanner.classList.add('visible');
  }

  // ============================================================
  // 18. HELPERS
  // ============================================================

  function fmtTime(secs) {
    if (!secs && secs !== 0) return '—';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${String(s).padStart(2, '0')}`;
  }

  function formatDate(iso) {
    if (!iso) return '';
    try {
      return new Date(iso + 'T12:00:00').toLocaleDateString('en-US', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
      });
    } catch { return iso; }
  }

  function escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ============================================================
  // 19. INTERACTION SHIELD
  // ============================================================

  /**
   * Blocks direct pointer interaction with the YouTube iframe.
   * The app's playback controls are the only intended input path.
   *
   * Disabled when:
   *  - URL contains ?debugPlayer=1
   *  - show.allowDirectPlayerInteraction === true
   */
  function _setupInteractionShield() {
    const debugByUrl  = new URLSearchParams(location.search).get('debugPlayer') === '1';
    const debugByShow = show && show.allowDirectPlayerInteraction === true;

    const shield = document.getElementById('video-lock');
    if (!shield) return;

    if (debugByUrl || debugByShow) {
      shield.classList.add('video-interaction-lock--disabled');
      if (debugByUrl || debugByShow) _log && _log('Interaction shield disabled (debug mode)');
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

  // ============================================================
  // 20. BOOT
  // ============================================================

  buildQueue();
  loadSegment(0);
  _setupInteractionShield();

  // Expose API for editor.js
  window.ShowController = {
    getShow:         () => JSON.parse(JSON.stringify({ ...show, segments })),
    getPublishedShow: () => JSON.parse(JSON.stringify(publishedShow)),
    replaceShow,
    jumpToSegment:   jumpTo,
    previewSegment:  (seg) => {
      if (!seg || !seg.youtubeId) return;
      Clips.cue(seg.youtubeId, seg.start || 0, seg.end || 0);
      setStatus('paused', `Preview: ${seg.title || '—'}`);
    },
  };

  // Signal editor.js that ShowController is ready
  document.dispatchEvent(new CustomEvent('showcontroller:ready'));

  // Boot toast once the YouTube IFrame player's onReady has fired
  const apiCheckInterval = setInterval(() => {
    if (Clips.isReady()) {
      clearInterval(apiCheckInterval);
      toast('Player ready. Press Play or Space to begin.', 'success');
    }
  }, 300);

})();
