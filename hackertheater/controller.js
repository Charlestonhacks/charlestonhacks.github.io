/**
 * controller.js — Hacker Theater Control Room logic
 *
 * Loads show.json, manages segment state, drives the UI,
 * handles keyboard shortcuts, and coordinates the timer.
 * Depends on clips.js being loaded first.
 */

(async () => {
  // ============================================================
  // 1. LOAD SHOW DATA
  // ============================================================

  let show = null;
  let segments = [];
  let currentIndex = 0;

  try {
    const resp = await fetch('./show.json');
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
    show = await resp.json();
    segments = show.segments || [];
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
    // Header
    eventName:        $('event-name'),
    eventDate:        $('event-date'),
    segmentLabel:     $('segment-label'),
    progressDots:     $('progress-dots'),

    // Segment info
    segTitle:         $('seg-title'),
    segPanelist:      $('seg-panelist'),
    segTimestamps:    $('seg-timestamps'),
    segDuration:      $('seg-duration'),

    // Question card
    questionCard:     $('question-card'),
    questionText:     $('question-text'),

    // Timer
    timerDisplay:     $('timer-display'),
    timerBar:         $('timer-bar'),

    // Playback status
    statusDot:        $('status-dot'),
    statusText:       $('status-text'),

    // Queue
    queueList:        $('queue-list'),

    // Notes
    notesPanel:       $('notes-panel'),
    notesText:        $('notes-text'),
    notesBackup:      $('notes-backup'),
    notesPanelist:    $('notes-panelist'),

    // Overlays
    blackOverlay:     $('black-overlay'),
    intermOverlay:    $('interm-overlay'),
    intermClock:      $('interm-clock'),

    // Error
    errorBanner:      $('error-banner'),

    // Video placeholder
    placeholder:      $('video-placeholder'),
  };

  // ============================================================
  // 3. STATE
  // ============================================================

  const state = {
    questionVisible: false,
    notesVisible:    true,
    timerRunning:    false,
    timerTotal:      0,
    timerRemaining:  0,
    timerHandle:     null,
    completed:       new Set(),
    blackActive:     false,
    intermActive:    false,
    intermClockHandle: null,
  };

  // ============================================================
  // 4. INIT HEADER
  // ============================================================

  dom.eventName.textContent = show.eventName || 'Hacker Theater';
  dom.eventDate.textContent = formatDate(show.eventDate);

  // ============================================================
  // 5. BUILD QUEUE
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
      if (state.completed.has(i))     el.classList.add('completed');
      else if (i === currentIndex)    el.classList.add('current');
    });

    // Scroll current item into view
    const current = dom.queueList.querySelector('.queue-item.current');
    if (current) current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });

    // Progress dots
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

    const seg = segments[index];

    // Segment info
    dom.segTitle.textContent     = seg.title    || '—';
    dom.segPanelist.textContent  = seg.panelist ? `↳ ${seg.panelist}` : '';
    dom.segTimestamps.textContent = `${fmtTime(seg.start || 0)} → ${fmtTime(seg.end || 0)}`;
    const clipLen = (seg.end || 0) - (seg.start || 0);
    dom.segDuration.textContent = `Clip length: ${fmtTime(clipLen)}`;

    // Question card — hide and reset
    state.questionVisible = false;
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.remove('hidden-text');
    dom.questionText.textContent = seg.question || '(No question provided)';
    dom.questionCard.classList.add('hidden-card');
    hideQuestionCard();

    // Timer — reset to segment duration
    const mins = seg.discussionMinutes || 5;
    state.timerTotal     = mins * 60;
    state.timerRemaining = state.timerTotal;
    renderTimer(state.timerRemaining, state.timerTotal);

    // Moderator notes
    dom.notesText.textContent     = seg.moderatorNotes  || '(No notes)';
    dom.notesPanelist.textContent = seg.panelist        || '—';
    dom.notesBackup.innerHTML = '';
    (seg.backupQuestions || []).forEach(q => {
      const li = document.createElement('li');
      li.textContent = q;
      dom.notesBackup.appendChild(li);
    });

    // Cue video (do not play yet)
    Clips.cue(seg.youtubeId, seg.start || 0, seg.end || 0);

    // Set up end-of-clip handler
    Clips.setOnEnd(() => {
      setStatus('ended', 'Clip ended');
      state.completed.add(index);
      refreshQueue();
      revealQuestionCard();
      startTimer();
      toast('Clip ended — discussion question revealed.', 'info');
    });

    refreshQueue();
    setStatus('paused', 'Ready — press Play');

    if (autoPlay) {
      setTimeout(() => playClip(), 300);
    }
  }

  function jumpTo(index) {
    if (Clips.isPlaying()) Clips.pause();
    loadSegment(index);
  }

  // ============================================================
  // 7. PLAYBACK CONTROLS
  // ============================================================

  function playClip() {
    const seg = segments[currentIndex];
    if (!seg) return;
    Clips.load(seg.youtubeId, seg.start || 0, seg.end || 0);
    // Brief pause after load to let player initialize, then play
    setTimeout(() => {
      Clips.play();
      setStatus('playing', 'Playing');
    }, 600);
  }

  function pauseClip() {
    Clips.pause();
    setStatus('paused', 'Paused');
  }

  function replayClip() {
    const seg = segments[currentIndex];
    if (!seg) return;
    Clips.replay(seg.start || 0, seg.end || 0);
    setStatus('playing', 'Replaying');
  }

  function prevSegment() {
    if (currentIndex > 0) loadSegment(currentIndex - 1);
  }

  function nextSegment() {
    if (currentIndex < segments.length - 1) loadSegment(currentIndex + 1);
  }

  // ============================================================
  // 8. QUESTION CARD
  // ============================================================

  function revealQuestionCard() {
    state.questionVisible = true;
    dom.questionCard.classList.remove('hidden-card');
    dom.questionCard.classList.add('revealed');
    dom.questionText.classList.remove('hidden-text');
    document.getElementById('btn-show-q').textContent = 'Hide Question';
  }

  function hideQuestionCard() {
    state.questionVisible = false;
    dom.questionCard.classList.remove('revealed');
    dom.questionText.classList.add('hidden-text');
    document.getElementById('btn-show-q').textContent = 'Show Question';
  }

  function toggleQuestion() {
    if (state.questionVisible) hideQuestionCard();
    else revealQuestionCard();
  }

  function randomBackupQuestion() {
    const seg = segments[currentIndex];
    const backups = seg.backupQuestions || [];
    if (backups.length === 0) { toast('No backup questions defined.', 'info'); return; }
    const q = backups[Math.floor(Math.random() * backups.length)];
    dom.questionText.textContent = q;
    revealQuestionCard();
    toast('Backup question loaded.', 'success');
  }

  // ============================================================
  // 9. DISCUSSION TIMER
  // ============================================================

  function startTimer() {
    if (state.timerRunning) return;
    state.timerRunning = true;
    state.timerHandle = setInterval(tickTimer, 1000);
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
      return;
    }
    state.timerRemaining -= 1;
    renderTimer(state.timerRemaining, state.timerTotal);
  }

  function renderTimer(remaining, total) {
    const display = dom.timerDisplay;
    const bar     = dom.timerBar;

    const mins = Math.floor(remaining / 60);
    const secs = remaining % 60;
    display.textContent = `${String(mins).padStart(2,'0')}:${String(secs).padStart(2,'0')}`;

    // Warning classes
    display.classList.remove('warn-60', 'warn-30', 'warn-0');
    bar.classList.remove('warn-60', 'warn-30', 'warn-0');

    if (remaining === 0) {
      display.classList.add('warn-0');
      bar.classList.add('warn-0');
    } else if (remaining <= 30) {
      display.classList.add('warn-30');
      bar.classList.add('warn-30');
    } else if (remaining <= 60) {
      display.classList.add('warn-60');
      bar.classList.add('warn-60');
    }

    // Progress bar
    const pct = total > 0 ? (remaining / total) * 100 : 0;
    bar.style.width = `${pct}%`;
  }

  // ============================================================
  // 10. BLACK SCREEN / INTERMISSION
  // ============================================================

  function activateBlack() {
    state.blackActive = true;
    dom.blackOverlay.classList.add('active');
    if (Clips.isPlaying()) Clips.pause();
  }

  function deactivateBlack() {
    state.blackActive = false;
    dom.blackOverlay.classList.remove('active');
  }

  function activateIntermission() {
    state.intermActive = true;
    dom.intermOverlay.classList.add('active');
    if (Clips.isPlaying()) Clips.pause();
    updateIntermClock();
    state.intermClockHandle = setInterval(updateIntermClock, 1000);
  }

  function deactivateIntermission() {
    state.intermActive = false;
    dom.intermOverlay.classList.remove('active');
    clearInterval(state.intermClockHandle);
  }

  function updateIntermClock() {
    const now = new Date();
    dom.intermClock.textContent = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  // Dismiss either overlay on any key
  document.addEventListener('keydown', e => {
    if (state.blackActive || state.intermActive) {
      deactivateBlack();
      deactivateIntermission();
      return; // swallow event; don't trigger other shortcuts
    }
    handleShortcut(e);
  });

  dom.blackOverlay.addEventListener('click', deactivateBlack);
  dom.intermOverlay.addEventListener('click', deactivateIntermission);

  // ============================================================
  // 11. MODERATOR NOTES TOGGLE
  // ============================================================

  function toggleNotes() {
    state.notesVisible = !state.notesVisible;
    const panel = dom.notesPanel;
    if (state.notesVisible) panel.classList.remove('collapsed');
    else                    panel.classList.add('collapsed');
  }

  document.getElementById('notes-toggle-btn').addEventListener('click', toggleNotes);

  // ============================================================
  // 12. KEYBOARD SHORTCUTS
  // ============================================================

  function handleShortcut(e) {
    // Ignore when typing in an input/textarea
    if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName)) return;

    switch (e.key) {
      case ' ':
        e.preventDefault();
        if (Clips.isPlaying()) pauseClip();
        else                   playClip();
        break;
      case 'ArrowRight':
        e.preventDefault();
        nextSegment();
        break;
      case 'ArrowLeft':
        e.preventDefault();
        prevSegment();
        break;
      case 'q': case 'Q':
        toggleQuestion();
        break;
      case 'r': case 'R':
        replayClip();
        break;
      case 'n': case 'N':
        toggleNotes();
        break;
      case 'f': case 'F':
        requestFullscreen();
        break;
      case 'b': case 'B':
        activateBlack();
        break;
      case 'i': case 'I':
        activateIntermission();
        break;
    }
  }

  // ============================================================
  // 13. FULLSCREEN
  // ============================================================

  function requestFullscreen() {
    const el = document.querySelector('.video-wrapper');
    if (!el) return;
    if (el.requestFullscreen)       el.requestFullscreen();
    else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
    else if (el.mozRequestFullScreen)    el.mozRequestFullScreen();
  }

  // ============================================================
  // 14. PLAYBACK STATUS
  // ============================================================

  function setStatus(state, text) {
    dom.statusDot.className = `status-dot ${state}`;
    dom.statusText.textContent = text;
  }

  Clips.setOnStateChange((ytState, errMsg) => {
    if (ytState === 'error') {
      setStatus('error', errMsg || 'Playback error');
      showError(errMsg || 'YouTube playback error. Check the video ID in show.json.');
    } else if (ytState === YT.PlayerState.PLAYING) {
      setStatus('playing', 'Playing');
    } else if (ytState === YT.PlayerState.PAUSED) {
      setStatus('paused', 'Paused');
    } else if (ytState === YT.PlayerState.ENDED) {
      setStatus('ended', 'Ended');
    } else if (ytState === YT.PlayerState.BUFFERING) {
      setStatus('playing', 'Buffering…');
    }
  });

  // ============================================================
  // 15. WIRE CONTROL BUTTONS
  // ============================================================

  function wireBtn(id, fn) {
    const el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  wireBtn('btn-play',       playClip);
  wireBtn('btn-pause',      pauseClip);
  wireBtn('btn-replay',     replayClip);
  wireBtn('btn-prev',       prevSegment);
  wireBtn('btn-next',       nextSegment);
  wireBtn('btn-show-q',     toggleQuestion);
  wireBtn('btn-backup-q',   randomBackupQuestion);
  wireBtn('btn-toggle-n',   toggleNotes);
  wireBtn('btn-fullscreen', requestFullscreen);
  wireBtn('btn-black',      activateBlack);
  wireBtn('btn-interm',     activateIntermission);
  wireBtn('btn-timer-start',startTimer);
  wireBtn('btn-timer-pause',pauseTimer);
  wireBtn('btn-timer-reset',resetTimer);

  // ============================================================
  // 16. TOAST NOTIFICATIONS
  // ============================================================

  function toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    const el = document.createElement('div');
    el.className = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ============================================================
  // 17. ERROR DISPLAY
  // ============================================================

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
  // 19. BOOT
  // ============================================================

  buildQueue();
  loadSegment(0);

  // Show a boot toast once the YouTube API is ready
  const apiCheckInterval = setInterval(() => {
    if (Clips.isApiReady()) {
      clearInterval(apiCheckInterval);
      toast('Player ready. Press Play or Space to begin.', 'success');
    }
  }, 300);

})();
