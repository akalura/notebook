/**
 * Search Module
 * Provides cross-notebook search with spotlight-style UI and filters.
 */
window.NotebookSearch = (function () {
  'use strict';

  var overlayEl = null;
  var inputEl = null;
  var resultsEl = null;
  var filtersEl = null;
  var debounceTimer = null;
  var selectedIndex = -1;
  var currentResults = [];
  var onNavigate = null;
  var activeFilter = 'all';
  var selectedLabelId = null;
  var labelDropdownEl = null;

  function init(navigateCallback) {
    onNavigate = navigateCallback;
    createUI();
    attachShortcut();
  }

  function createUI() {
    overlayEl = document.createElement('div');
    overlayEl.className = 'search-overlay hidden';
    overlayEl.innerHTML =
      '<div class="search-modal">' +
        '<div class="search-input-wrap">' +
          '<i data-lucide="search" class="icon-sm search-icon"></i>' +
          '<input type="text" id="search-input" class="search-input" placeholder="Search pages..." autocomplete="off">' +
          '<span class="search-shortcut">ESC</span>' +
        '</div>' +
        '<div class="search-filters" id="search-filters"></div>' +
        '<div id="search-results" class="search-results"></div>' +
      '</div>';
    document.body.appendChild(overlayEl);

    inputEl = document.getElementById('search-input');
    resultsEl = document.getElementById('search-results');
    filtersEl = document.getElementById('search-filters');

    renderFilters();

    inputEl.addEventListener('input', function () {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(function () { performSearch(inputEl.value); }, 150);
    });

    inputEl.addEventListener('keydown', function (e) {
      if (e.key === 'ArrowDown') { e.preventDefault(); selectResult(selectedIndex + 1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); selectResult(selectedIndex - 1); }
      else if (e.key === 'Enter') { e.preventDefault(); if (selectedIndex >= 0 && currentResults[selectedIndex]) navigateToResult(currentResults[selectedIndex]); }
      else if (e.key === 'Escape') { hide(); }
    });

    overlayEl.addEventListener('click', function (e) {
      if (e.target === overlayEl) hide();
    });
  }

  function renderFilters() {
    var filters = [
      { id: 'all', label: 'All' },
      { id: 'title', label: 'Title' },
      { id: 'content', label: 'Content' },
      { id: 'label', label: 'Label ▾' },
      { id: 'regex', label: 'Regex' },
      { id: 'recent', label: 'Recent' }
    ];
    filtersEl.innerHTML = '';
    filters.forEach(function (f) {
      var btn = document.createElement('button');
      btn.className = 'search-filter' + (f.id === activeFilter ? ' active' : '');
      btn.textContent = f.label;
      btn.dataset.filter = f.id;
      btn.addEventListener('click', function (e) {
        e.stopPropagation();
        if (f.id === 'label') {
          showLabelFilterDropdown(btn);
          return;
        }
        closeLabelFilterDropdown();
        activeFilter = f.id;
        selectedLabelId = null;
        renderFilters();
        if (f.id === 'recent') {
          performSearch('');
        } else {
          performSearch(inputEl.value);
        }
        inputEl.focus();
      });
      filtersEl.appendChild(btn);
    });

    // Show selected label chip if active
    if (activeFilter === 'label' && selectedLabelId) {
      var chip = document.createElement('span');
      chip.className = 'search-label-chip';
      var state = window.NoteStorage.loadState();
      var lblName = findLabelName(state, selectedLabelId);
      chip.textContent = '🏷 ' + (lblName || selectedLabelId);
      chip.addEventListener('click', function () {
        selectedLabelId = null;
        activeFilter = 'all';
        renderFilters();
        performSearch(inputEl.value);
      });
      filtersEl.appendChild(chip);
    }
  }

  function findLabelName(state, labelId) {
    if (!state) return null;
    // Check global labels
    if (state.globalLabels) {
      var gl = state.globalLabels.find(function (l) { return l.id === labelId; });
      if (gl) return gl.name;
    }
    // Check notebook labels
    if (state.notebooks) {
      for (var i = 0; i < state.notebooks.length; i++) {
        var nb = state.notebooks[i];
        if (nb.labels) {
          var nl = nb.labels.find(function (l) { return l.id === labelId; });
          if (nl) return nl.name;
        }
      }
    }
    return null;
  }

  function showLabelFilterDropdown(triggerBtn) {
    closeLabelFilterDropdown();
    var state = window.NoteStorage.loadState();
    if (!state) return;

    var allLabels = [];
    var seen = {};
    if (state.globalLabels) {
      state.globalLabels.forEach(function (l) { if (!seen[l.id]) { seen[l.id] = true; allLabels.push(l); } });
    }
    if (state.notebooks) {
      state.notebooks.forEach(function (nb) {
        if (nb.labels) nb.labels.forEach(function (l) { if (!seen[l.id]) { seen[l.id] = true; allLabels.push(l); } });
      });
    }

    if (allLabels.length === 0) { alert('No labels available.'); return; }

    labelDropdownEl = document.createElement('div');
    labelDropdownEl.className = 'search-label-dropdown';
    allLabels.forEach(function (lbl) {
      var item = document.createElement('div');
      item.className = 'search-label-dropdown-item';
      item.innerHTML = '<span style="width:8px;height:8px;border-radius:50%;background:' + lbl.color + ';display:inline-block"></span> ' + lbl.name;
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        activeFilter = 'label';
        selectedLabelId = lbl.id;
        closeLabelFilterDropdown();
        renderFilters();
        performSearch(inputEl.value);
        inputEl.focus();
      });
      labelDropdownEl.appendChild(item);
    });

    var rect = triggerBtn.getBoundingClientRect();
    var modalRect = overlayEl.querySelector('.search-modal').getBoundingClientRect();
    labelDropdownEl.style.top = (rect.bottom - modalRect.top + 4) + 'px';
    labelDropdownEl.style.left = (rect.left - modalRect.left) + 'px';
    overlayEl.querySelector('.search-modal').appendChild(labelDropdownEl);
  }

  function closeLabelFilterDropdown() {
    if (labelDropdownEl) { labelDropdownEl.remove(); labelDropdownEl = null; }
  }

  function attachShortcut() {
    document.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
        e.preventDefault();
        show();
      }
    });
  }

  function show() {
    overlayEl.classList.remove('hidden');
    inputEl.value = '';
    activeFilter = 'all';
    selectedLabelId = null;
    renderFilters();
    resultsEl.innerHTML = '<div class="search-empty">Start typing to search...</div>';
    selectedIndex = -1;
    currentResults = [];
    inputEl.focus();
    if (window.lucide) lucide.createIcons();
  }

  function hide() {
    overlayEl.classList.add('hidden');
    closeLabelFilterDropdown();
    inputEl.value = '';
    resultsEl.innerHTML = '';
  }

  function performSearch(query) {
    closeLabelFilterDropdown();
    query = (query || '').trim();
    var state = window.NoteStorage.loadState();
    if (!state || !state.notebooks) {
      resultsEl.innerHTML = '<div class="search-empty">No data available.</div>';
      return;
    }

    currentResults = [];

    // Recent filter — no query needed
    if (activeFilter === 'recent') {
      state.notebooks.forEach(function (nb) {
        if (!nb.tabs) return;
        nb.tabs.forEach(function (tab) {
          if (tab.isFolder || !tab.pages) return;
          tab.pages.forEach(function (page) {
            var date = page.updatedAt || page.createdAt;
            if (date) {
              currentResults.push({
                notebookId: nb.id, notebookName: nb.name,
                tabId: tab.id, tabName: tab.name,
                pageId: page.id, pageName: page.name,
                matchType: 'recent', snippet: 'Modified: ' + date.substring(0, 10),
                folderId: tab.parentTabId || null, sortDate: date
              });
            }
          });
        });
      });
      currentResults.sort(function (a, b) { return b.sortDate.localeCompare(a.sortDate); });
      currentResults = currentResults.slice(0, 20);
      renderResults(query);
      return;
    }

    // For other filters, need at least 2 chars (except label with no text)
    if (activeFilter !== 'label' && query.length < 2) {
      resultsEl.innerHTML = '<div class="search-empty">Type at least 2 characters...</div>';
      currentResults = [];
      selectedIndex = -1;
      return;
    }
    if (activeFilter === 'label' && !selectedLabelId) {
      resultsEl.innerHTML = '<div class="search-empty">Select a label from the filter.</div>';
      return;
    }

    var queryLower = query.toLowerCase();
    var regex = null;
    if (activeFilter === 'regex' && query) {
      try { regex = new RegExp(query, 'gi'); }
      catch (e) { resultsEl.innerHTML = '<div class="search-empty">Invalid regex pattern.</div>'; return; }
    }

    state.notebooks.forEach(function (nb) {
      if (!nb.tabs) return;
      nb.tabs.forEach(function (tab) {
        if (tab.isFolder || !tab.pages) return;
        tab.pages.forEach(function (page) {
          // Label filter
          if (activeFilter === 'label' && selectedLabelId) {
            if (!page.labelIds || page.labelIds.indexOf(selectedLabelId) === -1) return;
            // If no query text, include all pages with this label
            if (!query) {
              currentResults.push({
                notebookId: nb.id, notebookName: nb.name,
                tabId: tab.id, tabName: tab.name,
                pageId: page.id, pageName: page.name,
                matchType: 'label', snippet: '',
                folderId: tab.parentTabId || null
              });
              return;
            }
          }

          var titleMatch = false;
          var contentMatch = false;
          var snippet = '';

          if (activeFilter === 'regex') {
            regex.lastIndex = 0;
            titleMatch = page.name && regex.test(page.name);
            regex.lastIndex = 0;
            contentMatch = page.content && regex.test(page.content);
          } else {
            if (activeFilter === 'all' || activeFilter === 'title' || activeFilter === 'label') {
              titleMatch = page.name && page.name.toLowerCase().indexOf(queryLower) !== -1;
            }
            if (activeFilter === 'all' || activeFilter === 'content' || activeFilter === 'label') {
              contentMatch = page.content && page.content.toLowerCase().indexOf(queryLower) !== -1;
            }
          }

          if (titleMatch || contentMatch) {
            if (contentMatch && page.content) {
              var idx = page.content.toLowerCase().indexOf(queryLower);
              if (idx === -1 && regex) { regex.lastIndex = 0; var m = regex.exec(page.content); if (m) idx = m.index; }
              if (idx !== -1) {
                var start = Math.max(0, idx - 40);
                var end = Math.min(page.content.length, idx + (query.length || 10) + 40);
                snippet = (start > 0 ? '...' : '') + page.content.substring(start, end) + (end < page.content.length ? '...' : '');
              }
            }
            currentResults.push({
              notebookId: nb.id, notebookName: nb.name,
              tabId: tab.id, tabName: tab.name,
              pageId: page.id, pageName: page.name,
              matchType: titleMatch ? 'title' : 'content', snippet: snippet,
              folderId: tab.parentTabId || null
            });
          }
        });
      });
    });

    renderResults(query);
  }

  function renderResults(query) {
    resultsEl.innerHTML = '';
    selectedIndex = -1;

    if (currentResults.length === 0) {
      resultsEl.innerHTML = '<div class="search-empty">No results found.</div>';
      return;
    }

    var countEl = document.createElement('div');
    countEl.className = 'search-count';
    countEl.textContent = currentResults.length + ' result' + (currentResults.length > 1 ? 's' : '') + ' found';
    resultsEl.appendChild(countEl);

    currentResults.forEach(function (result, idx) {
      var item = document.createElement('div');
      item.className = 'search-result-item';
      item.dataset.index = idx;

      var path = result.notebookName + ' › ' + result.tabName;
      var highlightedName = query ? highlightMatch(result.pageName, query) : escapeForHtml(result.pageName);
      var snippetHtml = result.snippet ? '<div class="search-snippet">' + (query ? highlightMatch(escapeForHtml(result.snippet), query) : escapeForHtml(result.snippet)) + '</div>' : '';

      item.innerHTML =
        '<div class="search-result-path">' + escapeForHtml(path) + '</div>' +
        '<div class="search-result-name">' + highlightedName + '</div>' +
        snippetHtml;

      item.addEventListener('click', function () { navigateToResult(result); });
      resultsEl.appendChild(item);
    });
  }

  function highlightMatch(text, query) {
    if (!query) return escapeForHtml(text);
    var escaped = escapeForHtml(text);
    try {
      var regex = new RegExp('(' + escapeRegex(query) + ')', 'gi');
      return escaped.replace(regex, '<mark class="search-highlight">$1</mark>');
    } catch (e) { return escaped; }
  }

  function escapeForHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  function selectResult(index) {
    if (currentResults.length === 0) return;
    if (index < 0) index = currentResults.length - 1;
    if (index >= currentResults.length) index = 0;
    selectedIndex = index;
    resultsEl.querySelectorAll('.search-result-item').forEach(function (el, i) {
      el.classList.toggle('selected', i === index);
    });
    var selected = resultsEl.querySelector('.search-result-item.selected');
    if (selected) selected.scrollIntoView({ block: 'nearest' });
  }

  function navigateToResult(result) {
    hide();
    if (onNavigate) onNavigate(result);
  }

  return {
    init: init,
    show: show,
    hide: hide
  };
})();
