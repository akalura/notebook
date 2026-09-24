/**
 * Move Picker Module
 * Modal dialog for choosing a destination folder when moving a tab or folder.
 * - Searchable folder tree of the current notebook
 * - The item being moved (and, for folders, its whole subtree) is disabled
 * - A "Root (top level)" option for un-nesting
 * - Confirm step shows a breadcrumb preview: "Moving X → A › B › C"
 *
 * Usage:
 *   MovePicker.init();
 *   MovePicker.open({
 *     notebook: <notebook object>,      // { id, name, tabs: [...] }
 *     tab: <tab/folder being moved>,    // must be one of notebook.tabs
 *     isDescendantFolder: fn(nb, candidateId, folderId) -> bool,
 *     onConfirm: fn(targetFolderId|null) // called when user confirms
 *   });
 */
window.MovePicker = (function () {
  'use strict';

  var overlayEl = null;
  var treeEl = null;
  var shortcutsEl = null;
  var searchInput = null;
  var previewEl = null;
  var confirmBtn = null;

  var ctx = null;              // current open() options
  var selectedTargetId;        // undefined = nothing selected; null = root; string = folder id

  function init() {
    if (overlayEl) return;
    createDom();
  }

  function createDom() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'move-picker-overlay hidden';
    overlayEl.innerHTML =
      '<div class="move-picker-modal" role="dialog" aria-modal="true">' +
        '<div class="move-picker-header">' +
          '<span class="move-picker-title"><i data-lucide="folder-input" class="icon-sm"></i> Move to folder</span>' +
          '<button class="move-picker-close" title="Close (Esc)">\u2715</button>' +
        '</div>' +
        '<div class="move-picker-subtitle"></div>' +
        '<input type="text" class="move-picker-search" placeholder="Filter folders\u2026">' +
        '<div class="move-picker-shortcuts"></div>' +
        '<div class="move-picker-tree"></div>' +
        '<div class="move-picker-footer">' +
          '<div class="move-picker-preview"></div>' +
          '<div class="move-picker-actions">' +
            '<button class="move-picker-cancel">Cancel</button>' +
            '<button class="move-picker-confirm" disabled>Move here</button>' +
          '</div>' +
        '</div>' +
      '</div>';

    document.getElementById('app').appendChild(overlayEl);

    treeEl = overlayEl.querySelector('.move-picker-tree');
    shortcutsEl = overlayEl.querySelector('.move-picker-shortcuts');
    searchInput = overlayEl.querySelector('.move-picker-search');
    previewEl = overlayEl.querySelector('.move-picker-preview');
    confirmBtn = overlayEl.querySelector('.move-picker-confirm');

    overlayEl.querySelector('.move-picker-close').addEventListener('click', close);
    overlayEl.querySelector('.move-picker-cancel').addEventListener('click', close);

    // Click on the dimmed backdrop (outside the modal) closes
    overlayEl.addEventListener('mousedown', function (e) {
      if (e.target === overlayEl) close();
    });

    searchInput.addEventListener('input', function () {
      renderShortcuts();
      renderTree();
    });

    confirmBtn.addEventListener('click', function () {
      if (selectedTargetId === undefined) return;
      var target = selectedTargetId;
      var onConfirm = ctx && ctx.onConfirm;
      close();
      if (onConfirm) onConfirm(target);
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && overlayEl && !overlayEl.classList.contains('hidden')) {
        close();
      }
    });
  }

  function open(options) {
    if (!overlayEl) init();
    ctx = options || {};
    selectedTargetId = undefined;

    var subtitle = overlayEl.querySelector('.move-picker-subtitle');
    var kind = ctx.tab && ctx.tab.isFolder ? 'folder' : 'tab';
    subtitle.textContent = 'Moving ' + kind + ' \u201C' + (ctx.tab ? ctx.tab.name : '') + '\u201D';

    searchInput.value = '';
    updatePreview();
    confirmBtn.disabled = true;
    renderShortcuts();
    renderTree();

    overlayEl.classList.remove('hidden');
    if (window.lucide) lucide.createIcons({ nodes: [overlayEl] });
    searchInput.focus();
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.classList.add('hidden');
    ctx = null;
    selectedTargetId = undefined;
  }

  function isVisible() {
    return overlayEl && !overlayEl.classList.contains('hidden');
  }

  // Is this folder a valid destination for the moving tab?
  function isDisabledTarget(nb, folderId) {
    var moving = ctx.tab;
    if (folderId === moving.id) return true;                 // itself
    if (folderId === moving.parentTabId) return true;        // already lives here
    if (moving.isFolder && ctx.isDescendantFolder &&
        ctx.isDescendantFolder(nb, folderId, moving.id)) {
      return true;                                           // own descendant (cycle)
    }
    return false;
  }

  function renderShortcuts() {
    if (!ctx || !ctx.notebook || !shortcutsEl) return;
    shortcutsEl.innerHTML = '';

    // Hide shortcuts while the user is actively filtering — the tree covers that case.
    var term = (searchInput.value || '').trim();
    if (term) { shortcutsEl.style.display = 'none'; return; }

    var nb = ctx.notebook;
    var pinned = (ctx.pinnedTargetIds || []).filter(function (id) {
      return isValidShortcut(nb, id);
    });
    var pinnedSet = {};
    pinned.forEach(function (id) { pinnedSet[id] = true; });

    var recent = (ctx.recentTargetIds || []).filter(function (id) {
      return isValidShortcut(nb, id) && !pinnedSet[id];
    });

    if (pinned.length === 0 && recent.length === 0) {
      shortcutsEl.style.display = 'none';
      return;
    }
    shortcutsEl.style.display = '';

    if (pinned.length > 0) {
      shortcutsEl.appendChild(buildShortcutSection(nb, 'Pinned', pinned, true));
    }
    if (recent.length > 0) {
      shortcutsEl.appendChild(buildShortcutSection(nb, 'Recent', recent, false));
    }

    if (window.lucide) lucide.createIcons({ nodes: [shortcutsEl] });
  }

  // A shortcut is valid only if it points at an existing folder that is a
  // legal destination for the current move (not itself/parent/own descendant).
  function isValidShortcut(nb, folderId) {
    var f = nb.tabs.find(function (t) { return t.id === folderId && t.isFolder; });
    if (!f) return false;
    return !isDisabledTarget(nb, folderId);
  }

  function buildShortcutSection(nb, title, ids, pinnable) {
    var section = document.createElement('div');
    section.className = 'move-picker-shortcut-section';

    var heading = document.createElement('div');
    heading.className = 'move-picker-shortcut-heading';
    heading.textContent = title;
    section.appendChild(heading);

    var chipRow = document.createElement('div');
    chipRow.className = 'move-picker-chip-row';
    section.appendChild(chipRow);

    ids.forEach(function (id) {
      var chip = document.createElement('div');
      chip.className = 'move-picker-chip';

      var icon = pinnable ? 'pin' : 'clock';
      var fullPath = folderPathLabel(nb, id);
      var folder = nb.tabs.find(function (t) { return t.id === id; });
      var leafName = folder ? folder.name : fullPath;
      chip.title = fullPath;
      chip.innerHTML =
        '<i data-lucide="' + icon + '" class="icon-xs"></i>' +
        '<span class="move-picker-chip-label">' + escapeText(leafName) + '</span>';

      chip.addEventListener('click', function () {
        selectShortcut(chip, id);
      });

      if (pinnable && ctx.onUnpin) {
        var unpin = document.createElement('button');
        unpin.className = 'move-picker-chip-unpin';
        unpin.title = 'Unpin';
        unpin.textContent = '\u2715';
        unpin.addEventListener('click', function (e) {
          e.stopPropagation();
          ctx.onUnpin(id);
          // Reflect removal locally so the UI updates without reopening
          ctx.pinnedTargetIds = (ctx.pinnedTargetIds || []).filter(function (x) { return x !== id; });
          renderShortcuts();
        });
        chip.appendChild(unpin);
      }

      chipRow.appendChild(chip);
    });

    return section;
  }

  function selectShortcut(chip, targetId) {
    selectedTargetId = targetId;
    // Clear any selection in the tree and other chips
    var prevTree = treeEl.querySelector('.move-picker-row.selected');
    if (prevTree) prevTree.classList.remove('selected');
    var prevChip = shortcutsEl.querySelector('.move-picker-chip.selected');
    if (prevChip) prevChip.classList.remove('selected');
    chip.classList.add('selected');
    confirmBtn.disabled = false;
    updatePreview();
  }

  function renderTree() {
    if (!ctx || !ctx.notebook) return;
    var nb = ctx.notebook;
    var term = (searchInput.value || '').toLowerCase().trim();

    treeEl.innerHTML = '';

    // Root option
    var rootDisabled = (ctx.tab.parentTabId === null);
    var rootRow = buildRow({
      label: 'Root (top level)',
      icon: 'home',
      depth: 0,
      targetId: null,
      disabled: rootDisabled,
      disabledReason: rootDisabled ? 'Already at root' : ''
    });
    // Only show root when it isn't filtered out by search
    if (!term || 'root (top level)'.indexOf(term) !== -1) {
      treeEl.appendChild(rootRow);
    }

    // Folder tree
    renderFolderLevel(nb, null, 1, term);

    if (treeEl.children.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'move-picker-empty';
      empty.textContent = 'No matching folders.';
      treeEl.appendChild(empty);
    }
  }

  // Renders folders whose parent is parentId. Returns count of rows added
  // (including descendants) so callers can prune empty branches under search.
  function renderFolderLevel(nb, parentId, depth, term) {
    var folders = nb.tabs.filter(function (t) {
      return t.isFolder && t.parentTabId === parentId;
    });

    var added = 0;
    folders.forEach(function (folder) {
      var selfMatches = !term || folder.name.toLowerCase().indexOf(term) !== -1;
      // Peek ahead: does any descendant match? Render into a fragment first.
      var childFrag = document.createElement('div');
      var childCount = renderFolderLevelInto(nb, folder.id, depth + 1, term, childFrag);

      if (!selfMatches && childCount === 0) return; // prune

      var disabled = isDisabledTarget(nb, folder.id);
      var reason = '';
      if (disabled) {
        if (folder.id === ctx.tab.id) reason = "Can't move into itself";
        else if (folder.id === ctx.tab.parentTabId) reason = 'Current location';
        else reason = "Can't move into its own subfolder";
      }

      var row = buildRow({
        label: folder.name,
        icon: 'folder',
        depth: depth,
        targetId: folder.id,
        disabled: disabled,
        disabledReason: reason,
        color: folder.color
      });
      treeEl.appendChild(row);
      added++;

      // Move the pre-rendered children (already appended into fragment div) into the tree
      while (childFrag.firstChild) {
        treeEl.appendChild(childFrag.firstChild);
        added++;
      }
    });

    return added;
  }

  // Same as renderFolderLevel but appends into a provided container and returns count.
  function renderFolderLevelInto(nb, parentId, depth, term, container) {
    var folders = nb.tabs.filter(function (t) {
      return t.isFolder && t.parentTabId === parentId;
    });

    var added = 0;
    folders.forEach(function (folder) {
      var selfMatches = !term || folder.name.toLowerCase().indexOf(term) !== -1;
      var childFrag = document.createElement('div');
      var childCount = renderFolderLevelInto(nb, folder.id, depth + 1, term, childFrag);

      if (!selfMatches && childCount === 0) return;

      var disabled = isDisabledTarget(nb, folder.id);
      var reason = '';
      if (disabled) {
        if (folder.id === ctx.tab.id) reason = "Can't move into itself";
        else if (folder.id === ctx.tab.parentTabId) reason = 'Current location';
        else reason = "Can't move into its own subfolder";
      }

      var row = buildRow({
        label: folder.name,
        icon: 'folder',
        depth: depth,
        targetId: folder.id,
        disabled: disabled,
        disabledReason: reason,
        color: folder.color
      });
      container.appendChild(row);
      added++;

      while (childFrag.firstChild) {
        container.appendChild(childFrag.firstChild);
        added++;
      }
    });

    return added;
  }

  function buildRow(opts) {
    var row = document.createElement('div');
    row.className = 'move-picker-row' + (opts.disabled ? ' disabled' : '');
    row.style.paddingLeft = (10 + opts.depth * 18) + 'px';
    if (opts.color && !opts.disabled) {
      row.style.borderLeft = '3px solid ' + opts.color;
    }

    var iconHtml = '<i data-lucide="' + opts.icon + '" class="icon-sm"></i>';
    var reasonHtml = opts.disabledReason
      ? '<span class="move-picker-reason">' + escapeText(opts.disabledReason) + '</span>'
      : '';
    row.innerHTML = iconHtml + '<span class="move-picker-label">' + escapeText(opts.label) + '</span>' + reasonHtml;

    if (!opts.disabled) {
      row.addEventListener('click', function () {
        selectRow(row, opts.targetId);
      });
    }

    return row;
  }

  function selectRow(row, targetId) {
    selectedTargetId = targetId;
    var prev = treeEl.querySelector('.move-picker-row.selected');
    if (prev) prev.classList.remove('selected');
    if (shortcutsEl) {
      var prevChip = shortcutsEl.querySelector('.move-picker-chip.selected');
      if (prevChip) prevChip.classList.remove('selected');
    }
    row.classList.add('selected');
    confirmBtn.disabled = false;
    updatePreview();
  }

  function updatePreview() {
    if (!ctx || selectedTargetId === undefined) {
      previewEl.innerHTML = '<span class="move-picker-hint">Select a destination folder.</span>';
      return;
    }
    var nb = ctx.notebook;
    var dest = selectedTargetId === null ? 'Root' : folderPathLabel(nb, selectedTargetId);
    previewEl.innerHTML =
      '<span class="move-picker-src">' + escapeText(ctx.tab.name) + '</span>' +
      ' <span class="move-picker-arrow">\u2192</span> ' +
      '<span class="move-picker-dest">' + escapeText(dest) + '</span>';
  }

  function folderPathLabel(nb, folderId) {
    var parts = [];
    var currentId = folderId;
    while (currentId) {
      var f = nb.tabs.find(function (t) { return t.id === currentId; });
      if (!f) break;
      parts.unshift(f.name);
      currentId = f.parentTabId;
    }
    return parts.join(' \u203A ');
  }

  function escapeText(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : str;
    return div.innerHTML;
  }

  return {
    init: init,
    open: open,
    close: close,
    isVisible: isVisible
  };
})();
