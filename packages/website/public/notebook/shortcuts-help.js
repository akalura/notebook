/**
 * Shortcuts Help Module
 * F1 opens a modal listing all keyboard shortcuts available in the app.
 * Markdown editor shortcuts are sourced live from MarkdownToolbar.ACTIONS so
 * the list never drifts from the real bindings.
 */
window.ShortcutsHelp = (function () {
  'use strict';

  var overlayEl = null;
  var bodyEl = null;
  var isOpen = false;

  // Static (non-markdown) shortcut groups. Markdown group is built dynamically.
  var STATIC_GROUPS = [
    {
      title: 'General',
      items: [
        { keys: ['F1'], desc: 'Show this shortcuts help' },
        { keys: ['Ctrl', 'K'], desc: 'Open search' },
        { keys: ['Ctrl', 'Shift', 'N'], desc: 'Toggle Quick Notes' },
        { keys: ['Esc'], desc: 'Close the open panel, dialog, or help' }
      ]
    },
    {
      title: 'Images',
      items: [
        { keys: ['Shift', 'Paste'], desc: 'Paste image at original (uncompressed) resolution' }
      ]
    },
    {
      title: 'Search panel',
      items: [
        { keys: ['\u2191'], desc: 'Previous result' },
        { keys: ['\u2193'], desc: 'Next result' },
        { keys: ['Enter'], desc: 'Open selected result' },
        { keys: ['Esc'], desc: 'Close search' }
      ]
    },
    {
      title: 'Renaming (tabs, folders, pages)',
      items: [
        { keys: ['Enter'], desc: 'Confirm the new name' },
        { keys: ['Esc'], desc: 'Cancel and keep the original name' }
      ]
    }
  ];

  function init() {
    if (overlayEl) return;
    createDom();
  }

  function createDom() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'shortcuts-overlay hidden';
    overlayEl.innerHTML =
      '<div class="shortcuts-modal" role="dialog" aria-modal="true" aria-label="Keyboard shortcuts">' +
        '<div class="shortcuts-header">' +
          '<span class="shortcuts-title"><i data-lucide="keyboard" class="icon-sm"></i> Keyboard Shortcuts</span>' +
          '<button class="shortcuts-close" title="Close (Esc)">\u2715</button>' +
        '</div>' +
        '<div class="shortcuts-body"></div>' +
        '<div class="shortcuts-footer">Press <span class="kbd">F1</span> or <span class="kbd">Esc</span> to close</div>' +
      '</div>';

    document.getElementById('app').appendChild(overlayEl);
    bodyEl = overlayEl.querySelector('.shortcuts-body');

    overlayEl.querySelector('.shortcuts-close').addEventListener('click', hide);
    overlayEl.addEventListener('mousedown', function (e) {
      if (e.target === overlayEl) hide();
    });
  }

  // Build the Markdown editor group from the live toolbar action definitions.
  function buildMarkdownGroup() {
    var actions = (window.MarkdownToolbar && window.MarkdownToolbar.ACTIONS) || [];
    var items = [];
    actions.forEach(function (a) {
      if (a.separator || !a.shortcut) return;
      items.push({ keys: a.shortcut.split('+'), desc: a.label });
    });
    if (items.length === 0) return null;
    return { title: 'Markdown editor (while editing)', items: items };
  }

  function render() {
    bodyEl.innerHTML = '';

    var groups = STATIC_GROUPS.slice();
    var md = buildMarkdownGroup();
    if (md) {
      // Place Markdown group right after General for prominence
      groups.splice(1, 0, md);
    }

    groups.forEach(function (group) {
      var section = document.createElement('div');
      section.className = 'shortcuts-section';

      var heading = document.createElement('div');
      heading.className = 'shortcuts-section-title';
      heading.textContent = group.title;
      section.appendChild(heading);

      group.items.forEach(function (item) {
        var row = document.createElement('div');
        row.className = 'shortcuts-row';

        var keysEl = document.createElement('div');
        keysEl.className = 'shortcuts-keys';
        item.keys.forEach(function (k, i) {
          if (i > 0) {
            var plus = document.createElement('span');
            plus.className = 'shortcuts-plus';
            plus.textContent = '+';
            keysEl.appendChild(plus);
          }
          var kbd = document.createElement('span');
          kbd.className = 'kbd';
          kbd.textContent = k;
          keysEl.appendChild(kbd);
        });
        row.appendChild(keysEl);

        var descEl = document.createElement('div');
        descEl.className = 'shortcuts-desc';
        descEl.textContent = item.desc;
        row.appendChild(descEl);

        section.appendChild(row);
      });

      bodyEl.appendChild(section);
    });

    if (window.lucide) lucide.createIcons({ nodes: [overlayEl] });
  }

  function show() {
    if (!overlayEl) init();
    render();
    overlayEl.classList.remove('hidden');
    isOpen = true;
    if (window.lucide) lucide.createIcons({ nodes: [overlayEl] });
  }

  function hide() {
    if (!overlayEl) return;
    overlayEl.classList.add('hidden');
    isOpen = false;
  }

  function toggle() {
    if (isOpen) hide();
    else show();
  }

  function isVisible() { return isOpen; }

  return {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    isVisible: isVisible
  };
})();
