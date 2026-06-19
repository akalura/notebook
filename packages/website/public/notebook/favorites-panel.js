/**
 * Favorites Panel Module
 * Overlay panel showing all favorites across tabs in current scope.
 */
window.FavoritesPanel = (function () {
  'use strict';

  var panelEl = null;
  var listEl = null;
  var isOpen = false;
  var onNavigate = null;
  var getStateFn = null;

  function init(navigateCallback, stateFn) {
    onNavigate = navigateCallback;
    getStateFn = stateFn;
    createPanel();
  }

  function createPanel() {
    panelEl = document.createElement('div');
    panelEl.className = 'fav-panel hidden';
    panelEl.innerHTML =
      '<div class="fav-panel-header">' +
        '<span class="fav-panel-title">★ Favorites</span>' +
        '<button class="fav-panel-close" title="Close">✕</button>' +
      '</div>' +
      '<div class="fav-panel-list"></div>';
    document.getElementById('left-panel').appendChild(panelEl);
    listEl = panelEl.querySelector('.fav-panel-list');
    panelEl.querySelector('.fav-panel-close').addEventListener('click', hide);
  }

  function show() {
    panelEl.classList.remove('hidden');
    isOpen = true;
    refresh();
  }

  function hide() {
    panelEl.classList.add('hidden');
    isOpen = false;
  }

  function toggle() {
    if (isOpen) hide(); else show();
  }

  function isVisible() { return isOpen; }

  function refresh() {
    if (!listEl || !getStateFn) return;
    listEl.innerHTML = '';
    var info = getStateFn();
    if (!info || !info.notebook) {
      listEl.innerHTML = '<div class="fav-panel-empty">No notebook active.</div>';
      return;
    }

    var nb = info.notebook;
    var folderId = info.folderId; // null = root level scope
    var tabsInScope = collectTabsInScope(nb, folderId);
    var groups = [];

    tabsInScope.forEach(function (tab) {
      if (!tab.pages) return;
      var favs = tab.pages.filter(function (p) { return p.favorite; });
      if (favs.length > 0) {
        groups.push({ tab: tab, pages: favs });
      }
    });

    if (groups.length === 0) {
      listEl.innerHTML = '<div class="fav-panel-empty">No favorites found.</div>';
      return;
    }

    groups.forEach(function (group) {
      var headerEl = document.createElement('div');
      headerEl.className = 'fav-panel-group-header';
      headerEl.textContent = getTabPath(nb, group.tab);
      listEl.appendChild(headerEl);

      group.pages.forEach(function (page) {
        var item = document.createElement('div');
        item.className = 'fav-panel-item';
        item.innerHTML = '<span class="fav-panel-star">★</span> ' + escapeText(page.name);
        item.addEventListener('click', function () {
          if (onNavigate) {
            onNavigate({
              folderId: group.tab.parentTabId || null,
              tabId: group.tab.id,
              pageId: page.id
            });
          }
        });
        listEl.appendChild(item);
      });
    });
  }

  function collectTabsInScope(nb, folderId) {
    var results = [];
    nb.tabs.forEach(function (tab) {
      if (tab.isFolder) return;
      if (folderId === null) {
        // Root scope: include ALL tabs
        results.push(tab);
      } else {
        // Folder scope: include tabs in this folder or its children
        if (isTabUnderFolder(nb, tab, folderId)) {
          results.push(tab);
        }
      }
    });
    return results;
  }

  function isTabUnderFolder(nb, tab, folderId) {
    var current = tab.parentTabId;
    while (current) {
      if (current === folderId) return true;
      var parent = nb.tabs.find(function (t) { return t.id === current; });
      current = parent ? parent.parentTabId : null;
    }
    return tab.parentTabId === folderId;
  }

  function getTabPath(nb, tab) {
    var parts = [tab.name];
    var parentId = tab.parentTabId;
    while (parentId) {
      var folder = nb.tabs.find(function (t) { return t.id === parentId; });
      if (folder) { parts.unshift(folder.name); parentId = folder.parentTabId; }
      else break;
    }
    return parts.join(' › ');
  }

  function escapeText(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  return {
    init: init,
    show: show,
    hide: hide,
    toggle: toggle,
    isVisible: isVisible,
    refresh: refresh
  };
})();
