/**
 * Page Links Module
 * Handles internal page linking with nb:// protocol.
 * - Click interception on nb:// links in preview
 * - Page picker modal for creating links
 * - Navigation to linked pages
 */
window.PageLinks = (function () {
  'use strict';

  var onNavigate = null;
  var getStateFn = null;

  function init(navigateCallback, stateFn) {
    onNavigate = navigateCallback;
    getStateFn = stateFn;
    attachClickHandler();
  }

  function attachClickHandler() {
    // Intercept clicks on nb:// links in preview
    document.addEventListener('click', function (e) {
      var link = e.target.closest('a[href^="nb://"]');
      if (!link) return;
      e.preventDefault();
      var pageId = link.getAttribute('href').replace('nb://', '');
      navigateToPage(pageId);
    });
  }

  function navigateToPage(pageId) {
    var info = getStateFn();
    if (!info) return;
    var state = info.state;
    if (!state || !state.notebooks) return;

    // Find the page across all notebooks
    for (var i = 0; i < state.notebooks.length; i++) {
      var nb = state.notebooks[i];
      if (!nb.tabs) continue;
      for (var j = 0; j < nb.tabs.length; j++) {
        var tab = nb.tabs[j];
        if (tab.isFolder || !tab.pages) continue;
        var page = tab.pages.find(function (p) { return p.id === pageId; });
        if (page) {
          if (onNavigate) {
            onNavigate({
              notebookId: nb.id,
              folderId: tab.parentTabId || null,
              tabId: tab.id,
              pageId: page.id
            });
          }
          return;
        }
      }
    }
    alert('Linked page not found. It may have been deleted.');
  }

  /**
   * Show page picker modal and insert link at cursor in textarea.
   */
  function showPagePicker(textarea, onChange) {
    var info = getStateFn();
    if (!info || !info.state) return;
    var state = info.state;

    var overlay = document.createElement('div');
    overlay.className = 'move-modal-overlay';

    var modal = document.createElement('div');
    modal.className = 'manage-labels-modal';
    modal.style.width = '380px';
    modal.style.maxHeight = '500px';

    var header = document.createElement('div');
    header.className = 'move-modal-header';
    header.innerHTML = '<span>Link to Page</span>';
    var closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', function () { overlay.remove(); });
    header.appendChild(closeBtn);
    modal.appendChild(header);

    // Search input
    var searchWrap = document.createElement('div');
    searchWrap.style.padding = '10px';
    var searchInput = document.createElement('input');
    searchInput.type = 'text';
    searchInput.placeholder = 'Search pages...';
    searchInput.className = 'search-input';
    searchInput.style.cssText = 'width:100%;padding:8px 10px;background:var(--bg-overlay);border:1px solid var(--border);border-radius:6px;color:var(--text-primary);font-size:13px;outline:none';
    searchWrap.appendChild(searchInput);
    modal.appendChild(searchWrap);

    var listEl = document.createElement('div');
    listEl.className = 'manage-labels-list';
    listEl.style.maxHeight = '350px';
    modal.appendChild(listEl);

    function renderPageList(query) {
      listEl.innerHTML = '';
      var q = (query || '').toLowerCase();
      state.notebooks.forEach(function (nb) {
        if (!nb.tabs) return;
        nb.tabs.forEach(function (tab) {
          if (tab.isFolder || !tab.pages) return;
          tab.pages.forEach(function (page) {
            if (q && page.name.toLowerCase().indexOf(q) === -1) return;
            var item = document.createElement('div');
            item.className = 'move-modal-item';
            item.style.cursor = 'pointer';
            var path = nb.name + ' › ' + tab.name;
            item.innerHTML = '<div style="font-size:11px;color:var(--text-muted)">' + escapeText(path) + '</div><div>' + escapeText(page.name) + '</div>';
            item.addEventListener('click', function () {
              insertPageLink(textarea, page.id, page.name, onChange);
              overlay.remove();
            });
            listEl.appendChild(item);
          });
        });
      });
      if (listEl.children.length === 0) {
        listEl.innerHTML = '<div style="padding:16px;text-align:center;color:var(--text-muted);font-size:13px">No pages found.</div>';
      }
    }

    searchInput.addEventListener('input', function () {
      renderPageList(searchInput.value);
    });

    renderPageList('');
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', function (e) { if (e.target === overlay) overlay.remove(); });
    setTimeout(function () { searchInput.focus(); }, 50);
  }

  function insertPageLink(textarea, pageId, pageName, onChange) {
    var link = '[' + pageName + '](nb://' + pageId + ')';
    var start = textarea.selectionStart;
    var end = textarea.selectionEnd;
    var text = textarea.value;
    textarea.value = text.substring(0, start) + link + text.substring(end);
    textarea.selectionStart = textarea.selectionEnd = start + link.length;
    textarea.focus();
    if (onChange) onChange();
  }

  function escapeText(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    showPagePicker: showPagePicker,
    navigateToPage: navigateToPage
  };
})();
