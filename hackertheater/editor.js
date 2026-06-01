/**
 * editor.js — Hacker Theater Show Editor
 *
 * Injects a full-featured in-browser editor for show.json data.
 * Depends on window.ShowController, which controller.js sets up
 * and signals via the 'showcontroller:ready' custom event.
 *
 * No backend. No eval. No external libraries. No network writes.
 */

// Assigned to window.Editor (not const) so that controller.js can access
// window.Editor.isOpen() from its keydown listener, which executes after
// this script runs. `const` at top level does NOT set window properties.
window.Editor = (() => {

  const LS_KEY = 'charlestonhacks.hackertheater.showDraft.v1';

  let editorShow   = null; // working copy; persists across open/close within a session
  let editingIndex = -1;   // index of segment in form; -1 = new segment
  let _isOpen      = false;

  // ============================================================
  // 1. DOM INJECTION
  // ============================================================

  function injectDOM() {
    // Draft banner — inserted between header and .app
    const banner = document.createElement('div');
    banner.id        = 'draft-banner';
    banner.className = 'draft-banner';
    banner.setAttribute('role', 'alert');
    banner.style.display = 'none';
    banner.innerHTML = `
      <div class="draft-banner__inner">
        <span class="draft-banner__icon">⚡</span>
        <span class="draft-banner__text">Local draft available from a previous session.</span>
        <div class="draft-banner__btns">
          <button id="draft-use"       class="draft-banner__btn draft-banner__btn--primary">Use Draft</button>
          <button id="draft-published" class="draft-banner__btn">Use Published</button>
          <button id="draft-clear"     class="draft-banner__btn draft-banner__btn--danger">Clear Draft</button>
        </div>
      </div>
    `;
    const app = document.querySelector('.app');
    if (app) document.body.insertBefore(banner, app);
    else     document.body.appendChild(banner);

    // Editor modal — full-page overlay
    const modal = document.createElement('div');
    modal.id        = 'editor-modal';
    modal.className = 'editor-modal';
    modal.setAttribute('role',       'dialog');
    modal.setAttribute('aria-modal', 'true');
    modal.setAttribute('aria-label', 'Show Editor');
    modal.innerHTML = _modalHTML();
    document.body.appendChild(modal);
  }

  function _modalHTML() {
    return `
    <div class="editor-modal__inner">

      <!-- Header -->
      <div class="editor-modal__header">
        <div class="editor-modal__header-left">
          <span class="editor-modal__title">Show Editor</span>
          <span id="ed-unsaved-dot" class="ed-unsaved-dot" style="display:none" title="Unsaved changes">●</span>
        </div>
        <div class="editor-modal__meta">
          <div class="ed-meta-field">
            <label class="ed-meta-label" for="ed-event-name">Event Name</label>
            <input id="ed-event-name" class="ed-meta-input" type="text" placeholder="Hacker Theater" />
          </div>
          <div class="ed-meta-field">
            <label class="ed-meta-label" for="ed-event-date">Date</label>
            <input id="ed-event-date" class="ed-meta-input" type="date" />
          </div>
        </div>
        <button id="ed-close-top" class="editor-modal__close" aria-label="Close editor">✕</button>
      </div>

      <!-- Body: segment list + form -->
      <div class="editor-modal__body">

        <!-- Left panel: segment list -->
        <div class="ed-list-panel">
          <div class="ed-list-header">
            <span class="ed-list-header__title">
              Segments <span id="ed-seg-count" class="ed-seg-count"></span>
            </span>
            <button id="ed-add-seg" class="btn btn--primary ed-add-btn">+ Add</button>
          </div>
          <div id="ed-seg-list" class="ed-seg-list">
            <div id="ed-list-empty" class="ed-list-empty" style="display:none">
              No segments yet.<br>Click <strong>+ Add</strong> to create one.
            </div>
          </div>
        </div>

        <!-- Right panel: edit form -->
        <div class="ed-form-panel">

          <div id="ed-form-empty" class="ed-form-empty">
            <div class="ed-form-empty__icon">✏</div>
            <p>Select a segment to edit, or click <strong>+ Add</strong> to create a new one.</p>
          </div>

          <div id="ed-form-content" class="ed-form-content" style="display:none">

            <div class="ed-form-heading">
              <span id="ed-form-heading-text">New Segment</span>
            </div>

            <div class="ed-form-body">

              <div class="ed-field">
                <label class="ed-label" for="ed-f-title">Title <span class="ed-required">*</span></label>
                <input id="ed-f-title" class="ed-input" type="text"
                       placeholder="AI Agents Are Eating Software" />
              </div>

              <div class="ed-field">
                <label class="ed-label" for="ed-f-yturl">
                  YouTube URL or Video ID <span class="ed-required">*</span>
                </label>
                <input id="ed-f-yturl" class="ed-input" type="text"
                       placeholder="https://youtube.com/watch?v=... or VIDEO_ID" />
                <div id="ed-f-ytid-hint" class="ed-field-hint"></div>
              </div>

              <div class="ed-field-row">
                <div class="ed-field">
                  <label class="ed-label" for="ed-f-start">
                    Start Time <span class="ed-required">*</span>
                  </label>
                  <input id="ed-f-start" class="ed-input" type="text" placeholder="1:30 or 90" />
                  <div class="ed-field-hint">seconds, mm:ss, or hh:mm:ss</div>
                </div>
                <div class="ed-field">
                  <label class="ed-label" for="ed-f-end">
                    End Time <span class="ed-required">*</span>
                  </label>
                  <input id="ed-f-end" class="ed-input" type="text" placeholder="3:20 or 200" />
                  <div class="ed-field-hint">seconds, mm:ss, or hh:mm:ss</div>
                </div>
                <div class="ed-field ed-field--narrow">
                  <label class="ed-label" for="ed-f-mins">
                    Disc. Min. <span class="ed-required">*</span>
                  </label>
                  <input id="ed-f-mins" class="ed-input" type="number"
                         min="1" max="60" placeholder="5" />
                </div>
              </div>

              <div class="ed-field">
                <label class="ed-label" for="ed-f-panelist">Panelist</label>
                <input id="ed-f-panelist" class="ed-input" type="text" placeholder="Jane Smith" />
              </div>

              <div class="ed-field">
                <label class="ed-label" for="ed-f-question">
                  Primary Question <span class="ed-required">*</span>
                </label>
                <textarea id="ed-f-question" class="ed-textarea" rows="2"
                          placeholder="What must happen before this becomes mainstream?"></textarea>
              </div>

              <div class="ed-field">
                <label class="ed-label" for="ed-f-backups">
                  Backup Questions
                  <span class="ed-label-hint">(one per line)</span>
                </label>
                <textarea id="ed-f-backups" class="ed-textarea" rows="3"
                          placeholder="What is overhyped here?&#10;What is underestimated?"></textarea>
              </div>

              <div class="ed-field">
                <label class="ed-label" for="ed-f-notes">Moderator Notes</label>
                <textarea id="ed-f-notes" class="ed-textarea" rows="3"
                          placeholder="Guide discussion toward…"></textarea>
              </div>

              <div id="ed-validation-errors" class="ed-validation-errors" style="display:none"></div>

            </div><!-- /ed-form-body -->

            <div class="ed-form-footer">
              <button id="ed-save-seg"    class="btn btn--primary">Save Segment</button>
              <button id="ed-preview-seg" class="btn btn--secondary">▶ Preview</button>
              <button id="ed-cancel-seg"  class="btn btn--ghost">Cancel</button>
              <button id="ed-delete-seg"  class="btn btn--danger ed-delete-btn">Delete</button>
            </div>

          </div><!-- /ed-form-content -->

        </div><!-- /ed-form-panel -->

      </div><!-- /editor-modal__body -->

      <!-- Footer: show-level actions -->
      <div class="editor-modal__footer">
        <button id="ed-apply-close"     class="btn btn--primary">✓ Apply &amp; Close</button>
        <button id="ed-save-draft"      class="btn btn--secondary">Save Draft</button>
        <button id="ed-export"          class="btn btn--secondary">↓ Export show.json</button>
        <label  id="ed-import-label"    class="btn btn--ghost ed-import-label"
                tabindex="0" role="button" aria-label="Import show.json">
          ↑ Import show.json
          <input id="ed-import-file" type="file" accept=".json"
                 style="display:none" aria-hidden="true" />
        </label>
        <button id="ed-reset-published" class="btn btn--warning">↺ Reset to Published</button>
        <button id="ed-close-bottom"    class="btn btn--ghost ed-close-btn">Close without Applying</button>
      </div>

    </div>
    `;
  }

  // ============================================================
  // 2. WIRE BUTTONS
  // ============================================================

  function wireButtons() {
    const $  = id => document.getElementById(id);
    const on = (id, fn) => { const el = $(id); if (el) el.addEventListener('click', fn); };

    // Modal open/close
    on('btn-edit-show',   openEditor);
    on('ed-close-top',    closeEditor);
    on('ed-close-bottom', closeEditor);

    // Click on backdrop closes modal
    $('editor-modal').addEventListener('click', e => {
      if (e.target === $('editor-modal')) closeEditor();
    });

    // Segment list
    on('ed-add-seg', () => openForm(-1));

    // Delegated clicks on segment list items
    $('ed-seg-list').addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;
      const i      = parseInt(btn.dataset.i, 10);
      if (action === 'edit')    openForm(i);
      if (action === 'up')      moveUp(i);
      if (action === 'down')    moveDown(i);
      if (action === 'preview') previewFromList(i);
      if (action === 'delete')  deleteSegment(i);
    });

    // Segment form
    on('ed-save-seg',    saveSegment);
    on('ed-cancel-seg',  cancelForm);
    on('ed-delete-seg',  () => deleteSegment(editingIndex));
    on('ed-preview-seg', previewFromForm);

    // Live YouTube URL parse hint
    $('ed-f-yturl').addEventListener('input', _updateYtHint);

    // Footer
    on('ed-apply-close',     applyAndClose);
    on('ed-save-draft',      saveDraft);
    on('ed-export',          exportShow);
    on('ed-reset-published', resetToPublished);

    // Import file
    $('ed-import-file').addEventListener('change', e => {
      const file = e.target.files[0];
      if (file) importShow(file);
      e.target.value = '';
    });
    $('ed-import-label').addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('ed-import-file').click(); }
    });

    // Draft banner
    on('draft-use',       useDraft);
    on('draft-published', hideDraftBanner);
    on('draft-clear',     () => { clearDraft(); hideDraftBanner(); _toast('Draft cleared.', 'info'); });
  }

  function _updateYtHint() {
    const raw  = document.getElementById('ed-f-yturl').value;
    const hint = document.getElementById('ed-f-ytid-hint');
    if (!raw.trim()) { hint.textContent = ''; return; }
    const id = parseYouTubeId(raw);
    if (id) {
      hint.textContent    = `ID: ${id}`;
      hint.style.color    = 'var(--green)';
    } else {
      hint.textContent    = 'Could not parse a YouTube video ID from this input.';
      hint.style.color    = 'var(--red)';
    }
  }

  // ============================================================
  // 3. OPEN / CLOSE
  // ============================================================

  function openEditor() {
    if (!window.ShowController) { _toast('Control room still loading, please wait.', 'info'); return; }
    // Clone from running show on first open within a session;
    // preserve in-progress edits if editor was already opened.
    if (editorShow === null) {
      editorShow = _deepClone(window.ShowController.getShow());
    }
    editingIndex = -1;
    _isOpen      = true;

    _populateMetaFields();
    _renderSegList();
    _showFormEmpty();
    document.getElementById('editor-modal').classList.add('active');
    document.getElementById('ed-event-name').focus();
  }

  function closeEditor() {
    _isOpen = false;
    document.getElementById('editor-modal').classList.remove('active');
  }

  // ============================================================
  // 4. META FIELDS
  // ============================================================

  function _populateMetaFields() {
    document.getElementById('ed-event-name').value = editorShow.eventName || '';
    document.getElementById('ed-event-date').value = editorShow.eventDate || '';
  }

  function _readMetaFields() {
    editorShow.eventName = document.getElementById('ed-event-name').value.trim() || 'Hacker Theater';
    editorShow.eventDate = document.getElementById('ed-event-date').value;
  }

  // ============================================================
  // 5. SEGMENT LIST RENDER
  // ============================================================

  function _renderSegList() {
    const list = document.getElementById('ed-seg-list');
    const segs  = editorShow.segments || [];
    const empty = document.getElementById('ed-list-empty');

    // Preserve scroll position
    const scrollTop = list.scrollTop;

    // Remove existing items (keep the empty-state div)
    Array.from(list.querySelectorAll('.ed-seg-item')).forEach(el => el.remove());

    document.getElementById('ed-seg-count').textContent = `(${segs.length})`;
    empty.style.display = segs.length === 0 ? '' : 'none';

    segs.forEach((seg, i) => {
      const clipSecs = (seg.end || 0) - (seg.start || 0);
      const isActive = i === editingIndex;
      const el       = document.createElement('div');
      el.className   = 'ed-seg-item' + (isActive ? ' ed-seg-item--active' : '');

      el.innerHTML = `
        <div class="ed-seg-item__reorder">
          <button class="ed-icon-btn" data-action="up"   data-i="${i}"
                  title="Move up"   ${i === 0              ? 'disabled' : ''}>↑</button>
          <button class="ed-icon-btn" data-action="down" data-i="${i}"
                  title="Move down" ${i === segs.length-1  ? 'disabled' : ''}>↓</button>
        </div>
        <div class="ed-seg-item__body" data-action="edit" data-i="${i}" role="button" tabindex="0"
             aria-label="Edit segment ${i+1}: ${_escHtml(seg.title || 'Untitled')}">
          <div class="ed-seg-item__num">SEG ${i + 1}</div>
          <div class="ed-seg-item__title">${_escHtml(seg.title || '(Untitled)')}</div>
          <div class="ed-seg-item__meta">
            ${seg.panelist ? _escHtml(seg.panelist) + ' · ' : ''}${_fmtSecs(clipSecs)} clip · ${seg.discussionMinutes || 5}min
          </div>
        </div>
        <div class="ed-seg-item__actions">
          <button class="ed-icon-btn ed-icon-btn--preview" data-action="preview" data-i="${i}"
                  title="Preview in player">▶</button>
          <button class="ed-icon-btn ed-icon-btn--delete"  data-action="delete"  data-i="${i}"
                  title="Delete segment">✕</button>
        </div>
      `;

      // Keyboard support for the body click target
      el.querySelector('.ed-seg-item__body').addEventListener('keydown', e => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openForm(i); }
      });

      list.appendChild(el);
    });

    list.scrollTop = scrollTop;
  }

  // ============================================================
  // 6. FORM OPEN / POPULATE / READ
  // ============================================================

  function openForm(index) {
    editingIndex = index;
    const isNew  = index === -1;

    document.getElementById('ed-form-empty').style.display   = 'none';
    document.getElementById('ed-form-content').style.display = '';
    document.getElementById('ed-form-heading-text').textContent =
      isNew ? 'New Segment' : `Edit Segment ${index + 1}`;
    document.getElementById('ed-delete-seg').style.display = isNew ? 'none' : '';

    _clearValidationErrors();
    isNew ? _clearForm() : _populateForm(editorShow.segments[index]);
    _renderSegList();
    document.getElementById('ed-f-title').focus();
  }

  function _showFormEmpty() {
    editingIndex = -1;
    document.getElementById('ed-form-empty').style.display   = '';
    document.getElementById('ed-form-content').style.display = 'none';
    _clearValidationErrors();
  }

  function _clearForm() {
    document.getElementById('ed-f-title').value    = '';
    document.getElementById('ed-f-yturl').value    = '';
    document.getElementById('ed-f-ytid-hint').textContent = '';
    document.getElementById('ed-f-start').value    = '';
    document.getElementById('ed-f-end').value      = '';
    document.getElementById('ed-f-panelist').value = '';
    document.getElementById('ed-f-question').value = '';
    document.getElementById('ed-f-backups').value  = '';
    document.getElementById('ed-f-notes').value    = '';
    document.getElementById('ed-f-mins').value     = '5';
  }

  function _populateForm(seg) {
    document.getElementById('ed-f-title').value    = seg.title    || '';
    document.getElementById('ed-f-yturl').value    = seg.youtubeId || '';
    const hint = document.getElementById('ed-f-ytid-hint');
    if (seg.youtubeId) {
      hint.textContent = `ID: ${seg.youtubeId}`;
      hint.style.color = 'var(--green)';
    } else {
      hint.textContent = '';
    }
    document.getElementById('ed-f-start').value    = _fmtSecs(seg.start != null ? seg.start : '');
    document.getElementById('ed-f-end').value      = _fmtSecs(seg.end   != null ? seg.end   : '');
    document.getElementById('ed-f-panelist').value = seg.panelist || '';
    document.getElementById('ed-f-question').value = seg.question || '';
    document.getElementById('ed-f-backups').value  = (seg.backupQuestions || []).join('\n');
    document.getElementById('ed-f-notes').value    = seg.moderatorNotes  || '';
    document.getElementById('ed-f-mins').value     =
      seg.discussionMinutes != null ? seg.discussionMinutes : 5;
  }

  function _readForm() {
    const ytRaw      = document.getElementById('ed-f-yturl').value.trim();
    const youtubeId  = parseYouTubeId(ytRaw);
    const start      = parseTime(document.getElementById('ed-f-start').value);
    const end        = parseTime(document.getElementById('ed-f-end').value);
    const minsRaw    = document.getElementById('ed-f-mins').value;
    const discussionMinutes = minsRaw !== '' ? parseFloat(minsRaw) : null;

    const backupQuestions = document.getElementById('ed-f-backups').value
      .split('\n').map(s => s.trim()).filter(Boolean);

    const seg = {
      title:            document.getElementById('ed-f-title').value.trim(),
      youtubeId:        youtubeId || '',
      start,
      end,
      panelist:         document.getElementById('ed-f-panelist').value.trim(),
      question:         document.getElementById('ed-f-question').value.trim(),
      backupQuestions,
      moderatorNotes:   document.getElementById('ed-f-notes').value.trim(),
      discussionMinutes,
    };

    return { seg, errors: _validateSegment(seg) };
  }

  // ============================================================
  // 7. SEGMENT SAVE / CANCEL / DELETE / REORDER
  // ============================================================

  function saveSegment() {
    _readMetaFields();
    const { seg, errors } = _readForm();

    if (errors.length > 0) {
      _showValidationErrors(errors);
      return;
    }
    _clearValidationErrors();

    const segs = editorShow.segments || (editorShow.segments = []);

    if (editingIndex === -1) {
      segs.push(seg);
      editingIndex = segs.length - 1;
    } else {
      segs[editingIndex] = seg;
    }

    _renderSegList();
    document.getElementById('ed-form-heading-text').textContent =
      `Edit Segment ${editingIndex + 1}`;
    document.getElementById('ed-delete-seg').style.display = '';
    _toast('Segment saved to editor.', 'success');
  }

  function cancelForm() {
    _showFormEmpty();
    _renderSegList();
  }

  function deleteSegment(index) {
    const segs  = editorShow.segments || [];
    if (index < 0 || index >= segs.length) return;
    const label = segs[index].title || 'this segment';
    if (!confirm(`Delete "${label}"?\n\nThis cannot be undone within the editor.`)) return;
    segs.splice(index, 1);
    _showFormEmpty();
    _renderSegList();
    _toast('Segment deleted.', 'info');
  }

  function moveUp(index) {
    const segs = editorShow.segments;
    if (index <= 0 || index >= segs.length) return;
    [segs[index - 1], segs[index]] = [segs[index], segs[index - 1]];
    if      (editingIndex === index)     editingIndex--;
    else if (editingIndex === index - 1) editingIndex++;
    _renderSegList();
  }

  function moveDown(index) {
    const segs = editorShow.segments;
    if (index < 0 || index >= segs.length - 1) return;
    [segs[index], segs[index + 1]] = [segs[index + 1], segs[index]];
    if      (editingIndex === index)     editingIndex++;
    else if (editingIndex === index + 1) editingIndex--;
    _renderSegList();
  }

  // ============================================================
  // 8. PREVIEW
  // ============================================================

  function previewFromList(index) {
    const seg = (editorShow.segments || [])[index];
    if (!seg) return;
    if (!seg.youtubeId) { _toast('This segment has no YouTube ID yet.', 'error'); return; }
    window.ShowController.previewSegment(seg);
    _toast(`Cueing preview: ${seg.title || 'segment'}`, 'info');
  }

  function previewFromForm() {
    const { seg } = _readForm();
    if (!seg.youtubeId) {
      _showValidationErrors(['A valid YouTube URL or ID is required to preview.']);
      return;
    }
    _clearValidationErrors();
    window.ShowController.previewSegment(seg);
    _toast(`Cueing preview: ${seg.title || 'segment'}`, 'info');
  }

  // ============================================================
  // 9. APPLY & CLOSE
  // ============================================================

  function applyAndClose() {
    _readMetaFields();
    const segs = editorShow.segments || [];

    if (segs.length === 0) {
      if (!confirm('The show has no segments. Apply this empty show?')) return;
    }

    window.ShowController.replaceShow(editorShow);
    editorShow = null; // reset so next open re-clones from the now-updated running show
    closeEditor();
    _toast('Show updated and applied.', 'success');
  }

  // ============================================================
  // 10. DRAFT — localStorage
  // ============================================================

  function saveDraft() {
    _readMetaFields();
    try {
      localStorage.setItem(LS_KEY, JSON.stringify(editorShow));
      _toast('Draft saved to browser storage.', 'success');
    } catch (e) {
      _toast('Could not save draft: storage may be full.', 'error');
    }
  }

  function clearDraft() {
    try { localStorage.removeItem(LS_KEY); } catch {}
  }

  function _loadDraft() {
    try {
      const raw = localStorage.getItem(LS_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function useDraft() {
    if (!window.ShowController) { _toast('Still loading, please try again.', 'info'); return; }
    const draft = _loadDraft();
    if (!draft) { _toast('No draft found in storage.', 'error'); hideDraftBanner(); return; }
    if (!draft.segments || !Array.isArray(draft.segments)) {
      _toast('Draft is invalid — no segments found.', 'error');
      hideDraftBanner();
      return;
    }
    window.ShowController.replaceShow(draft);
    hideDraftBanner();
    _toast(
      `Draft loaded: "${draft.eventName || 'Hacker Theater'}" · ${draft.segments.length} segment(s).`,
      'success'
    );
  }

  function checkDraft() {
    const draft = _loadDraft();
    if (draft) showDraftBanner();
  }

  function showDraftBanner() {
    const el = document.getElementById('draft-banner');
    if (el) el.style.display = '';
  }

  function hideDraftBanner() {
    const el = document.getElementById('draft-banner');
    if (el) el.style.display = 'none';
  }

  // ============================================================
  // 11. EXPORT — download show.json
  // ============================================================

  function exportShow() {
    _readMetaFields();
    const json = JSON.stringify(editorShow, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'show.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    _toast('Exported show.json.', 'success');
  }

  // ============================================================
  // 12. IMPORT — read local show.json file
  // ============================================================

  function importShow(file) {
    const reader = new FileReader();
    reader.onload = e => {
      let parsed;
      try {
        parsed = JSON.parse(e.target.result);
      } catch {
        _toast('Import failed: file is not valid JSON.', 'error');
        return;
      }
      if (!parsed || typeof parsed !== 'object') {
        _toast('Import failed: unexpected file format.', 'error');
        return;
      }
      if (!Array.isArray(parsed.segments)) {
        _toast('Import failed: missing "segments" array.', 'error');
        return;
      }
      editorShow = parsed;
      _populateMetaFields();
      _showFormEmpty();
      _renderSegList();
      _toast(
        `Imported "${parsed.eventName || 'show'}" · ${parsed.segments.length} segment(s).`,
        'success'
      );
    };
    reader.onerror = () => _toast('Import failed: could not read file.', 'error');
    reader.readAsText(file);
  }

  // ============================================================
  // 13. RESET TO PUBLISHED
  // ============================================================

  function resetToPublished() {
    if (!confirm(
      'Reset to the published show.json?\n\nAll unsaved editor changes will be discarded.'
    )) return;
    editorShow = _deepClone(window.ShowController.getPublishedShow());
    _populateMetaFields();
    _showFormEmpty();
    _renderSegList();
    _toast('Reset to published show.json.', 'info');
  }

  // ============================================================
  // 14. VALIDATION
  // ============================================================

  function _validateSegment(seg) {
    const errors = [];
    if (!seg.title)
      errors.push('Title is required.');
    if (!seg.youtubeId)
      errors.push('YouTube URL / ID is required and must be parseable.');
    if (seg.start === null || seg.start === undefined)
      errors.push('Start time is required.');
    if (seg.end === null || seg.end === undefined)
      errors.push('End time is required.');
    if (seg.start != null && seg.end != null && seg.end <= seg.start)
      errors.push('End time must be greater than start time.');
    if (!seg.question)
      errors.push('Primary question is required.');
    if (seg.discussionMinutes == null || isNaN(seg.discussionMinutes) || seg.discussionMinutes <= 0)
      errors.push('Discussion minutes must be a positive number.');
    return errors;
  }

  function _showValidationErrors(errors) {
    const el = document.getElementById('ed-validation-errors');
    el.style.display = '';
    el.innerHTML = errors.map(
      e => `<div class="ed-error-item">⚠ ${_escHtml(e)}</div>`
    ).join('');
  }

  function _clearValidationErrors() {
    const el = document.getElementById('ed-validation-errors');
    if (!el) return;
    el.style.display = 'none';
    el.innerHTML     = '';
  }

  // ============================================================
  // 15. PARSERS
  // ============================================================

  /**
   * Extract an 11-char YouTube video ID from a URL or plain ID.
   * Supports: watch?v=, youtu.be/, /embed/, /shorts/, and &t= params.
   */
  function parseYouTubeId(input) {
    if (!input) return null;
    input = input.trim();

    // Already a plain 11-char ID
    if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;

    try {
      const url = new URL(input);
      if (url.hostname.includes('youtube.com')) {
        // /watch?v=ID
        const v = url.searchParams.get('v');
        if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
        // /embed/ID or /shorts/ID
        const pathMatch = url.pathname.match(/\/(embed|shorts)\/([a-zA-Z0-9_-]{11})/);
        if (pathMatch) return pathMatch[2];
      }
      if (url.hostname === 'youtu.be') {
        const id = url.pathname.slice(1).split('?')[0].split('/')[0];
        if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
      }
    } catch {}

    // Regex fallback for malformed URLs
    const m = input.match(/(?:[?&]v=|\/embed\/|\/shorts\/|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  /**
   * Parse a time value to seconds.
   * Accepts: integer seconds ("95"), mm:ss ("1:35"), hh:mm:ss ("1:02:15").
   */
  function parseTime(val) {
    if (val === '' || val === null || val === undefined) return null;
    val = String(val).trim();
    if (/^\d+$/.test(val)) return parseInt(val, 10);
    if (/^\d+\.\d+$/.test(val)) return Math.round(parseFloat(val));
    const mmss = val.match(/^(\d{1,2}):(\d{2})$/);
    if (mmss) return parseInt(mmss[1], 10) * 60 + parseInt(mmss[2], 10);
    const hhmmss = val.match(/^(\d{1,2}):(\d{2}):(\d{2})$/);
    if (hhmmss)
      return parseInt(hhmmss[1], 10) * 3600
           + parseInt(hhmmss[2], 10) * 60
           + parseInt(hhmmss[3], 10);
    return null;
  }

  // ============================================================
  // 16. HELPERS
  // ============================================================

  function _fmtSecs(s) {
    if (s === '' || s === null || s === undefined) return '';
    s = Number(s);
    if (isNaN(s)) return '';
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
  }

  function _deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _toast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const el       = document.createElement('div');
    el.className   = `toast toast--${type}`;
    el.textContent = message;
    container.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  // ============================================================
  // 17. INIT
  // ============================================================

  function init() {
    injectDOM();
    wireButtons();
    checkDraft();
  }

  // Boot when controller.js signals it's ready
  document.addEventListener('showcontroller:ready', init);

  return {
    open:   openEditor,
    close:  closeEditor,
    isOpen: () => _isOpen,
  };

})();
