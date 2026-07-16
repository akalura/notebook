/**
 * Quick Notes Module
 * Side panel for instant, unstructured note capture.
 * No hierarchy, no naming — just type and save.
 */
window.QuickNotes = (function () {
  'use strict';

  var panelEl = null;
  var listEl = null;
  var inputEl = null;
  var getStateFn = null;
  var saveFn = null;
  var isVisible = false;

  function init(stateFn, saveCallback) {
    getStateFn = stateFn;
    saveFn = saveCallback;
    createPanel();
    attachKeyboardShortcut();
  }

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'quick-notes-panel';
    panelEl.className = 'quick-notes-panel hidden';

    panelEl.innerHTML =
      '<div class="quick-notes-header">' +
        '<span class="quick-notes-title"><i data-lucide="sticky-note" class="icon-sm"></i> Quick Notes</span>' +
        '<button class="btn-icon quick-notes-close" title="Close">✕</button>' +
      '</div>' +
      '<div class="quick-notes-input-area">' +
        '<textarea class="quick-notes-input" placeholder="Type a quick note... (Enter to save)"></textarea>' +
      '</div>' +
      '<div class="quick-notes-list"></div>';

    document.getElementById('main-layout').appendChild(panelEl);

    listEl = panelEl.querySelector('.quick-notes-list');
    inputEl = panelEl.querySelector('.quick-notes-input');

    panelEl.querySelector('.quick-notes-close').addEventListener('click', hide);

    // Save on Enter (Shift+Enter for newline)
    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        addNote();
      }
    });
  }

  function attachKeyboardShortcut() {
    document.addEventListener('keydown', function (e) {
      // Ctrl+Shift+N to toggle quick notes
      if (e.ctrlKey && e.shiftKey && e.key === 'N') {
        e.preventDefault();
        toggle();
      }
      // ESC to close if visible
      if (e.key === 'Escape' && isVisible) {
        hide();
      }
    });
  }

  function show() {
    panelEl.classList.remove('hidden');
    isVisible = true;
    renderList();
    if (window.lucide) lucide.createIcons();
    setTimeout(function () { inputEl.focus(); }, 50);
  }

  function hide() {
    panelEl.classList.add('hidden');
    isVisible = false;
  }

  function toggle() {
    if (isVisible) hide();
    else show();
  }

  function addNote() {
    var text = inputEl.value.trim();
    if (!text) return;

    var state = getStateFn();
    if (!state.quickNotes) state.quickNotes = [];

    state.quickNotes.unshift({
      id: 'qn-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
      content: text,
      createdAt: new Date().toISOString(),
      updatedAt: null,
      color: null,
      pinned: false
    });

    inputEl.value = '';
    saveFn();
    renderList();
  }

  function deleteNote(id) {
    var state = getStateFn();
    if (!state.quickNotes) return;
    state.quickNotes = state.quickNotes.filter(function (n) { return n.id !== id; });
    saveFn();
    renderList();
  }

  function updateNote(id, newContent) {
    var state = getStateFn();
    if (!state.quickNotes) return;
    var note = state.quickNotes.find(function (n) { return n.id === id; });
    if (note) {
      note.content = newContent;
      note.updatedAt = new Date().toISOString();
      saveFn();
    }
  }

  function togglePin(id) {
    var state = getStateFn();
    if (!state.quickNotes) return;
    var note = state.quickNotes.find(function (n) { return n.id === id; });
    if (note) {
      note.pinned = !note.pinned;
      saveFn();
      renderList();
    }
  }

  function renderList() {
    var state = getStateFn();
    var notes = (state.quickNotes || []).slice();

    // Pinned first, then by date
    notes.sort(function (a, b) {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    listEl.innerHTML = '';

    if (notes.length === 0) {
      listEl.innerHTML = '<div class="quick-notes-empty">No notes yet. Type above and press Enter.</div>';
      return;
    }

    notes.forEach(function (note) {
      var card = document.createElement('div');
      card.className = 'quick-note-card' + (note.pinned ? ' pinned' : '');
      if (note.color) card.style.borderLeftColor = note.color;

      var content = document.createElement('div');
      content.className = 'quick-note-content';
      content.textContent = note.content;
      content.setAttribute('contenteditable', 'true');
      content.setAttribute('spellcheck', 'false');

      content.addEventListener('blur', function () {
        var newText = content.textContent.trim();
        if (newText && newText !== note.content) {
          updateNote(note.id, newText);
        } else if (!newText) {
          deleteNote(note.id);
        }
      });

      content.addEventListener('keydown', function (e) {
        if (e.key === 'Escape') {
          content.blur();
        }
      });

      var meta = document.createElement('div');
      meta.className = 'quick-note-meta';

      var timeStr = formatTime(note.createdAt);
      meta.innerHTML = '<span class="quick-note-time">' + timeStr + '</span>';

      var actions = document.createElement('div');
      actions.className = 'quick-note-actions';

      var pinBtn = document.createElement('button');
      pinBtn.className = 'quick-note-action-btn' + (note.pinned ? ' active' : '');
      pinBtn.title = note.pinned ? 'Unpin' : 'Pin to top';
      pinBtn.textContent = '📌';
      pinBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        togglePin(note.id);
      });
      actions.appendChild(pinBtn);

      var deleteBtn = document.createElement('button');
      deleteBtn.className = 'quick-note-action-btn delete';
      deleteBtn.title = 'Delete';
      deleteBtn.textContent = '✕';
      deleteBtn.addEventListener('click', function (e) {
        e.stopPropagation();
        deleteNote(note.id);
      });
      actions.appendChild(deleteBtn);

      meta.appendChild(actions);
      card.appendChild(content);
      card.appendChild(meta);
      listEl.appendChild(card);
    });
  }

  function formatTime(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    var now = new Date();
    var diffMs = now - d;
    var diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return diffMins + 'm ago';
    if (diffMins < 1440) return Math.floor(diffMins / 60) + 'h ago';

    // Show date
    var isToday = d.toDateString() === now.toDateString();
    if (isToday) {
      return 'Today ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    var yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    if (d.toDateString() === yesterday.toDateString()) {
      return 'Yesterday ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getCount() {
    var state = getStateFn();
    return (state.quickNotes || []).length;
  }

  return {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    getCount: getCount
  };
})();
