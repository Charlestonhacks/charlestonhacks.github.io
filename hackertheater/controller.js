/**
 * controller.js — Hacker Theater Control Room logic
 *
 * Loads show.json, manages segment state, drives the UI,
 * handles keyboard shortcuts, and coordinates the timer.
 * Exposes window.ShowController for editor.js.
 * Depends on clips.js being loaded first.
 */

(async () => {
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

    dom.segTitle.textContent      = seg.title    || '—';
    dom.segPanelist.textContent   = seg.panelist ? `↳ ${seg.panelist}` : '';
    dom.segTimestamps.textContent = `${fmtTime(seg.start || 0)} → ${fmtTime(seg.end || 0)}`;
    const clipLen = (seg.end || 0) - (seg.start || 0);
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
      Clips.cue(seg.youtubeId, seg.start || 0, seg.end || 0);
    }

    state.clipState = 'idle';

    Clips.setOnEnd(() => {
      if (DEBUG_TIMING) console.log('[Controller/Timing] onEnd fired for segment', index);
      state.clipState = 'ended';
      setStatus('ended', 'Clip ended');
      state.completed.add(index);
      refreshQueue();
      revealQuestionCard();  // broadcasts showQuestion to projector
      startTimer();          // broadcasts startDiscussionTimer to projector
      // Safety-net pause: projector has its own end-poll, but broadcast anyway
      // in case of timing skew or a disconnected-then-reconnected projector.
      _broadcast('pause');
      toast('Clip ended — discussion question revealed.', 'info');
    });

    refreshQueue();
    setStatus('paused', 'Ready — press Play');

    _broadcast('loadSegment', { index, segment: seg, totalSegments: segments.length });

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

    // Send periodic heartbeat so display.js knows control room is alive
    setInterval(() => {
      Channel.send('heartbeat');
      // Check whether projector has gone silent
      if (_lastProjectorPing > 0 && Date.now() - _lastProjectorPing > 10000) {
        _updateProjectorStatus(false);
      }
    }, 5000);
  }

  function _updateProjectorStatus(connected) {
    const wasConnected = projectorConnected;
    projectorConnected = connected;

    // Mute/unmute the local player on connection-state transitions so the
    // projector display is the sole audio source during live presentation.
    if (connected && !wasConnected) {
      Clips.mute();
    } else if (!connected && wasConnected) {
      Clips.unmute();
    }

    const dot   = $('proj-dot');
    const label = $('proj-label');
    if (!dot || !label) return;
    if (connected) {
      dot.className     = 'proj-dot proj-dot--connected';
      label.textContent = 'Projector connected';
    } else {
      dot.className     = 'proj-dot';
      label.textContent = 'Projector not connected';
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
    Clips.play(seg.youtubeId, seg.start, seg.end);
    setStatus('playing', 'Loading…');
    _broadcast('play', { videoId: seg.youtubeId, start: seg.start, end: seg.end, segmentIndex: currentIndex });
  }

  // Resume from the current paused position — no seek.
  function resumeClip() {
    const seg = segments[currentIndex];
    if (!seg || !seg.youtubeId) return;
    state.clipState = 'playing';
    Clips.resume();
    setStatus('playing', 'Playing');
    _broadcast('resume');
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
    Clips.replay(seg.start, seg.end);
    setStatus('playing', 'Replaying');
    _broadcast('replay', { start: seg.start, end: seg.end, segmentIndex: currentIndex });
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
    window.open('./display.html', 'hackertheater-projector', 'noopener');
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
