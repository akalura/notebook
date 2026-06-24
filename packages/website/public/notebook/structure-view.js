/**
 * Structure View Module
 * Full-screen panel showing birds-eye tree view of notebook structure.
 * Shows folders and tabs only (no pages). All elements are clickable for navigation.
 */
window.StructureView = (function () {
  'use strict';

  var panelEl = null;
  var contentEl = null;
  var filterSelect = null;
  var searchInput = null;
  var getStateFn = null;
  var onNavigateFn = null;
  var isVisible = false;

  function init(stateFn, navigateFn) {
    getStateFn = stateFn;
    onNavigateFn = navigateFn;
    createPanel();
  }

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.id = 'structure-panel';
    panelEl.className = 'structure-panel hidden';

    panelEl.innerHTML =
      '<div class="structure-header">' +
        '<div class="structure-header-left">' +
          '<i data-lucide="network" class="icon-md"></i>' +
          '<h2>Notebook Structure</h2>' +
        '</div>' +
        '<div class="structure-header-right">' +
          '<input type="text" id="structure-search" placeholder="Filter..." class="structure-search">' +
          '<select id="structure-filter"></select>' +
          '<button id="structure-close-btn" class="btn-icon" title="Close">✕</button>' +
        '</div>' +
      '</div>' +
      '<div class="structure-content"></div>';

    document.getElementById('app').appendChild(panelEl);

    contentEl = panelEl.querySelector('.structure-content');
    filterSelect = panelEl.querySelector('#structure-filter');
    searchInput = panelEl.querySelector('#structure-search');

    panelEl.querySelector('#structure-close-btn').addEventListener('click', hide);

    filterSelect.addEventListener('change', function () {
      renderTree();
    });

    searchInput.addEventListener('input', function () {
      renderTree();
    });

    // ESC to close
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && isVisible) {
        hide();
      }
    });
  }

  function show() {
    panelEl.classList.remove('hidden');
    isVisible = true;
    populateFilter();
    renderTree();
    if (window.lucide) lucide.createIcons();
    searchInput.value = '';
    searchInput.focus();
  }

  function hide() {
    panelEl.classList.add('hidden');
    isVisible = false;
  }

  function toggle() {
    if (isVisible) hide();
    else show();
  }

  function populateFilter() {
    var info = getStateFn();
    if (!info || !info.state) return;

    filterSelect.innerHTML = '<option value="__all__">All Notebooks</option>';
    info.state.notebooks.forEach(function (nb) {
      var opt = document.createElement('option');
      opt.value = nb.id;
      opt.textContent = nb.name;
      if (nb.id === info.state.activeNotebookId) opt.selected = true;
      filterSelect.appendChild(opt);
    });
  }

  function renderTree() {
    var info = getStateFn();
    if (!info || !info.state) return;

    var selectedId = filterSelect.value;
    var searchTerm = (searchInput.value || '').toLowerCase().trim();
    var notebooks = info.state.notebooks;

    if (selectedId !== '__all__') {
      notebooks = notebooks.filter(function (nb) { return nb.id === selectedId; });
    }

    contentEl.innerHTML = '';

    notebooks.forEach(function (nb) {
      var section = renderNotebook(nb, searchTerm);
      if (section) contentEl.appendChild(section);
    });

    if (contentEl.children.length === 0) {
      contentEl.innerHTML = '<div class="structure-empty">No matching structure found.</div>';
    }

    if (window.lucide) lucide.createIcons();
  }

  function renderNotebook(nb, searchTerm) {
    var tabs = nb.tabs || [];

    // Count stats
    var folderCount = tabs.filter(function (t) { return t.isFolder; }).length;
    var tabCount = tabs.filter(function (t) { return !t.isFolder; }).length;
    var pageCount = 0;
    tabs.forEach(function (t) { if (!t.isFolder) pageCount += (t.pages || []).length; });

    // Check if anything matches search
    if (searchTerm && !matchesSearch(nb, tabs, searchTerm)) {
      return null;
    }

    var section = document.createElement('div');
    section.className = 'structure-notebook';

    // Notebook header
    var header = document.createElement('div');
    header.className = 'structure-notebook-header';
    header.innerHTML =
      '<span class="structure-notebook-name"><i data-lucide="book-open" class="icon-sm"></i> ' + escapeHtml(nb.name) + '</span>' +
      '<span class="structure-notebook-stats">' + folderCount + ' folder' + (folderCount !== 1 ? 's' : '') + ' · ' + tabCount + ' tab' + (tabCount !== 1 ? 's' : '') + ' · ' + pageCount + ' page' + (pageCount !== 1 ? 's' : '') + '</span>';
    header.addEventListener('click', function () {
      navigateTo(nb.id, null, null);
    });
    section.appendChild(header);

    // Tree content
    var treeEl = document.createElement('div');
    treeEl.className = 'structure-tree';
    renderLevel(nb, null, treeEl, '', true, searchTerm);
    section.appendChild(treeEl);

    return section;
  }

  function renderLevel(nb, parentId, container, prefix, isRoot, searchTerm) {
    var tabs = nb.tabs || [];
    var folders = tabs.filter(function (t) { return t.isFolder && t.parentTabId === parentId; });
    var regularTabs = tabs.filter(function (t) { return !t.isFolder && t.parentTabId === parentId; });

    // Filter by search
    if (searchTerm) {
      regularTabs = regularTabs.filter(function (t) { return t.name.toLowerCase().indexOf(searchTerm) !== -1; });
      folders = folders.filter(function (f) { return folderMatchesSearch(nb, f, searchTerm); });
    }

    // If only tabs (no folders at this level), render them as a single row
    if (folders.length === 0 && regularTabs.length > 0) {
      var connector = isRoot ? '' : '└── ';
      var row = document.createElement('div');
      row.className = 'structure-row';

      var prefixSpan = document.createElement('span');
      prefixSpan.className = 'structure-prefix';
      prefixSpan.textContent = prefix + connector;
      row.appendChild(prefixSpan);

      appendTabSpans(row, regularTabs, nb, parentId);
      container.appendChild(row);
      return;
    }

    // Tabs first (siblings to folders, listed before folders)
    if (regularTabs.length > 0) {
      var tabConnector = isRoot ? '' : '├── ';
      var tabRow = document.createElement('div');
      tabRow.className = 'structure-row';

      var tabPrefix = document.createElement('span');
      tabPrefix.className = 'structure-prefix';
      tabPrefix.textContent = prefix + tabConnector;
      tabRow.appendChild(tabPrefix);

      appendTabSpans(tabRow, regularTabs, nb, parentId);
      container.appendChild(tabRow);
    }

    // Then folders
    folders.forEach(function (folder, i) {
      var isLast = (i === folders.length - 1);
      var connector = isRoot ? '' : (isLast ? '└── ' : '├── ');
      var childPrefix = isRoot ? '' : (prefix + (isLast ? '    ' : '│   '));

      var row = document.createElement('div');
      row.className = 'structure-row';

      var prefixSpan = document.createElement('span');
      prefixSpan.className = 'structure-prefix';
      prefixSpan.textContent = prefix + connector;
      row.appendChild(prefixSpan);

      var folderSpan = document.createElement('span');
      folderSpan.className = 'structure-folder';
      if (folder.color) {
        folderSpan.style.borderLeft = '3px solid ' + folder.color;
        folderSpan.style.paddingLeft = '4px';
      }

      folderSpan.innerHTML = '<i data-lucide="folder" class="icon-xs"></i> ' + escapeHtml(folder.name);
      folderSpan.title = 'Navigate to folder: ' + folder.name;
      folderSpan.addEventListener('click', function (e) {
        e.stopPropagation();
        navigateTo(nb.id, folder.id, null);
      });
      row.appendChild(folderSpan);

      // Inline: show tabs that are direct children of this folder on the same line
      var childTabs = tabs.filter(function (t) { return !t.isFolder && t.parentTabId === folder.id; });
      if (searchTerm) {
        childTabs = childTabs.filter(function (t) { return t.name.toLowerCase().indexOf(searchTerm) !== -1; });
      }
      if (childTabs.length > 0) {
        var sep = document.createElement('span');
        sep.className = 'structure-inline-sep';
        sep.textContent = ' → ';
        row.appendChild(sep);
        appendTabSpans(row, childTabs, nb, folder.id);
      }

      container.appendChild(row);

      // Recurse into folder for sub-folders only (tabs already shown inline)
      var childFolders = tabs.filter(function (t) { return t.isFolder && t.parentTabId === folder.id; });
      if (searchTerm) {
        childFolders = childFolders.filter(function (f) { return folderMatchesSearch(nb, f, searchTerm); });
      }
      if (childFolders.length > 0) {
        // Pass only sub-folders context — tabs at this child level are already rendered inline
        renderLevelFoldersOnly(nb, folder.id, container, childPrefix, searchTerm);
      }
    });
  }

  // Renders only sub-folders at a given level (tabs are already shown inline on parent row)
  function renderLevelFoldersOnly(nb, parentId, container, prefix, searchTerm) {
    var tabs = nb.tabs || [];
    var folders = tabs.filter(function (t) { return t.isFolder && t.parentTabId === parentId; });

    if (searchTerm) {
      folders = folders.filter(function (f) { return folderMatchesSearch(nb, f, searchTerm); });
    }

    folders.forEach(function (folder, i) {
      var isLast = (i === folders.length - 1);
      var connector = isLast ? '└── ' : '├── ';
      var childPrefix = prefix + (isLast ? '    ' : '│   ');

      var row = document.createElement('div');
      row.className = 'structure-row';

      var prefixSpan = document.createElement('span');
      prefixSpan.className = 'structure-prefix';
      prefixSpan.textContent = prefix + connector;
      row.appendChild(prefixSpan);

      var folderSpan = document.createElement('span');
      folderSpan.className = 'structure-folder';
      if (folder.color) {
        folderSpan.style.borderLeft = '3px solid ' + folder.color;
        folderSpan.style.paddingLeft = '4px';
      }

      folderSpan.innerHTML = '<i data-lucide="folder" class="icon-xs"></i> ' + escapeHtml(folder.name);
      folderSpan.title = 'Navigate to folder: ' + folder.name;
      folderSpan.addEventListener('click', function (e) {
        e.stopPropagation();
        navigateTo(nb.id, folder.id, null);
      });
      row.appendChild(folderSpan);

      // Inline tabs for this folder
      var childTabs = tabs.filter(function (t) { return !t.isFolder && t.parentTabId === folder.id; });
      if (searchTerm) {
        childTabs = childTabs.filter(function (t) { return t.name.toLowerCase().indexOf(searchTerm) !== -1; });
      }
      if (childTabs.length > 0) {
        var sep = document.createElement('span');
        sep.className = 'structure-inline-sep';
        sep.textContent = ' → ';
        row.appendChild(sep);
        appendTabSpans(row, childTabs, nb, folder.id);
      }

      container.appendChild(row);

      // Recurse for sub-sub-folders
      var childFolders = tabs.filter(function (t) { return t.isFolder && t.parentTabId === folder.id; });
      if (searchTerm) {
        childFolders = childFolders.filter(function (f) { return folderMatchesSearch(nb, f, searchTerm); });
      }
      if (childFolders.length > 0) {
        renderLevelFoldersOnly(nb, folder.id, container, childPrefix, searchTerm);
      }
    });
  }

  function appendTabSpans(row, tabList, nb, parentId) {
    tabList.forEach(function (tab, i) {
      var tabSpan = document.createElement('span');
      tabSpan.className = 'structure-tab';
      var pageNum = (tab.pages || []).length;
      tabSpan.innerHTML = tab.name + ' <span class="structure-tab-count">(' + pageNum + ')</span>';
      if (tab.color) {
        tabSpan.style.borderLeft = '3px solid ' + tab.color;
        tabSpan.style.paddingLeft = '4px';
      }
      tabSpan.title = tab.name + ' (' + pageNum + ' page' + (pageNum !== 1 ? 's' : '') + ')';
      tabSpan.addEventListener('click', function (e) {
        e.stopPropagation();
        navigateTo(nb.id, parentId, tab.id);
      });
      row.appendChild(tabSpan);

      if (i < tabList.length - 1) {
        var comma = document.createElement('span');
        comma.className = 'structure-comma';
        comma.textContent = ', ';
        row.appendChild(comma);
      }
    });
  }

  function matchesSearch(nb, tabs, term) {
    if (nb.name.toLowerCase().indexOf(term) !== -1) return true;
    return tabs.some(function (t) { return t.name.toLowerCase().indexOf(term) !== -1; });
  }

  function folderMatchesSearch(nb, folder, term) {
    if (folder.name.toLowerCase().indexOf(term) !== -1) return true;
    var tabs = nb.tabs || [];
    // Check children
    var children = tabs.filter(function (t) { return t.parentTabId === folder.id; });
    return children.some(function (child) {
      if (child.name.toLowerCase().indexOf(term) !== -1) return true;
      if (child.isFolder) return folderMatchesSearch(nb, child, term);
      return false;
    });
  }

  function navigateTo(notebookId, folderId, tabId) {
    hide();
    if (onNavigateFn) {
      onNavigateFn({ notebookId: notebookId, folderId: folderId, tabId: tabId });
    }
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str || '';
    return div.innerHTML;
  }

  return {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle
  };
})();
