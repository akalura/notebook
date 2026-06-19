/**
 * Markdown Toolbar Module
 * Provides formatting buttons and keyboard shortcuts for markdown editing.
 * Easily extensible — add new actions to the ACTIONS array.
 */
window.MarkdownToolbar = (function () {
  'use strict';

  // ===== Action Definitions =====
  // Each action: { id, label, icon, shortcut, prefix, suffix, block }
  // - prefix/suffix: wrap selected text
  // - block: true means insert on new line
  var ACTIONS = [
    { id: 'bold', label: 'Bold', icon: 'B', shortcut: 'Ctrl+B', prefix: '**', suffix: '**' },
    { id: 'italic', label: 'Italic', icon: 'I', shortcut: 'Ctrl+I', prefix: '_', suffix: '_' },
    { id: 'strikethrough', label: 'Strikethrough', icon: 'S', shortcut: 'Ctrl+Shift+S', prefix: '~~', suffix: '~~' },
    { id: 'sep1', separator: true },
    { id: 'h1', label: 'Heading 1', icon: 'H1', shortcut: null, prefix: '# ', suffix: '', block: true },
    { id: 'h2', label: 'Heading 2', icon: 'H2', shortcut: null, prefix: '## ', suffix: '', block: true },
    { id: 'h3', label: 'Heading 3', icon: 'H3', shortcut: null, prefix: '### ', suffix: '', block: true },
    { id: 'sep2', separator: true },
    { id: 'link', label: 'Link', icon: '🔗', shortcut: 'Ctrl+K', prefix: '[', suffix: '](url)' },
    { id: 'code', label: 'Inline Code', icon: '`', shortcut: 'Ctrl+`', prefix: '`', suffix: '`' },
    { id: 'codeblock', label: 'Code Block', icon: '```', shortcut: null, prefix: '```\n', suffix: '\n```', block: true },
    { id: 'sep3', separator: true },
    { id: 'ul', label: 'Bullet List', icon: '•', shortcut: null, prefix: '- ', suffix: '', block: true },
    { id: 'ol', label: 'Numbered List', icon: '1.', shortcut: null, prefix: '1. ', suffix: '', block: true },
    { id: 'quote', label: 'Quote', icon: '❝', shortcut: null, prefix: '> ', suffix: '', block: true },
    { id: 'hr', label: 'Horizontal Rule', icon: '—', shortcut: null, prefix: '\n---\n', suffix: '', block: true },
    { id: 'sep4', separator: true },
    { id: 'checkbox', label: 'Checkbox', icon: '☐', shortcut: null, prefix: '- [ ] ', suffix: '', block: true },
    { id: 'sep5', separator: true },
    { id: 'datetime', label: 'Date/Time', icon: '📅', shortcut: null, prefix: '', suffix: '', dynamic: true },
    { id: 'sep6', separator: true },
    { id: 'pagelink', label: 'Page Link', icon: '📄', shortcut: null, prefix: '', suffix: '', dynamic: true }
  ];

  var toolbarEl = null;
  var textareaEl = null;
  var onChangeCallback = null;

  function init(textarea, container, onChange) {
    textareaEl = textarea;
    onChangeCallback = onChange;
    toolbarEl = document.createElement('div');
    toolbarEl.className = 'md-toolbar';
    toolbarEl.id = 'md-toolbar';
    renderToolbar();
    // Insert before the editor container
    var editorCont = document.getElementById('editor-container');
    container.insertBefore(toolbarEl, editorCont);
    attachKeyboardShortcuts();
  }

  function renderToolbar() {
    toolbarEl.innerHTML = '';
    ACTIONS.forEach(function (action) {
      if (action.separator) {
        var sep = document.createElement('span');
        sep.className = 'md-toolbar-sep';
        toolbarEl.appendChild(sep);
        return;
      }
      var btn = document.createElement('button');
      btn.className = 'md-toolbar-btn';
      btn.textContent = action.icon;
      btn.title = action.label + (action.shortcut ? ' (' + action.shortcut + ')' : '');
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        applyAction(action);
      });
      toolbarEl.appendChild(btn);
    });
  }

  function applyAction(action) {
    if (!textareaEl) return;
    textareaEl.focus();
    var start = textareaEl.selectionStart;
    var end = textareaEl.selectionEnd;
    var text = textareaEl.value;

    // Handle dynamic actions
    if (action.dynamic && action.id === 'datetime') {
      var now = new Date();
      var month = String(now.getMonth() + 1).padStart(2, '0');
      var day = String(now.getDate()).padStart(2, '0');
      var year = String(now.getFullYear()).slice(-2);
      var hours = now.getHours();
      var ampm = hours >= 12 ? 'PM' : 'AM';
      hours = hours % 12 || 12;
      var minutes = String(now.getMinutes()).padStart(2, '0');
      var dateStr = " [ " + month + '/' + day + '/' + year + '-' + hours + ':' + minutes + ' ' + ampm + " ] ";

      var before = text.substring(0, start);
      var after = text.substring(end);
      textareaEl.value = before + dateStr + after;
      textareaEl.selectionStart = textareaEl.selectionEnd = start + dateStr.length;
      if (onChangeCallback) onChangeCallback();
      return;
    }

    if (action.dynamic && action.id === 'pagelink') {
      window.PageLinks.showPagePicker(textareaEl, onChangeCallback);
      return;
    }

    var selected = text.substring(start, end) || action.label;

    var before = text.substring(0, start);
    var after = text.substring(end);

    // For block-level items, ensure we start on a new line
    if (action.block && start > 0 && before[before.length - 1] !== '\n') {
      before += '\n';
    }

    var inserted = action.prefix + selected + action.suffix;
    textareaEl.value = before + inserted + after;

    // Position cursor: select the inserted text (excluding prefix/suffix)
    var newStart = before.length + action.prefix.length;
    var newEnd = newStart + selected.length;
    textareaEl.selectionStart = newStart;
    textareaEl.selectionEnd = newEnd;

    if (onChangeCallback) onChangeCallback();
  }

  function attachKeyboardShortcuts() {
    textareaEl.addEventListener('keydown', function (e) {
      var shortcut = '';
      if (e.ctrlKey || e.metaKey) shortcut += 'Ctrl+';
      if (e.shiftKey) shortcut += 'Shift+';
      shortcut += e.key.length === 1 ? e.key.toUpperCase() : e.key;

      // Normalize backtick
      if (shortcut === 'Ctrl+`') shortcut = 'Ctrl+`';

      for (var i = 0; i < ACTIONS.length; i++) {
        if (ACTIONS[i].shortcut && ACTIONS[i].shortcut.toUpperCase() === shortcut.toUpperCase()) {
          e.preventDefault();
          applyAction(ACTIONS[i]);
          return;
        }
      }
    });
  }

  function show() {
    if (toolbarEl) toolbarEl.classList.remove('hidden');
  }

  function hide() {
    if (toolbarEl) toolbarEl.classList.add('hidden');
  }

  return {
    init: init,
    show: show,
    hide: hide,
    ACTIONS: ACTIONS
  };
})();
