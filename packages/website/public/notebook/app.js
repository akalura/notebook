(function () {
  'use strict';

  // ===== Import from modules =====
  const { openImageDb, storeImage, getImage, deleteImage, getAllImages, clearAllImages, compressImage } = window.NoteStorage;
  const { generateId, escapeHtml, getContrastColor, formatDate, formatBytes, downloadBlob, autoLinkify, migrateNotebooks } = window.NoteUtils;

  function lightenColor(hex, percent) {
    var c = hex.replace('#', '');
    var r = Math.min(255, parseInt(c.substring(0, 2), 16) + Math.round(255 * percent / 100));
    var g = Math.min(255, parseInt(c.substring(2, 4), 16) + Math.round(255 * percent / 100));
    var b = Math.min(255, parseInt(c.substring(4, 6), 16) + Math.round(255 * percent / 100));
    return '#' + r.toString(16).padStart(2, '0') + g.toString(16).padStart(2, '0') + b.toString(16).padStart(2, '0');
  }

  // ===== Storage =====
  const STORAGE_KEY = 'notebook_state';

  // Track object URLs for cleanup
  let activeObjectUrls = [];

  function loadState() {
    const loaded = window.NoteStorage.loadState();
    return loaded || getDefaultState();
  }

  function saveState() {
    window.NoteStorage.saveState(state);
  }

  let saveTimeout = null;
  function debouncedSave() {
    if (saveTimeout) clearTimeout(saveTimeout);
    saveTimeout = setTimeout(saveState, 500);
  }

  function getDefaultState() {
    return {
      activeNotebookId: 'notebook-1',
      notebooks: [
        {
          id: 'notebook-1',
          name: 'My Notebook',
          activeTabId: 'tab-1',
          activePageId: 'page-1',
          activeFolderId: null,
          collapsedPages: {},
          activePagePerTab: {},
          tabs: [
            {
              id: 'tab-1',
              name: 'Getting Started',
              isFolder: false,
              parentTabId: null,
              color: null,
              pages: [
                {
                  id: 'page-1',
                  name: 'Welcome',
                  contentType: 'markdown',
                  content: '# Welcome to Note Viewer\n\nThis is a **multi-format** note viewer and editor.\n\n## Supported Formats\n- Markdown\n- JSON\n- YAML\n- Plain Text\n\n## Tips\n1. Use the **top tabs** to organize tabs\n2. Use the **left panel** to manage pages\n3. Switch between **Edit** and **Preview** modes\n\nEnjoy taking notes!',
                  parentPageId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: null
                },
                {
                  id: 'page-2',
                  name: 'Sample JSON',
                  contentType: 'json',
                  content: '{\n  "name": "Note Viewer",\n  "version": "1.0.0",\n  "features": [\n    "Markdown rendering",\n    "JSON tree view",\n    "YAML highlighting",\n    "Auto-save"\n  ],\n  "settings": {\n    "theme": "dark",\n    "autoSave": true\n  }\n}',
                  parentPageId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: null
                }
              ]
            },
            {
              id: 'tab-2',
              name: 'Examples',
              isFolder: false,
              parentTabId: null,
              color: null,
              pages: [
                {
                  id: 'page-3',
                  name: 'K8s Config',
                  contentType: 'yaml',
                  content: 'apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: nginx-deployment\n  labels:\n    app: nginx\nspec:\n  replicas: 3\n  selector:\n    matchLabels:\n      app: nginx\n  template:\n    metadata:\n      labels:\n        app: nginx\n    spec:\n      containers:\n      - name: nginx\n        image: nginx:1.25\n        ports:\n        - containerPort: 80',
                  parentPageId: null,
                  createdAt: new Date().toISOString(),
                  updatedAt: null
                }
              ]
            }
          ]
        }
      ]
    };
  }

  // ===== State =====
  let state = loadState();

  // Migrate old state: if no notebooks array, wrap existing data into a notebook
  if (!state.notebooks) {
    const oldState = state;
    state = {
      activeNotebookId: 'notebook-1',
      notebooks: [
        {
          id: 'notebook-1',
          name: 'My Notebook',
          activeTabId: oldState.activeTabId || null,
          activePageId: oldState.activePageId || null,
          activeFolderId: oldState.activeFolderId || null,
          collapsedPages: oldState.collapsedPages || {},
          activePagePerTab: oldState.activePagePerTab || {},
          tabs: oldState.tabs || []
        }
      ]
    };
    saveState();
  }

  // Ensure activeNotebookId exists
  if (!state.activeNotebookId && state.notebooks.length > 0) {
    state.activeNotebookId = state.notebooks[0].id;
  }

  // Migrate notebooks: ensure all fields
  migrateNotebooks(state.notebooks);

  // Helper to get active notebook
  function getActiveNotebook() {
    return state.notebooks.find(nb => nb.id === state.activeNotebookId) || state.notebooks[0] || null;
  }

  let currentMode = 'edit'; // 'edit' or 'preview'
  let pageCounter = 0;
  let navHistory = []; // Stack of {folderId, tabId, pageId} for back navigation
  let copiedColor = null; // For copy/paste color between tabs/folders

  function pushNavHistory(nb) {
    navHistory.push({ folderId: nb.activeFolderId, tabId: nb.activeTabId, pageId: nb.activePageId });
    // Limit history size
    if (navHistory.length > 50) navHistory.shift();
  }

  // Count existing pages to set the counter across all notebooks
  state.notebooks.forEach(nb => {
    nb.tabs.forEach(g => {
      g.pages.forEach(l => {
        if (l.createdAt === undefined) l.createdAt = null;
        if (l.updatedAt === undefined) l.updatedAt = null;
        if (l.parentPageId === undefined) l.parentPageId = null;
        const match = l.name.match(/^Untitled Page (\d+)$/);
        if (match) pageCounter = Math.max(pageCounter, parseInt(match[1]));
      });
    });
  });

  // ===== Theme =====
  const THEME_KEY = 'notebook_theme';
  const themeBtn = document.getElementById('theme-btn');

  function loadTheme() {
    const saved = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(saved);
  }

  function applyTheme(theme) {
    if (theme === 'light') {
      document.documentElement.setAttribute('data-theme', 'light');
      themeBtn.innerHTML = '<i data-lucide="moon" class="icon-sm"></i>';
      themeBtn.title = 'Switch to Dark Theme';
    } else {
      document.documentElement.removeAttribute('data-theme');
      themeBtn.innerHTML = '<i data-lucide="sun" class="icon-sm"></i>';
      themeBtn.title = 'Switch to Light Theme';
    }
    localStorage.setItem(THEME_KEY, theme);
    if (window.lucide) lucide.createIcons();
  }

  themeBtn.addEventListener('click', () => {
    const current = localStorage.getItem(THEME_KEY) || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
  });

  loadTheme();

  // ===== DOM References =====
  const tabsEl = document.getElementById('group-tabs');
  const addTabBtn = document.getElementById('add-group-btn');
  const breadcrumbEl = document.getElementById('breadcrumb');
  const pageListEl = document.getElementById('label-list');
  const addPageBtn = document.getElementById('add-label-btn');
  const formatSelector = document.getElementById('format-selector');
  const editorContainer = document.getElementById('editor-container');
  const editorEl = document.getElementById('editor');
  const previewContainer = document.getElementById('preview-container');
  const previewEl = document.getElementById('preview');
  const emptyStateEl = document.getElementById('empty-state');
  const btnEdit = document.getElementById('btn-edit');
  const btnPreview = document.getElementById('btn-preview');
  const contentToolbar = document.getElementById('content-toolbar');

  // Enable horizontal mouse wheel scrolling and arrow navigation on the tabs scroll area
  const tabsScrollContent = document.getElementById('tabs-scroll-content');
  const tabsScrollLeft = document.getElementById('tabs-scroll-left');
  const tabsScrollRight = document.getElementById('tabs-scroll-right');

  tabsScrollContent.addEventListener('wheel', (e) => {
    if (e.deltaY !== 0) {
      e.preventDefault();
      tabsScrollContent.scrollLeft += e.deltaY;
    }
  }, { passive: false });

  // Hide page tooltip when mouse leaves the left panel or on any click
  document.getElementById('left-panel').addEventListener('mouseleave', () => {
  });
  document.addEventListener('click', () => {
  });

  tabsScrollLeft.addEventListener('click', () => {
    tabsScrollContent.scrollLeft -= 150;
  });

  tabsScrollRight.addEventListener('click', () => {
    tabsScrollContent.scrollLeft += 150;
  });

  function updateScrollArrows() {
    const el = tabsScrollContent;
    const canScrollLeft = el.scrollLeft > 0;
    const canScrollRight = el.scrollLeft < el.scrollWidth - el.clientWidth - 1;

    tabsScrollLeft.classList.toggle('hidden', !canScrollLeft);
    tabsScrollRight.classList.toggle('hidden', !canScrollRight);
  }

  tabsScrollContent.addEventListener('scroll', updateScrollArrows);
  window.addEventListener('resize', updateScrollArrows);

  // ===== Helpers =====
  function getVisibleTabs() {
    const nb = getActiveNotebook();
    if (!nb) return [];
    return nb.tabs.filter(g => g.parentTabId === nb.activeFolderId);
  }

  function getActiveTab() {
    const nb = getActiveNotebook();
    if (!nb) return null;
    return nb.tabs.find(g => g.id === nb.activeTabId) || null;
  }

  function getActivePage() {
    const activeTab = getActiveTab();
    if (!activeTab) return null;
    const nb = getActiveNotebook();
    return activeTab.pages.find(l => l.id === nb.activePageId) || null;
  }

  function getTabById(id) {
    const nb = getActiveNotebook();
    if (!nb) return null;
    return nb.tabs.find(g => g.id === id) || null;
  }

  function getChildFolders(containerId) {
    const nb = getActiveNotebook();
    if (!nb) return [];
    return nb.tabs.filter(g => g.parentTabId === containerId);
  }

  function getBreadcrumbPath() {
    const nb = getActiveNotebook();
    if (!nb) return [];
    const path = [];
    let currentId = nb.activeFolderId;
    while (currentId) {
      const g = getTabById(currentId);
      if (!g) break;
      path.unshift(g);
      currentId = g.parentTabId;
    }
    return path;
  }

  // ===== Render Functions =====
  function renderBreadcrumb() {
    const nb = getActiveNotebook();
    const notebookSelector = document.getElementById('notebook-selector');
    const navDividerNb = document.getElementById('nav-divider-notebook');
    if (!nb || !nb.activeFolderId) {
      breadcrumbEl.classList.add('hidden');
      notebookSelector.classList.remove('hidden');
      navDividerNb.classList.remove('hidden');
      return;
    }
    breadcrumbEl.classList.remove('hidden');
    notebookSelector.classList.add('hidden');
    navDividerNb.classList.add('hidden');
    breadcrumbEl.innerHTML = '';

    // Notebook name
    const nbName = document.createElement('span');
    nbName.className = 'breadcrumb-item breadcrumb-notebook';
    nbName.innerHTML = '<i data-lucide="book-open" class="icon-sm"></i> ' + escapeHtml(nb.name);
    nbName.addEventListener('click', () => {
      nb.activeFolderId = null;
      nb.activeTabId = null;
      nb.activePageId = null;
      debouncedSave();
      render();
    });
    breadcrumbEl.appendChild(nbName);

    // Separator
    const sep0 = document.createElement('span');

    /*
    sep0.className = 'breadcrumb-sep';
    sep0.textContent = ' › ';
    breadcrumbEl.appendChild(sep0);

    // Root link
    const rootLink = document.createElement('span');
    rootLink.className = 'breadcrumb-item';
    rootLink.textContent = '⌂ All Tabs';
    rootLink.addEventListener('click', () => {
      nb.activeFolderId = null;
      nb.activeTabId = null;
      nb.activePageId = null;
      debouncedSave();
      render();
    });
    breadcrumbEl.appendChild(rootLink);
*/

    // Path items
    const path = getBreadcrumbPath();
    path.forEach((g, i) => {
      const sep = document.createElement('span');
      sep.className = 'breadcrumb-sep';
      sep.textContent = ' › ';
      breadcrumbEl.appendChild(sep);

      const item = document.createElement('span');
      item.className = 'breadcrumb-item breadcrumb-folder';
      if (i === path.length - 1) {
        item.classList.add('current');
        item.innerHTML = '<i data-lucide="folder" class="icon-sm"></i> ' + escapeHtml(g.name);
      } else {
        item.innerHTML = '<i data-lucide="folder" class="icon-sm"></i> ' + escapeHtml(g.name);
        item.addEventListener('click', () => {
          nb.activeFolderId = g.id;
          nb.activeTabId = null;
          nb.activePageId = null;
          debouncedSave();
          render();
        });
      }
      breadcrumbEl.appendChild(item);
    });

    // Back button (navigate to parent folder)
    const backBtn = document.createElement('span');
    backBtn.className = 'breadcrumb-back-btn';
    backBtn.title = 'Go back';
    backBtn.innerHTML = '<i data-lucide="arrow-left" class="icon-sm"></i>';
    backBtn.addEventListener('click', () => {
      // Restore previous state from history
      if (navHistory.length > 0) {
        const prev = navHistory.pop();
        nb.activeFolderId = prev.folderId;
        nb.activeTabId = prev.tabId;
        nb.activePageId = prev.pageId;
      } else {
        // Fallback: go up one level
        const currentFolder = getTabById(nb.activeFolderId);
        if (currentFolder && currentFolder.parentTabId) {
          nb.activeFolderId = currentFolder.parentTabId;
        } else {
          nb.activeFolderId = null;
        }
        nb.activeTabId = null;
        nb.activePageId = null;
      }
      debouncedSave();
      render();
    });
    breadcrumbEl.appendChild(backBtn);
  }

  function renderTabs() {
    const nb = getActiveNotebook();
    if (!nb) return;
    tabsEl.innerHTML = '';
    const containerTabsEl = document.getElementById('container-tabs');
    containerTabsEl.innerHTML = '';
    const navDivider = document.getElementById('nav-divider');

    const visible = getVisibleTabs();
    const regularGroups = visible.filter(g => !g.isFolder);
    const containerGroups = visible.filter(g => g.isFolder);

    // Show/hide divider based on whether both sections have items
    navDivider.style.display = (regularGroups.length > 0 && containerGroups.length > 0) ? '' : 'none';

    // Auto-select the first non-container group if none is currently active at this level
    if (visible.length > 0 && !visible.find(g => g.id === nb.activeTabId)) {
      const firstNonContainer = visible.find(g => !g.isFolder);
      if (firstNonContainer) {
        nb.activeTabId = firstNonContainer.id;
        nb.activePageId = firstNonContainer.pages.length > 0 ? firstNonContainer.pages[0].id : null;
        debouncedSave();
      } else {
        nb.activeTabId = visible[0].id;
        debouncedSave();
      }
    }

    visible.forEach((group, index) => {
      const tab = document.createElement('button');
      tab.className = 'group-tab' + (group.id === nb.activeTabId ? ' active' : '');
      if (group.isFolder) tab.classList.add('container-tab');
      tab.dataset.id = group.id;
      tab.dataset.index = index;
      tab.draggable = true;

      // Apply custom color if set (only for inactive tabs)
      if (group.color && group.id !== nb.activeTabId) {
        tab.style.background = group.color;
        tab.style.color = getContrastColor(group.color);
        tab.style.setProperty('--tab-hover-color', lightenColor(group.color, 30));
        tab.classList.add('has-custom-color');
      }
      // Active tab with custom color
      if (group.color && group.id === nb.activeTabId) {
        tab.style.borderColor = group.color;
        tab.style.borderBottomColor = 'transparent';
        tab.style.background = group.color;
        tab.style.color = getContrastColor(group.color);
        document.getElementById('top-nav').style.setProperty('--nav-line-color', group.color);
      } else if (group.id === nb.activeTabId) {
        document.getElementById('top-nav').style.setProperty('--nav-line-color', '');
      }

      // Container icon
      if (group.isFolder) {
        const icon = document.createElement('i');
        icon.setAttribute('data-lucide', 'folder');
        icon.className = 'icon-sm';
        if (group.color && group.id !== nb.activeTabId) {
          icon.style.color = getContrastColor(group.color);
        }
        tab.appendChild(icon);
      }

      const nameSpan = document.createElement('span');
      nameSpan.textContent = group.name;
      tab.appendChild(nameSpan);

      tab.addEventListener('click', (e) => {
        if (tab.querySelector('.group-tab-input')) return;
        if (group.isFolder) {
          // Save current state to history before navigating
          pushNavHistory(nb);
          nb.activeFolderId = group.id;
          nb.activeTabId = null;
          nb.activePageId = null;
          debouncedSave();
          render();
        } else {
          pushNavHistory(nb);
          nb.activeTabId = group.id;
          const g = getActiveTab();
          const savedLabelId = nb.activePagePerTab && nb.activePagePerTab[group.id];
          if (savedLabelId && g && g.pages.find(l => l.id === savedLabelId)) {
            nb.activePageId = savedLabelId;
          } else if (g && !g.pages.find(l => l.id === nb.activePageId)) {
            nb.activePageId = g.pages.length > 0 ? g.pages[0].id : null;
          }
          debouncedSave();
          render();
        }
      });

      // Right-click context menu
      tab.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        e.stopPropagation();
        showTabContextMenu(e.clientX, e.clientY, tab, group);
      });

      // Drag-and-drop for reordering
      tab.addEventListener('dragstart', (e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', group.id);
        tab.classList.add('dragging');
        setTimeout(() => tab.classList.add('dragging'), 0);
      });

      tab.addEventListener('dragend', () => {
        tab.classList.remove('dragging');
        clearDropIndicators();
      });

      tab.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        clearDropIndicators();
        // Check if this is a page being dragged (show different indicator)
        if (e.dataTransfer.types.includes('application/x-page-id')) {
          tab.classList.add('drop-page-target');
        } else {
          if (e.clientX < midX) {
            tab.classList.add('drop-before');
          } else {
            tab.classList.add('drop-after');
          }
        }
      });

      tab.addEventListener('dragleave', () => {
        tab.classList.remove('drop-before', 'drop-after', 'drop-page-target');
      });

      tab.addEventListener('drop', (e) => {
        e.preventDefault();
        clearDropIndicators();
        tab.classList.remove('drop-page-target');

        const pageId = e.dataTransfer.getData('application/x-page-id');
        if (pageId && !group.isFolder) {
          // Page dropped onto a tab — move page to this tab
          movePageToTab(pageId, group.id);
          return;
        }

        const draggedId = e.dataTransfer.getData('text/plain');
        const rect = tab.getBoundingClientRect();
        const midX = rect.left + rect.width / 2;
        const insertAfter = e.clientX >= midX;
        reorderTab(draggedId, group.id, insertAfter);
      });

      // Append to the correct container
      if (group.isFolder) {
        containerTabsEl.appendChild(tab);
      } else {
        tabsEl.appendChild(tab);
      }
    });

    // Update scroll arrows visibility and refresh icons
    updateScrollArrows();
    if (window.lucide) lucide.createIcons();
  }

  function clearDropIndicators() {
    tabsEl.querySelectorAll('.group-tab').forEach(t => {
      t.classList.remove('drop-before', 'drop-after', 'drop-page-target');
    });
    const containerTabsEl = document.getElementById('container-tabs');
    containerTabsEl.querySelectorAll('.group-tab').forEach(t => {
      t.classList.remove('drop-before', 'drop-after', 'drop-page-target');
    });
  }

  function reorderTab(draggedId, targetId, insertAfter) {
    const nb = getActiveNotebook();
    if (!nb) return;
    if (draggedId === targetId) return;
    const visible = getVisibleTabs();
    const draggedIdx = visible.findIndex(g => g.id === draggedId);
    const targetIdx = visible.findIndex(g => g.id === targetId);
    if (draggedIdx === -1 || targetIdx === -1) return;

    // Work on the global array but only reorder within same parent
    const globalDragIdx = nb.tabs.findIndex(g => g.id === draggedId);
    const [moved] = nb.tabs.splice(globalDragIdx, 1);

    // Find where to insert in the global array
    const globalTargetIdx = nb.tabs.findIndex(g => g.id === targetId);
    const insertAt = insertAfter ? globalTargetIdx + 1 : globalTargetIdx;
    nb.tabs.splice(insertAt, 0, moved);

    debouncedSave();
    renderTabs();
  }

  // ===== Move Page to Another Tab =====
  function movePageToTab(pageId, targetTabId) {
    const nb = getActiveNotebook();
    if (!nb) return;

    // Find the source group containing this page
    let sourceTab = null;
    let page = null;
    for (const g of nb.tabs) {
      const found = g.pages.find(l => l.id === pageId);
      if (found) {
        sourceTab = g;
        page = found;
        break;
      }
    }
    if (!sourceTab || !page) return;

    // Don't move if already in the target
    const targetTab = nb.tabs.find(g => g.id === targetTabId);
    if (!targetTab || targetTab.isFolder) return;
    if (sourceTab.id === targetTabId) return;

    // Collect the page and all its descendants
    const pagesToMove = [page];
    collectDescendantPagesForMove(sourceTab, page.id, pagesToMove);

    // Remove from source group
    const idsToMove = new Set(pagesToMove.map(p => p.id));
    sourceTab.pages = sourceTab.pages.filter(l => !idsToMove.has(l.id));

    // Reset parent of the dragged page to null (top-level in new tab)
    page.parentPageId = null;

    // Add to target group at the bottom
    pagesToMove.forEach(p => {
      targetTab.pages.push(p);
    });

    // Update active label if needed
    if (idsToMove.has(nb.activePageId)) {
      nb.activePageId = page.id;
      nb.activeTabId = targetTabId;
    }

    debouncedSave();
    render();
  }

  function collectDescendantPagesForMove(group, parentId, result) {
    const children = group.pages.filter(l => l.parentPageId === parentId);
    children.forEach(child => {
      result.push(child);
      collectDescendantPagesForMove(group, child.id, result);
    });
  }

  // ===== Context Menu =====
  let activeContextMenu = null;

  function closeContextMenu() {
    if (activeContextMenu) {
      activeContextMenu.remove();
      activeContextMenu = null;
    }
  }

  document.addEventListener('click', closeContextMenu);
  document.addEventListener('contextmenu', () => closeContextMenu());

  function showTabContextMenu(x, y, tabEl, tabItem) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // Rename option
    const renameItem = createMenuItem('✎', 'Rename');
    renameItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      startEditTabName(tabEl, tabItem);
    });
    menu.appendChild(renameItem);

    // Color option
    const colorItem = createMenuItem('🎨', 'Set Color');
    colorItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      showColorPicker(tabItem);
    });
    menu.appendChild(colorItem);

    // Remove color option (only show if a color is set)
    if (tabItem.color) {
      const removeColorItem = createMenuItem('🚫', 'Remove Color');
      removeColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        tabItem.color = null;
        debouncedSave();
        renderTabs();
      });
      menu.appendChild(removeColorItem);

      // Copy color
      const copyColorItem = createMenuItem('📋', 'Copy Color');
      copyColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        copiedColor = tabItem.color;
      });
      menu.appendChild(copyColorItem);
    }

    // Paste color (only show if a color has been copied)
    if (copiedColor) {
      const pasteColorItem = createMenuItem('📌', 'Paste Color');
      pasteColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        tabItem.color = copiedColor;
        debouncedSave();
        renderTabs();
      });
      menu.appendChild(pasteColorItem);
    }

    // If not a container, offer "Make Container"
    if (!tabItem.isFolder && tabItem.pages.length === 0) {
      const containerItem = createMenuItem('⊕', 'Convert to Folder');
      containerItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        tabItem.isFolder = true;
        debouncedSave();
        render();
      });
      menu.appendChild(containerItem);
    }

    menu.appendChild(createSeparator());

    // Delete option
    const deleteItem = createMenuItem('🗑', 'Delete', true);
    deleteItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      deleteTab(tabItem);
    });
    menu.appendChild(deleteItem);

    // Position the menu
    document.body.appendChild(menu);
    activeContextMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  function createMenuItem(icon, label, danger) {
    const item = document.createElement('div');
    item.className = 'context-menu-item' + (danger ? ' danger' : '');
    item.innerHTML = '<span>' + icon + '</span><span>' + label + '</span>';
    return item;
  }

  function createSeparator() {
    const sep = document.createElement('div');
    sep.className = 'context-menu-separator';
    return sep;
  }

  function showColorPicker(group) {
    // Create a hidden color input and trigger it
    const input = document.createElement('input');
    input.type = 'color';
    input.value = group.color || '#313244';
    input.style.position = 'fixed';
    input.style.top = '-100px';
    input.style.left = '-100px';
    document.body.appendChild(input);

    input.addEventListener('input', () => {
      group.color = input.value;
      debouncedSave();
      renderTabs();
    });

    input.addEventListener('change', () => {
      group.color = input.value;
      debouncedSave();
      renderTabs();
      setTimeout(() => input.remove(), 100);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => input.remove(), 200);
    });

    input.click();
  }

  function showPageColorPicker(page) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = page.color || '#313244';
    input.style.position = 'fixed';
    input.style.top = '-100px';
    input.style.left = '-100px';
    document.body.appendChild(input);

    input.addEventListener('input', () => {
      page.color = input.value;
      debouncedSave();
      renderPages();
    });

    input.addEventListener('change', () => {
      page.color = input.value;
      debouncedSave();
      renderPages();
      setTimeout(() => input.remove(), 100);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => input.remove(), 200);
    });

    input.click();
  }

  function deleteTab(group) {
    const nb = getActiveNotebook();
    if (!nb) return;
    if (group.isFolder) {
      // Check if any tabs nested under this folder (at any depth) have pages
      const totalPages = countPagesRecursive(group.id);
      if (totalPages > 0) {
        alert('Cannot delete folder "' + group.name + '" because there are ' + totalPages + ' page(s) in tabs under it.\n\nPlease remove all pages first.');
        return;
      }
      if (!confirm('Are you sure you want to delete the folder "' + group.name + '"?')) return;
    } else {
      const noteCount = group.pages.length;
      const message = noteCount > 0
        ? 'Are you sure you want to delete the tab "' + group.name + '"?\n\nThis will permanently delete all ' + noteCount + ' associated page(s).'
        : 'Are you sure you want to delete the tab "' + group.name + '"?';
      if (!confirm(message)) return;
    }

    const idx = nb.tabs.indexOf(group);
    if (idx === -1) return;
    nb.tabs.splice(idx, 1);

    if (nb.activeTabId === group.id) {
      const visible = getVisibleTabs();
      if (visible.length > 0) {
        nb.activeTabId = visible[0].id;
        const newActive = getActiveTab();
        nb.activePageId = newActive && newActive.pages.length > 0 ? newActive.pages[0].id : null;
      } else {
        nb.activeTabId = null;
        nb.activePageId = null;
      }
    }

    debouncedSave();
    render();
  }

  function countPagesRecursive(containerId) {
    const nb = getActiveNotebook();
    let count = 0;
    const children = nb.tabs.filter(g => g.parentTabId === containerId);
    children.forEach(child => {
      count += child.pages.length;
      if (child.isFolder) {
        count += countPagesRecursive(child.id);
      }
    });
    return count;
  }

  function startEditTabName(tabEl, group) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'group-tab-input';
    input.value = group.name;
    tabEl.textContent = '';
    tabEl.appendChild(input);
    input.focus();
    input.select();

    function finish() {
      const newName = input.value.trim();
      if (newName) group.name = newName;
      debouncedSave();
      renderTabs();
    }

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = group.name; input.blur(); }
    });
    input.addEventListener('keyup', (e) => { e.stopPropagation(); });
    input.addEventListener('keypress', (e) => { e.stopPropagation(); });
    input.addEventListener('click', (e) => { e.stopPropagation(); });
  }

  function renderPages() {
    pageListEl.innerHTML = '';
    const activeTab = getActiveTab();
    const leftPanelHeader = document.getElementById('left-panel-header');
    if (!activeTab || activeTab.isFolder) {
      leftPanelHeader.classList.add('hidden');
      return;
    }
    leftPanelHeader.classList.remove('hidden');

    // Migrate: ensure all pages have parentPageId
    activeTab.pages.forEach(l => {
      if (l.parentPageId === undefined) l.parentPageId = null;
    });

    if (timedViewActive) {
      renderTimedView(activeTab);
    } else if (favoritesViewActive) {
      // Show only favorite pages (flat list, no tree)
      let favPages = activeTab.pages.filter(p => p.favorite);
      if (favPages.length === 0) {
        const emptyEl = document.createElement('li');
        emptyEl.style.cssText = 'padding:16px;color:var(--text-muted);font-size:13px;text-align:center';
        emptyEl.textContent = 'No favorite pages in this tab.';
        pageListEl.appendChild(emptyEl);
      } else {
        favPages.forEach(page => {
          renderPageItem(page, activeTab, 0);
        });
      }
    } else {
      // Render tree structure (apply label filter if active)
      let topLevel = activeTab.pages.filter(l => !l.parentPageId);
      if (activeLabelFilter) {
        topLevel = topLevel.filter(p => p.labelIds && p.labelIds.includes(activeLabelFilter));
      }
      topLevel.forEach(page => {
        renderPageItem(page, activeTab, 0);
      });
    }

    // Refresh icons for dynamically created toggle buttons
    if (window.lucide) lucide.createIcons();
  }

  function renderTimedView(tab) {
    const now = new Date();
    const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000);
    const oneWeekAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
    const oneMonthAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);

    const today = [];
    const week = [];
    const month = [];
    const other = [];

    // Only consider top-level pages for grouping
    const topLevel = tab.pages.filter(l => !l.parentPageId);

    topLevel.forEach(page => {
      const dateStr = page.updatedAt || page.createdAt || '';
      const date = dateStr ? new Date(dateStr) : null;

      if (date && date >= oneDayAgo) {
        today.push(page);
      } else if (date && date >= oneWeekAgo) {
        week.push(page);
      } else if (date && date >= oneMonthAgo) {
        month.push(page);
      } else {
        other.push(page);
      }
    });

    if (today.length > 0) {
      renderTimedGroupHeader('Today');
      today.forEach(page => renderPageItem(page, tab, 0));
    }
    if (week.length > 0) {
      renderTimedGroupHeader('This Week');
      week.forEach(page => renderPageItem(page, tab, 0));
    }
    if (month.length > 0) {
      renderTimedGroupHeader('This Month');
      month.forEach(page => renderPageItem(page, tab, 0));
    }
    if (other.length > 0) {
      renderTimedGroupHeader('Older');
      other.forEach(page => renderPageItem(page, tab, 0));
    }
  }

  function renderTimedGroupHeader(title) {
    const header = document.createElement('li');
    header.className = 'timed-view-header';
    header.textContent = title;
    pageListEl.appendChild(header);
  }

  function renderPageItem(page, tab, depth) {
    const nb = getActiveNotebook();
    const li = document.createElement('li');
    li.className = page.id === nb.activePageId ? 'active' : '';
    li.dataset.id = page.id;
    li.dataset.depth = depth;
    li.style.paddingLeft = (12 + depth * 18) + 'px';
    li.draggable = true;

    // Apply custom page color
    if (page.color && page.id !== nb.activePageId) {
      li.style.background = page.color;
      li.style.color = getContrastColor(page.color);
      li.style.setProperty('--page-hover-color', lightenColor(page.color, 30));
      li.classList.add('has-page-color');
    }

    // Check if this label has children
    const children = tab.pages.filter(l => l.parentPageId === page.id);
    const hasChildren = children.length > 0;

    // Tree indent for child nodes (not for top-level)
    if (depth > 0) {
      const indent = document.createElement('span');
      indent.className = 'label-indent';
      indent.textContent = '└ ';
      li.appendChild(indent);
    }

    const nameSpan = document.createElement('span');
    nameSpan.className = 'label-name';
    if (page.favorite) {
      nameSpan.innerHTML = '<span class="page-fav-star">★</span> ' + escapeHtml(page.name);
    } else {
      nameSpan.textContent = page.name;
    }
    li.appendChild(nameSpan);

    // Label color dots
    if (page.labelIds && page.labelIds.length > 0) {
      const dotsContainer = document.createElement('span');
      dotsContainer.className = 'page-label-dots';
      const nbLabels = nb.labels || [];
      const allLbls = nbLabels.concat(state.globalLabels || []);
      page.labelIds.slice(0, 5).forEach(lblId => {
        const lbl = allLbls.find(l => l.id === lblId);
        if (lbl) {
          const dot = document.createElement('span');
          dot.className = 'page-label-dot';
          dot.style.background = lbl.color;
          dot.title = lbl.name;
          dotsContainer.appendChild(dot);
        }
      });
      if (page.labelIds.length > 5) {
        const more = document.createElement('span');
        more.style.fontSize = '9px';
        more.style.color = 'var(--text-muted)';
        more.textContent = '+' + (page.labelIds.length - 5);
        dotsContainer.appendChild(more);
      }
      li.appendChild(dotsContainer);
    }

    // Collapse/expand toggle (after name, before actions)
    if (hasChildren) {
      const isCollapsed = nb.collapsedPages && nb.collapsedPages[page.id];
      const toggle = document.createElement('span');
      toggle.className = 'label-toggle';
      toggle.innerHTML = isCollapsed ? '<i data-lucide="chevron-right" class="icon-xs"></i>' : '<i data-lucide="chevron-down" class="icon-xs"></i>';
      toggle.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!nb.collapsedPages) nb.collapsedPages = {};
        nb.collapsedPages[page.id] = !isCollapsed;
        // Preserve scroll position when toggling
        const scrollTop = pageListEl.scrollTop;
        debouncedSave();
        renderPages();
        pageListEl.scrollTop = scrollTop;
      });
      li.appendChild(toggle);
    }

    // Right-click context menu
    li.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      showPageContextMenu(e.clientX, e.clientY, tab, page);
    });

    li.addEventListener('click', () => {
      pushNavHistory(nb);
      nb.activePageId = page.id;
      // Persist active page per tab
      if (!nb.activePagePerTab) nb.activePagePerTab = {};
      nb.activePagePerTab[tab.id] = page.id;
      debouncedSave();
      render();
    });

    // Drag-and-drop
    li.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', page.id);
      e.dataTransfer.setData('application/x-page-id', page.id);
      li.classList.add('dragging');
    });

    li.addEventListener('dragend', () => {
      li.classList.remove('dragging');
      clearPageDropIndicators();
    });

    li.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      clearPageDropIndicators();

      const rect = li.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;

      if (y < height * 0.25) {
        li.classList.add('label-drop-before');
      } else if (y > height * 0.75) {
        li.classList.add('label-drop-after');
      } else {
        li.classList.add('label-drop-inside');
      }
    });

    li.addEventListener('dragleave', () => {
      li.classList.remove('label-drop-before', 'label-drop-after', 'label-drop-inside');
    });

    li.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      clearPageDropIndicators();

      const draggedId = e.dataTransfer.getData('text/plain');
      if (draggedId === page.id) return;

      const rect = li.getBoundingClientRect();
      const y = e.clientY - rect.top;
      const height = rect.height;

      if (y < height * 0.25) {
        movePageAsSibling(tab, draggedId, page.id, 'before');
      } else if (y > height * 0.75) {
        movePageAsSibling(tab, draggedId, page.id, 'after');
      } else {
        movePageAsChild(tab, draggedId, page.id);
      }
    });

    pageListEl.appendChild(li);

    // Render children recursively (only if not collapsed)
    const isCollapsed = nb.collapsedPages && nb.collapsedPages[page.id];
    if (!isCollapsed) {
      children.forEach(child => {
        renderPageItem(child, tab, depth + 1);
      });
    }
  }

  function clearPageDropIndicators() {
    pageListEl.querySelectorAll('li').forEach(li => {
      li.classList.remove('label-drop-before', 'label-drop-after', 'label-drop-inside');
    });
  }

  function movePageAsChild(tab, draggedId, targetId) {
    const dragged = tab.pages.find(l => l.id === draggedId);
    if (!dragged) return;
    // Prevent circular: can't drop a parent onto its own child
    if (isDescendant(tab, targetId, draggedId)) return;
    dragged.parentPageId = targetId;
    debouncedSave();
    renderPages();
  }

  function movePageAsSibling(tab, draggedId, targetId, position) {
    const dragged = tab.pages.find(l => l.id === draggedId);
    const target = tab.pages.find(l => l.id === targetId);
    if (!dragged || !target) return;

    // Make same parent as target
    dragged.parentPageId = target.parentPageId;

    // Reorder: remove dragged, insert near target
    const dragIdx = tab.pages.indexOf(dragged);
    tab.pages.splice(dragIdx, 1);

    const targetIdx = tab.pages.indexOf(target);
    const insertAt = position === 'before' ? targetIdx : targetIdx + 1;
    tab.pages.splice(insertAt, 0, dragged);

    debouncedSave();
    renderPages();
  }

  function isDescendant(tab, pageId, potentialAncestorId) {
    // Check if pageId is a descendant of potentialAncestorId
    let current = tab.pages.find(l => l.id === pageId);
    while (current && current.parentPageId) {
      if (current.parentPageId === potentialAncestorId) return true;
      current = tab.pages.find(l => l.id === current.parentPageId);
    }
    return false;
  }

  // ===== Page Context Menu =====
  function showPageContextMenu(x, y, tab, page) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // Toggle favorite
    const isFav = page.favorite === true;
    const favItem = createMenuItem(isFav ? '★' : '☆', isFav ? 'Remove from Favorites' : 'Add to Favorites');
    favItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      page.favorite = !isFav;
      debouncedSave();
      renderPages();
      renderContent();
    });
    menu.appendChild(favItem);

    menu.appendChild(createSeparator());

    // Create sub-label
    const subLabelItem = createMenuItem('＋', 'Create Sub Page');
    subLabelItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      createSubPage(tab, page);
    });
    menu.appendChild(subLabelItem);

    // Make independent (only if it has a parent)
    if (page.parentPageId) {
      const independentItem = createMenuItem('↗', 'Make Independent');
      independentItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        page.parentPageId = null;
        debouncedSave();
        renderPages();
      });
      menu.appendChild(independentItem);
    }

    menu.appendChild(createSeparator());

    // Rename
    const renameItem = createMenuItem('✎', 'Rename');
    renameItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      const li = pageListEl.querySelector('[data-id="' + page.id + '"]');
      if (li) {
        const nameSpan = li.querySelector('.label-name');
        startEditPageName(li, nameSpan, page);
      }
    });
    menu.appendChild(renameItem);

    menu.appendChild(createSeparator());

    // Set Color
    const colorItem = createMenuItem('🎨', 'Set Color');
    colorItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      showPageColorPicker(page);
    });
    menu.appendChild(colorItem);

    // Remove Color (only if set)
    if (page.color) {
      const removeColorItem = createMenuItem('🚫', 'Remove Color');
      removeColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        page.color = null;
        debouncedSave();
        renderPages();
      });
      menu.appendChild(removeColorItem);

      // Copy Color
      const copyColorItem = createMenuItem('📋', 'Copy Color');
      copyColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        copiedColor = page.color;
      });
      menu.appendChild(copyColorItem);
    }

    // Paste Color
    if (copiedColor) {
      const pasteColorItem = createMenuItem('📌', 'Paste Color');
      pasteColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        page.color = copiedColor;
        debouncedSave();
        renderPages();
      });
      menu.appendChild(pasteColorItem);
    }

    menu.appendChild(createSeparator());

    // Move to another tab
    const moveItem = createMenuItem('↪', 'Move to...');
    moveItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      showMoveToModal(tab, page);
    });
    menu.appendChild(moveItem);

    menu.appendChild(createSeparator());

    // Run Macro (only if page has labels with macros)
    if (page.labelIds && page.labelIds.length > 0 && state.macros) {
      const matchingMacros = state.macros.filter(m => page.labelIds.includes(m.labelId));
      if (matchingMacros.length > 0) {
        const macroItem = createMenuItem('▶', 'Run Macro');
        macroItem.addEventListener('click', (e) => {
          e.stopPropagation();
          closeContextMenu();
          window.executeMacroForPage(page);
        });
        menu.appendChild(macroItem);
        menu.appendChild(createSeparator());
      }
    }

    // Delete
    const deleteItem = createMenuItem('🗑', 'Delete', true);
    deleteItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      deletePage(tab, page);
    });
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);
    activeContextMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  // ===== Move To Modal =====
  function showMoveToModal(sourceTab, page) {
    const nb = getActiveNotebook();
    if (!nb) return;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'move-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'move-modal';

    const header = document.createElement('div');
    header.className = 'move-modal-header';
    header.innerHTML = '<span>Move "' + escapeHtml(page.name) + '" to...</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const list = document.createElement('div');
    list.className = 'move-modal-list';

    // Build tree: top-level tabs, then folders with their tabs
    const topLevelTabs = nb.tabs.filter(g => !g.isFolder && !g.parentTabId);
    const topLevelFolders = nb.tabs.filter(g => g.isFolder && !g.parentTabId);

    // Render top-level tabs
    topLevelTabs.forEach(g => {
      const item = createMoveItem(g, false, sourceTab, page, overlay);
      list.appendChild(item);
    });

    // Render folders with their child tabs
    topLevelFolders.forEach(folder => {
      const folderEl = document.createElement('div');
      folderEl.className = 'move-modal-folder';
      folderEl.innerHTML = '<span class="move-modal-folder-name">📁 ' + escapeHtml(folder.name) + '</span>';
      list.appendChild(folderEl);

      const childTabs = nb.tabs.filter(g => !g.isFolder && g.parentTabId === folder.id);
      childTabs.forEach(g => {
        const item = createMoveItem(g, true, sourceTab, page, overlay);
        list.appendChild(item);
      });

      // Recursively handle nested folders
      renderNestedFolders(nb, folder.id, list, sourceTab, page, overlay, 1);
    });

    modal.appendChild(list);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);

    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.remove();
    });
  }

  function renderNestedFolders(nb, parentFolderId, list, sourceTab, page, overlay, depth) {
    const subFolders = nb.tabs.filter(g => g.isFolder && g.parentTabId === parentFolderId);
    subFolders.forEach(folder => {
      const folderEl = document.createElement('div');
      folderEl.className = 'move-modal-folder';
      folderEl.style.paddingLeft = (12 + depth * 16) + 'px';
      folderEl.innerHTML = '<span class="move-modal-folder-name">📁 ' + escapeHtml(folder.name) + '</span>';
      list.appendChild(folderEl);

      const childTabs = nb.tabs.filter(g => !g.isFolder && g.parentTabId === folder.id);
      childTabs.forEach(g => {
        const item = createMoveItem(g, true, sourceTab, page, overlay);
        item.style.paddingLeft = (24 + depth * 16) + 'px';
        list.appendChild(item);
      });

      renderNestedFolders(nb, folder.id, list, sourceTab, page, overlay, depth + 1);
    });
  }

  function createMoveItem(targetTab, indented, sourceTab, page, overlay) {
    const item = document.createElement('div');
    item.className = 'move-modal-item';
    if (indented) item.style.paddingLeft = '24px';
    if (targetTab.id === sourceTab.id) {
      item.classList.add('disabled');
      item.textContent = targetTab.name + ' (current)';
    } else {
      item.textContent = targetTab.name;
      item.addEventListener('click', () => {
        movePageToTab(page.id, targetTab.id);
        overlay.remove();
      });
    }
    return item;
  }

  function createSubPage(tab, parentPage) {
    const nb = getActiveNotebook();
    pageCounter++;
    const defaultName = 'Untitled Page ' + pageCounter;
    const newPage = {
      id: generateId('label'),
      name: defaultName,
      contentType: 'markdown',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
      parentPageId: parentPage.id
    };
    tab.pages.push(newPage);
    nb.activePageId = newPage.id;
    debouncedSave();
    render();

    setTimeout(() => {
      const li = pageListEl.querySelector('[data-id="' + newPage.id + '"]');
      if (li) {
        const nameSpan = li.querySelector('.label-name');
        startEditPageName(li, nameSpan, newPage);
      }
    }, 50);
  }

  // formatDate imported from NoteUtils

  function startEditPageName(liEl, nameSpan, page) {
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'label-name-input';
    input.value = page.name;
    nameSpan.textContent = '';
    nameSpan.appendChild(input);
    input.focus();
    input.select();

    function finish() {
      const newName = input.value.trim();
      if (newName) page.name = newName;
      debouncedSave();
      render();
    }

    input.addEventListener('blur', finish);
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
      if (e.key === 'Escape') { input.value = page.name; input.blur(); }
    });
  }

  function deletePage(tab, page) {
    const nb = getActiveNotebook();
    // Collect this page and all descendants
    const toDelete = collectDescendantPages(tab, page.id);
    toDelete.push(page.id);

    tab.pages = tab.pages.filter(l => !toDelete.includes(l.id));

    if (toDelete.includes(nb.activePageId)) {
      nb.activePageId = tab.pages.length > 0 ? tab.pages[0].id : null;
    }
    debouncedSave();
    render();
  }

  function collectDescendantPages(tab, parentId) {
    const ids = [];
    const children = tab.pages.filter(l => l.parentPageId === parentId);
    children.forEach(child => {
      ids.push(child.id);
      ids.push(...collectDescendantPages(tab, child.id));
    });
    return ids;
  }

  function renderContent() {
    const activePage = getActivePage();
    const activeTab = getActiveTab();
    const contentTitle = document.getElementById('content-title');

    if (!activePage || (activeTab && activeTab.isFolder)) {
      contentToolbar.classList.add('hidden');
      editorContainer.classList.add('hidden');
      previewContainer.classList.add('hidden');
      emptyStateEl.classList.remove('hidden');
      return;
    }

    contentToolbar.classList.remove('hidden');
    emptyStateEl.classList.add('hidden');

    // Show selected page name and metadata
    var metaHtml = '';
    if (activePage.createdAt || activePage.updatedAt) {
      var metaParts = [];
      if (activePage.createdAt) metaParts.push('Created: ' + formatDate(activePage.createdAt));
      if (activePage.updatedAt) metaParts.push('Modified: ' + formatDate(activePage.updatedAt));
      metaHtml = '<span class="content-title-meta">' + metaParts.join(' · ') + '</span>';
    }
    contentTitle.innerHTML = '<span class="content-title-name">' + escapeHtml(activePage.name) + '</span>' + metaHtml;
    contentTitle.title = 'Double-click to rename';

    // Favorite toggle in toolbar
    const favToggleBtn = document.getElementById('fav-toggle-btn');
    if (activePage.favorite) {
      favToggleBtn.classList.add('fav-active');
      favToggleBtn.title = 'Remove from Favorites';
    } else {
      favToggleBtn.classList.remove('fav-active');
      favToggleBtn.title = 'Add to Favorites';
    }
    favToggleBtn.onclick = () => {
      activePage.favorite = !activePage.favorite;
      debouncedSave();
      renderPages();
      renderContent();
    };

    contentTitle.ondblclick = () => {
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'content-title-input';
      input.value = activePage.name;
      contentTitle.innerHTML = '';
      contentTitle.appendChild(input);
      input.focus();
      input.select();

      function finish() {
        const newName = input.value.trim();
        if (newName) activePage.name = newName;
        debouncedSave();
        render();
      }

      input.addEventListener('blur', finish);
      input.addEventListener('keydown', (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { input.value = activePage.name; input.blur(); }
      });
      input.addEventListener('keyup', (e) => { e.stopPropagation(); });
      input.addEventListener('click', (e) => { e.stopPropagation(); });
    };

    formatSelector.value = activePage.contentType || 'plaintext';

    // Render labels in content toolbar
    renderContentLabels(activePage);

    if (currentMode === 'edit') {
      editorContainer.classList.remove('hidden');
      previewContainer.classList.add('hidden');
      editorEl.value = activePage.content || '';
      // Show markdown toolbar only in edit mode with markdown format
      if (activePage.contentType === 'markdown') {
        window.MarkdownToolbar.show();
      } else {
        window.MarkdownToolbar.hide();
      }
    } else {
      editorContainer.classList.add('hidden');
      previewContainer.classList.remove('hidden');
      window.MarkdownToolbar.hide();
      renderPreview(activePage);
    }
  }

  function renderPreview(page) {
    const content = page.content || '';
    const type = page.contentType || 'plaintext';

    // Clean up previous object URLs
    activeObjectUrls.forEach(url => URL.revokeObjectURL(url));
    activeObjectUrls = [];

    // Find all image tokens (supports {{img:id}} and {{img:id:width:height}})
    const imgTokenRegex = /\{\{img:([\w-]+)(?::(\d+):(\d+))?\}\}/g;
    const imageTokens = [];
    let match;
    while ((match = imgTokenRegex.exec(content)) !== null) {
      imageTokens.push({ full: match[0], id: match[1], width: match[2] || null, height: match[3] || null });
    }

    if (imageTokens.length === 0) {
      renderPreviewContent(content, type);
      return;
    }

    // Load all images from IndexedDB, then render
    Promise.all(imageTokens.map(t => getImage(t.id))).then((images) => {
      let processedContent = content;
      images.forEach((imgRecord, i) => {
        const token = imageTokens[i];
        if (imgRecord && imgRecord.blob) {
          const url = URL.createObjectURL(imgRecord.blob);
          activeObjectUrls.push(url);
          const sizeAttr = token.width ? ' style="width:' + token.width + 'px;height:' + token.height + 'px;"' : '';
          if (type === 'markdown') {
            // For markdown, use HTML img tag to support resize
            processedContent = processedContent.replace(token.full, '<img class="inline-image resizable-image" src="' + url + '" data-img-id="' + token.id + '"' + sizeAttr + ' alt="image">');
          } else {
            processedContent = processedContent.replace(token.full, '<img class="inline-image resizable-image" src="' + url + '" data-img-id="' + token.id + '"' + sizeAttr + ' alt="pasted image">');
          }
        } else {
          processedContent = processedContent.replace(token.full, '[image not found]');
        }
      });
      renderPreviewContent(processedContent, type);
      attachImageResizeHandles();
    }).catch(() => {
      renderPreviewContent(content, type);
    });
  }

  function renderPreviewContent(content, type) {
    switch (type) {
      case 'markdown':
        previewEl.innerHTML = marked.parse(content, { breaks: true, gfm: true });
        previewEl.querySelectorAll('pre code').forEach(block => {
          Prism.highlightElement(block);
        });
        // Linkify bare file:/// URLs in text nodes
        previewEl.querySelectorAll('p, li, td, blockquote').forEach(el => {
          if (el.querySelector('a')) return; // skip if already has links inside
          el.innerHTML = el.innerHTML.replace(/(file:\/\/\/[^\s<"]+)/gi, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
        });
        // Open external links in new window (not internal nb:// links)
        previewEl.querySelectorAll('a').forEach(a => {
          const href = a.getAttribute('href') || '';
          if (!href.startsWith('nb://')) {
            a.setAttribute('target', '_blank');
            a.setAttribute('rel', 'noopener noreferrer');
          }
        });
        break;

      case 'json':
        try {
          const parsed = JSON.parse(content);
          previewEl.innerHTML = '<div class="json-tree">' + renderJsonTree(parsed) + '</div>';
          attachJsonCollapsibles();
        } catch (e) {
          previewEl.innerHTML = '<pre class="code-preview"><code class="language-json">' +
            escapeHtml(content) + '</code></pre>';
          Prism.highlightAllUnder(previewEl);
        }
        break;

      case 'yaml':
        previewEl.innerHTML = '<pre class="code-preview"><code class="language-yaml">' +
          escapeHtml(content) + '</code></pre>';
        Prism.highlightAllUnder(previewEl);
        break;

      case 'plaintext':
      default:
        // For plaintext: escape text parts but preserve injected img tags
        var parts = content.split(/(<img\s[^>]+>)/g);
        var plainHtml = parts.map(function(part) {
          if (part.match(/^<img\s/)) return part;
          var escaped = escapeHtml(part);
          return autoLinkify(escaped);
        }).join('');
        previewEl.innerHTML = '<div class="plaintext-preview">' + plainHtml + '</div>';
        break;
    }
  }

  // autoLinkify imported from NoteUtils

  // ===== Image Resize =====
  function attachImageResizeHandles() {
    previewEl.querySelectorAll('.resizable-image').forEach(img => {
      // Wrap image in a container for resize handles
      const wrapper = document.createElement('div');
      wrapper.className = 'image-resize-wrapper';
      img.parentNode.insertBefore(wrapper, img);
      wrapper.appendChild(img);

      // Create resize handle (bottom-right corner)
      const handle = document.createElement('div');
      handle.className = 'image-resize-handle';
      wrapper.appendChild(handle);

      // Set initial wrapper size
      if (img.style.width) {
        wrapper.style.width = img.style.width;
      }

      let startX, startY, startW, startH;

      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        startX = e.clientX;
        startY = e.clientY;
        startW = img.offsetWidth;
        startH = img.offsetHeight;

        function onMouseMove(e) {
          const newW = Math.max(50, startW + (e.clientX - startX));
          const newH = Math.max(50, startH + (e.clientY - startY));
          img.style.width = newW + 'px';
          img.style.height = newH + 'px';
          wrapper.style.width = newW + 'px';
        }

        function onMouseUp() {
          document.removeEventListener('mousemove', onMouseMove);
          document.removeEventListener('mouseup', onMouseUp);
          // Persist the new size back to content
          const imgId = img.dataset.imgId;
          const newW = Math.round(img.offsetWidth);
          const newH = Math.round(img.offsetHeight);
          persistImageSize(imgId, newW, newH);
        }

        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
      });
    });
  }

  function persistImageSize(imgId, width, height) {
    const nb = getActiveNotebook();
    if (!nb) return;
    const activePage = getActivePage();
    if (!activePage) return;

    // Replace the token with updated dimensions
    // Match both {{img:id}} and {{img:id:oldW:oldH}}
    const tokenRegex = new RegExp('\\{\\{img:' + imgId.replace(/[-]/g, '\\-') + '(?::\\d+:\\d+)?\\}\\}');
    const newToken = '{{img:' + imgId + ':' + width + ':' + height + '}}';
    activePage.content = activePage.content.replace(tokenRegex, newToken);
    activePage.updatedAt = new Date().toISOString();
    debouncedSave();
  }

  function renderJsonTree(obj, indent) {
    indent = indent || 0;
    if (obj === null) return '<span class="json-null">null</span>';
    if (typeof obj === 'boolean') return '<span class="json-boolean">' + obj + '</span>';
    if (typeof obj === 'number') return '<span class="json-number">' + obj + '</span>';
    if (typeof obj === 'string') return '<span class="json-string">"' + escapeHtml(obj) + '"</span>';

    if (Array.isArray(obj)) {
      if (obj.length === 0) return '<span class="json-bracket">[]</span>';
      let html = '<span class="json-collapsible json-bracket">[</span>';
      html += '<div class="json-children">';
      obj.forEach((item, i) => {
        html += renderJsonTree(item, indent + 1);
        if (i < obj.length - 1) html += ',';
        html += '<br>';
      });
      html += '</div><span class="json-bracket">]</span>';
      return html;
    }

    if (typeof obj === 'object') {
      const keys = Object.keys(obj);
      if (keys.length === 0) return '<span class="json-bracket">{}</span>';
      let html = '<span class="json-collapsible json-bracket">{</span>';
      html += '<div class="json-children">';
      keys.forEach((key, i) => {
        html += '<span class="json-key">"' + escapeHtml(key) + '"</span>: ';
        html += renderJsonTree(obj[key], indent + 1);
        if (i < keys.length - 1) html += ',';
        html += '<br>';
      });
      html += '</div><span class="json-bracket">}</span>';
      return html;
    }

    return escapeHtml(String(obj));
  }

  function attachJsonCollapsibles() {
    previewEl.querySelectorAll('.json-collapsible').forEach(el => {
      el.addEventListener('click', () => {
        el.classList.toggle('collapsed');
      });
    });
  }

  // escapeHtml, getContrastColor imported from NoteUtils

  // ===== Auto-detect content type =====
  function detectContentType(text) {
    const trimmed = text.trim();
    if ((trimmed.startsWith('{') && trimmed.endsWith('}')) ||
        (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
      try {
        JSON.parse(trimmed);
        return 'json';
      } catch (e) { /* not json */ }
    }
    const lines = trimmed.split('\n').slice(0, 5);
    const yamlPattern = /^[a-zA-Z][\w-]*:\s+.+$/;
    if (lines.filter(l => yamlPattern.test(l)).length >= 2) {
      return 'yaml';
    }
    if (/^#{1,6}\s/.test(trimmed) || /\[.+\]\(.+\)/.test(trimmed) || /^\s*[-*]\s/.test(trimmed)) {
      return 'markdown';
    }
    return null;
  }

  // ===== Event Handlers =====
  addTabBtn.addEventListener('click', () => {
    const nb = getActiveNotebook();
    if (!nb) return;
    const newTab = {
      id: generateId('group'),
      name: 'New Tab',
      isFolder: false,
      parentTabId: nb.activeFolderId,
      color: null,
      pages: []
    };
    nb.tabs.push(newTab);
    nb.activeTabId = newTab.id;
    nb.activePageId = null;
    debouncedSave();
    render();

    // Auto-focus rename
    setTimeout(() => {
      const tabs = tabsEl.querySelectorAll('.group-tab');
      const lastTab = tabs[tabs.length - 1];
      if (lastTab) startEditTabName(lastTab, newTab);
    }, 50);
  });

  // Add container button
  const addFolderBtn = document.getElementById('add-container-btn');
  addFolderBtn.addEventListener('click', () => {
    const nb = getActiveNotebook();
    if (!nb) return;
    const newFolder = {
      id: generateId('container'),
      name: 'New Folder',
      isFolder: true,
      parentTabId: nb.activeFolderId,
      color: null,
      pages: []
    };
    nb.tabs.push(newFolder);

    // Stay at the current level so user can rename the container first
    debouncedSave();
    render();

    // Auto-focus rename on the new container tab
    setTimeout(() => {
      const containerTabsEl = document.getElementById('container-tabs');
      const tabs = containerTabsEl.querySelectorAll('.group-tab');
      const lastTab = tabs[tabs.length - 1];
      if (lastTab) startEditTabName(lastTab, newFolder);
    }, 50);
  });

  // ===== Page Labels =====
  function renderContentLabels(page) {
    const labelsEl = document.getElementById('content-labels');
    labelsEl.innerHTML = '';
    const nb = getActiveNotebook();
    if (!nb) return;
    if (!nb.labels) nb.labels = [];
    const pageLabels = page.labelIds || [];

    // Render assigned label pills
    pageLabels.forEach(lblId => {
      let lbl = nb.labels.find(l => l.id === lblId);
      if (!lbl && state.globalLabels) lbl = state.globalLabels.find(l => l.id === lblId);
      if (!lbl) return;
      const pill = document.createElement('span');
      pill.className = 'content-label-pill';

      // Check if this label has an associated macro
      const hasMacro = state.macros && state.macros.find(m => m.labelId === lblId);
      if (hasMacro) {
        pill.classList.add('content-label-pill-macro');
        pill.title = 'Click to run: ' + (window.PluginRegistry.get(hasMacro.pluginId) || {}).name;
        pill.addEventListener('click', () => {
          window.PluginRegistry.execute(hasMacro.pluginId, page.content || '', page);
        });
      }

      pill.innerHTML = '<span class="pill-dot" style="background:' + lbl.color + '"></span>' + escapeHtml(lbl.name) + (hasMacro ? ' ▶' : '');
      labelsEl.appendChild(pill);
    });

    // Add label button
    const addBtn = document.createElement('span');
    addBtn.className = 'add-label-trigger';
    addBtn.textContent = '+ Label';
    addBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      showLabelDropdown(addBtn, page);
    });
    labelsEl.appendChild(addBtn);
  }

  let activeLabelDropdown = null;

  function closeLabelDropdown() {
    if (activeLabelDropdown) {
      activeLabelDropdown.remove();
      activeLabelDropdown = null;
    }
  }

  document.addEventListener('click', closeLabelDropdown);

  function showLabelDropdown(triggerEl, page) {
    closeLabelDropdown();
    const nb = getActiveNotebook();
    if (!nb) return;
    if (!nb.labels) nb.labels = [];
    if (!page.labelIds) page.labelIds = [];

    const dropdown = document.createElement('div');
    dropdown.className = 'label-dropdown';

    // Combine notebook labels + global labels
    const allLabels = (nb.labels || []).slice();
    const globalLabels = (state.globalLabels || []).map(l => Object.assign({}, l, { isGlobal: true }));
    globalLabels.forEach(gl => {
      if (!allLabels.find(l => l.id === gl.id)) allLabels.push(gl);
    });

    if (allLabels.length === 0) {
      dropdown.innerHTML = '<div class="label-dropdown-empty">No labels yet. Use ☰ menu → Manage Labels to create one.</div>';
    } else {
      // Sort: assigned labels first, then unassigned alphabetically
      const sorted = allLabels.slice().sort((a, b) => {
        const aAssigned = page.labelIds.includes(a.id);
        const bAssigned = page.labelIds.includes(b.id);
        if (aAssigned && !bAssigned) return -1;
        if (!aAssigned && bAssigned) return 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
      });
      sorted.forEach(lbl => {
        const item = document.createElement('div');
        item.className = 'label-dropdown-item';
        const isAssigned = page.labelIds.includes(lbl.id);
        const globalIndicator = lbl.isGlobal ? ' <span style="font-size:10px;color:var(--text-muted)">⊛</span>' : '';
        item.innerHTML = '<span class="lbl-dot" style="background:' + lbl.color + '"></span><span>' + escapeHtml(lbl.name) + globalIndicator + '</span>' + (isAssigned ? '<span class="lbl-check">✓</span>' : '');
        item.addEventListener('click', (e) => {
          e.stopPropagation();
          if (isAssigned) {
            page.labelIds = page.labelIds.filter(id => id !== lbl.id);
          } else {
            page.labelIds.push(lbl.id);
          }
          debouncedSave();
          renderContentLabels(page);
          renderPages();
          showLabelDropdown(document.querySelector('.add-label-trigger'), page);
        });
        dropdown.appendChild(item);
      });
    }

    // Position below trigger
    document.body.appendChild(dropdown);
    activeLabelDropdown = dropdown;
    const rect = triggerEl.getBoundingClientRect();
    dropdown.style.left = rect.left + 'px';
    dropdown.style.top = (rect.bottom + 4) + 'px';
  }

  // ===== Manage Labels Modal =====
  function showManageLabelsModal() {
    const nb = getActiveNotebook();
    if (!nb) return;
    if (!nb.labels) nb.labels = [];

    const overlay = document.createElement('div');
    overlay.className = 'move-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'manage-labels-modal';

    const header = document.createElement('div');
    header.className = 'move-modal-header';
    header.innerHTML = '<span>Manage Labels</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const list = document.createElement('div');
    list.className = 'manage-labels-list';

    function renderList() {
      list.innerHTML = '';
      nb.labels.forEach(lbl => {
        const row = document.createElement('div');
        row.className = 'manage-label-row';
        row.innerHTML = '<span class="lbl-dot" style="background:' + lbl.color + ';width:12px;height:12px;border-radius:50%;flex-shrink:0"></span><span class="manage-label-name">' + escapeHtml(lbl.name) + '</span>';

        const actions = document.createElement('span');
        actions.className = 'manage-label-actions';

        const editBtn = document.createElement('button');
        editBtn.textContent = '✎';
        editBtn.title = 'Rename';
        editBtn.addEventListener('click', () => {
          const newName = prompt('Rename label:', lbl.name);
          if (newName && newName.trim()) {
            lbl.name = newName.trim();
            debouncedSave();
            renderList();
          }
        });

        const colorBtn = document.createElement('button');
        colorBtn.textContent = '🎨';
        colorBtn.title = 'Change color';
        colorBtn.addEventListener('click', () => {
          const input = document.createElement('input');
          input.type = 'color';
          input.value = lbl.color;
          input.style.position = 'fixed';
          input.style.top = '-100px';
          document.body.appendChild(input);
          input.addEventListener('input', () => { lbl.color = input.value; debouncedSave(); renderList(); });
          input.addEventListener('change', () => { setTimeout(() => input.remove(), 100); });
          input.click();
        });

        const delBtn = document.createElement('button');
        delBtn.textContent = '✕';
        delBtn.title = 'Delete';
        delBtn.addEventListener('click', () => {
          if (!confirm('Delete label "' + lbl.name + '"? It will be removed from all pages.')) return;
          nb.labels = nb.labels.filter(l => l.id !== lbl.id);
          // Remove from all pages
          nb.tabs.forEach(t => {
            t.pages.forEach(p => {
              if (p.labelIds) p.labelIds = p.labelIds.filter(id => id !== lbl.id);
            });
          });
          debouncedSave();
          renderList();
        });

        actions.appendChild(editBtn);
        actions.appendChild(colorBtn);
        actions.appendChild(delBtn);
        row.appendChild(actions);
        list.appendChild(row);
      });
    }

    renderList();
    modal.appendChild(list);

    // Add new label form
    const addForm = document.createElement('div');
    addForm.className = 'manage-labels-add';
    const nameInput = document.createElement('input');
    nameInput.type = 'text';
    nameInput.placeholder = 'New label name...';
    const addBtnEl = document.createElement('button');
    addBtnEl.className = 'admin-action-btn';
    addBtnEl.textContent = '+ Add';
    addBtnEl.style.padding = '6px 12px';
    addBtnEl.style.fontSize = '12px';
    addBtnEl.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) return;
      if (nb.labels.find(l => l.name === name)) {
        alert('Label "' + name + '" already exists.');
        return;
      }
      const colors = ['#f38ba8', '#f9e2af', '#89b4fa', '#a6e3a1', '#cba6f7', '#fab387', '#94e2d5'];
      nb.labels.push({ id: generateId('lbl'), name: name, color: colors[nb.labels.length % colors.length] });
      nameInput.value = '';
      debouncedSave();
      renderList();
      list.scrollTop = list.scrollHeight;
    });
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') addBtnEl.click(); });
    addForm.appendChild(nameInput);
    addForm.appendChild(addBtnEl);
    modal.appendChild(addForm);

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  }

  // ===== All Favorites Button =====
  document.getElementById('all-fav-btn').addEventListener('click', () => {
    window.FavoritesPanel.toggle();
  });

  // ===== Page Menu (hamburger) =====
  const pageMenuBtn = document.getElementById('page-menu-btn');
  pageMenuBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const rect = pageMenuBtn.getBoundingClientRect();
    showPageMenu(rect.left, rect.bottom + 4);
  });

  function showPageMenu(x, y) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    const defaultItem = createMenuItem('○', 'Default');
    defaultItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      timedViewActive = false;
      favoritesViewActive = false;
      renderPages();
    });
    menu.appendChild(defaultItem);

    // Favorites view (current tab only)
    const favItem = createMenuItem('★', favoritesViewActive ? 'Show All Pages' : 'Favorites (This Tab)');
    favItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      favoritesViewActive = !favoritesViewActive;
      timedViewActive = false;
      renderPages();
    });
    menu.appendChild(favItem);

    menu.appendChild(createSeparator());

    const sortAscItem = createMenuItem('↑', 'Sort A → Z');
    sortAscItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      sortPages('name', 'asc');
    });
    menu.appendChild(sortAscItem);

    const sortDescItem = createMenuItem('↓', 'Sort Z → A');
    sortDescItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      sortPages('name', 'desc');
    });
    menu.appendChild(sortDescItem);

    menu.appendChild(createSeparator());

    const sortCreatedAsc = createMenuItem('↑', 'Created: Oldest first');
    sortCreatedAsc.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      sortPages('createdAt', 'asc');
    });
    menu.appendChild(sortCreatedAsc);

    const sortCreatedDesc = createMenuItem('↓', 'Created: Newest first');
    sortCreatedDesc.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      sortPages('createdAt', 'desc');
    });
    menu.appendChild(sortCreatedDesc);

    menu.appendChild(createSeparator());

    const sortModifiedAsc = createMenuItem('↑', 'Modified: Oldest first');
    sortModifiedAsc.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      sortPages('updatedAt', 'asc');
    });
    menu.appendChild(sortModifiedAsc);

    const sortModifiedDesc = createMenuItem('↓', 'Modified: Newest first');
    sortModifiedDesc.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      sortPages('updatedAt', 'desc');
    });
    menu.appendChild(sortModifiedDesc);

    menu.appendChild(createSeparator());

    const timedViewItem = createMenuItem('🕐', 'Timed View');
    timedViewItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      activateTimedView();
    });
    menu.appendChild(timedViewItem);

    // Clear timed view option (only show if active)
    if (timedViewActive) {
      const clearTimedItem = createMenuItem('✕', 'Clear Timed View');
      clearTimedItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        timedViewActive = false;
        renderPages();
      });
      menu.appendChild(clearTimedItem);
    }

    menu.appendChild(createSeparator());

    // Manage Labels
    const manageLabelsItem = createMenuItem('🏷', 'Manage Labels');
    manageLabelsItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      showManageLabelsModal();
    });
    menu.appendChild(manageLabelsItem);

    // Filter by Label
    const nb = getActiveNotebook();
    if (nb && nb.labels && nb.labels.length > 0) {
      const filterItem = createMenuItem('🔍', activeLabelFilter ? 'Clear Filter' : 'Filter by Label');
      filterItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        if (activeLabelFilter) {
          activeLabelFilter = null;
          renderPages();
        } else {
          showFilterLabelDropdown(x, y);
        }
      });
      menu.appendChild(filterItem);
    }

    document.body.appendChild(menu);
    activeContextMenu = menu;

    const menuRect = menu.getBoundingClientRect();
    if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 8;
    if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  // ===== Timed View =====
  let timedViewActive = false;
  let favoritesViewActive = false;
  let activeLabelFilter = null; // null = no filter, or label ID

  function showFilterLabelDropdown(x, y) {
    closeContextMenu();
    const nb = getActiveNotebook();
    if (!nb || !nb.labels) return;

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    nb.labels.forEach(lbl => {
      const item = document.createElement('div');
      item.className = 'context-menu-item';
      item.innerHTML = '<span class="lbl-dot" style="background:' + lbl.color + ';width:10px;height:10px;border-radius:50%;display:inline-block"></span><span>' + escapeHtml(lbl.name) + '</span>';
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        activeLabelFilter = lbl.id;
        renderPages();
      });
      menu.appendChild(item);
    });

    document.body.appendChild(menu);
    activeContextMenu = menu;
    const menuRect = menu.getBoundingClientRect();
    if (x + menuRect.width > window.innerWidth) x = window.innerWidth - menuRect.width - 8;
    if (y + menuRect.height > window.innerHeight) y = window.innerHeight - menuRect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  function activateTimedView() {
    // Sort by newest first, then activate timed view
    sortPages('updatedAt', 'desc');
    timedViewActive = true;
    renderPages();
  }

  function sortPages(field, direction) {
    timedViewActive = false;
    const nb = getActiveNotebook();
    if (!nb) return;
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.isFolder) return;

    // Sort top-level pages, keep children attached to their parents
    const topLevel = activeTab.pages.filter(l => !l.parentPageId);

    topLevel.sort((a, b) => {
      return comparePages(a, b, field, direction);
    });

    // Rebuild pages array: top-level in sorted order, each followed by its children
    const sorted = [];
    topLevel.forEach(parent => {
      sorted.push(parent);
      appendChildrenSorted(activeTab, parent.id, sorted, field, direction);
    });

    // Add any orphans (shouldn't happen, but just in case)
    activeTab.pages.forEach(l => {
      if (!sorted.includes(l)) sorted.push(l);
    });

    activeTab.pages = sorted;
    debouncedSave();
    renderPages();
  }

  function appendChildrenSorted(tab, parentId, result, field, direction) {
    const kids = tab.pages.filter(l => l.parentPageId === parentId);
    kids.sort((a, b) => {
      return comparePages(a, b, field, direction);
    });
    kids.forEach(child => {
      result.push(child);
      appendChildrenSorted(tab, child.id, result, field, direction);
    });
  }

  function comparePages(a, b, field, direction) {
    let cmp = 0;
    if (field === 'name') {
      cmp = a.name.localeCompare(b.name, undefined, { sensitivity: 'base' });
    } else {
      // Date fields (createdAt, updatedAt)
      const aVal = a[field] || '';
      const bVal = b[field] || '';
      cmp = aVal.localeCompare(bVal);
    }
    return direction === 'asc' ? cmp : -cmp;
  }

  addPageBtn.addEventListener('click', () => {
    const nb = getActiveNotebook();
    if (!nb) return;
    const activeTab = getActiveTab();
    if (!activeTab || activeTab.isFolder) return;

    pageCounter++;
    const defaultName = 'Untitled Page ' + pageCounter;
    const newPage = {
      id: generateId('label'),
      name: defaultName,
      contentType: 'markdown',
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: null,
      parentPageId: null
    };
    activeTab.pages.push(newPage);
    nb.activePageId = newPage.id;
    debouncedSave();
    render();
    pageListEl.scrollTop = pageListEl.scrollHeight;

    setTimeout(() => {
      const li = pageListEl.querySelector('[data-id="' + newPage.id + '"]');
      if (li) {
        const nameSpan = li.querySelector('.label-name');
        startEditPageName(li, nameSpan, newPage);
      }
    }, 100);
  });

  // Copy content to clipboard
  document.getElementById('copy-content-btn').addEventListener('click', () => {
    const activePage = getActivePage();
    if (!activePage || !activePage.content) return;
    navigator.clipboard.writeText(activePage.content).then(() => {
      const btn = document.getElementById('copy-content-btn');
      btn.title = 'Copied!';
      btn.style.color = 'var(--accent-green)';
      setTimeout(() => {
        btn.title = 'Copy content to clipboard';
        btn.style.color = '';
      }, 1500);
    });
  });

  // Copy page link to clipboard
  document.getElementById('copy-link-btn').addEventListener('click', () => {
    const activePage = getActivePage();
    if (!activePage) return;
    const link = '[' + activePage.name + '](nb://' + activePage.id + ')';
    navigator.clipboard.writeText(link).then(() => {
      const btn = document.getElementById('copy-link-btn');
      btn.title = 'Link copied!';
      btn.style.color = 'var(--accent-green)';
      setTimeout(() => {
        btn.title = 'Copy page link';
        btn.style.color = '';
      }, 1500);
    });
  });

  formatSelector.addEventListener('change', () => {
    const activePage = getActivePage();
    if (!activePage) return;
    activePage.contentType = formatSelector.value;
    debouncedSave();
    if (currentMode === 'preview') renderPreview(activePage);
  });

  editorEl.addEventListener('input', () => {
    const activePage = getActivePage();
    if (!activePage) return;
    activePage.content = editorEl.value;
    activePage.updatedAt = new Date().toISOString();
    debouncedSave();
  });

  editorEl.addEventListener('paste', (e) => {
    // Check for pasted images
    const items = e.clipboardData && e.clipboardData.items;
    if (items) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].type.indexOf('image') !== -1) {
          e.preventDefault();
          const blob = items[i].getAsFile();
          if (blob) {
            handleImagePaste(blob);
          }
          return;
        }
      }
    }

    // Fallback: auto-detect content type for text paste
    setTimeout(() => {
      const activePage = getActivePage();
      if (!activePage) return;
      const detected = detectContentType(editorEl.value);
      if (detected && detected !== activePage.contentType) {
        activePage.contentType = detected;
        formatSelector.value = detected;
        debouncedSave();
      }
    }, 50);
  });

  function handleImagePaste(blob) {
    const activePage = getActivePage();
    if (!activePage) return;

    const imgId = generateId('img');

    // Compress and store
    compressImage(blob, 1200, 0.8).then((compressed) => {
      return storeImage(imgId, compressed, 'image/jpeg');
    }).then(() => {
      // Insert token at cursor position
      const token = '{{img:' + imgId + '}}';
      const start = editorEl.selectionStart;
      const end = editorEl.selectionEnd;
      const text = editorEl.value;
      editorEl.value = text.substring(0, start) + token + text.substring(end);
      editorEl.selectionStart = editorEl.selectionEnd = start + token.length;

      // Update label
      activePage.content = editorEl.value;
      activePage.updatedAt = new Date().toISOString();
      debouncedSave();
    }).catch((err) => {
      console.warn('Failed to store image:', err);
    });
  }

  btnEdit.addEventListener('click', () => {
    currentMode = 'edit';
    btnEdit.classList.add('active');
    btnPreview.classList.remove('active');
    renderContent();
  });

  btnPreview.addEventListener('click', () => {
    currentMode = 'preview';
    btnPreview.classList.add('active');
    btnEdit.classList.remove('active');
    renderContent();
  });

  // ===== Notebook Management =====
  const notebookDropdown = document.getElementById('notebook-dropdown');

  function renderNotebookSelector() {
    notebookDropdown.innerHTML = '';
    state.notebooks.forEach(nb => {
      const opt = document.createElement('option');
      opt.value = nb.id;
      opt.textContent = nb.name;
      if (nb.id === state.activeNotebookId) opt.selected = true;
      notebookDropdown.appendChild(opt);
    });
    // Apply active notebook color to dropdown
    const activeNb = getActiveNotebook();
    if (activeNb && activeNb.color) {
      notebookDropdown.style.background = activeNb.color;
      notebookDropdown.style.color = getContrastColor(activeNb.color);
      notebookDropdown.style.borderColor = activeNb.color;
    } else {
      notebookDropdown.style.background = '';
      notebookDropdown.style.color = '';
      notebookDropdown.style.borderColor = '';
    }
  }

  notebookDropdown.addEventListener('change', () => {
    state.activeNotebookId = notebookDropdown.value;
    debouncedSave();
    render();
  });

  // Double-click to rename notebook
  notebookDropdown.addEventListener('dblclick', () => {
    const nb = getActiveNotebook();
    if (!nb) return;
    renameNotebook(nb);
  });

  // Right-click context menu on notebook dropdown
  notebookDropdown.addEventListener('contextmenu', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const nb = getActiveNotebook();
    if (!nb) return;
    showNotebookContextMenu(e.clientX, e.clientY, nb);
  });

  function showNotebookContextMenu(x, y, nb) {
    closeContextMenu();

    const menu = document.createElement('div');
    menu.className = 'context-menu';

    // Rename
    const renameItem = createMenuItem('✎', 'Rename Notebook');
    renameItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      renameNotebook(nb);
    });
    menu.appendChild(renameItem);

    // Set Color
    const colorItem = createMenuItem('🎨', 'Set Color');
    colorItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      showNotebookColorPicker(nb);
    });
    menu.appendChild(colorItem);

    // Remove Color (only if color is set)
    if (nb.color) {
      const removeColorItem = createMenuItem('🚫', 'Remove Color');
      removeColorItem.addEventListener('click', (e) => {
        e.stopPropagation();
        closeContextMenu();
        nb.color = null;
        debouncedSave();
        renderNotebookSelector();
      });
      menu.appendChild(removeColorItem);
    }

    menu.appendChild(createSeparator());

    // Add new notebook
    const addItem = createMenuItem('＋', 'New Notebook');
    addItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      addNewNotebook();
    });
    menu.appendChild(addItem);

    menu.appendChild(createSeparator());

    // Delete
    const deleteItem = createMenuItem('🗑', 'Delete Notebook', true);
    deleteItem.addEventListener('click', (e) => {
      e.stopPropagation();
      closeContextMenu();
      deleteNotebook(nb);
    });
    menu.appendChild(deleteItem);

    document.body.appendChild(menu);
    activeContextMenu = menu;

    const rect = menu.getBoundingClientRect();
    if (x + rect.width > window.innerWidth) x = window.innerWidth - rect.width - 8;
    if (y + rect.height > window.innerHeight) y = window.innerHeight - rect.height - 8;
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
  }

  function showNotebookColorPicker(nb) {
    const input = document.createElement('input');
    input.type = 'color';
    input.value = nb.color || '#313244';
    input.style.position = 'fixed';
    input.style.top = '-100px';
    input.style.left = '-100px';
    document.body.appendChild(input);

    input.addEventListener('input', () => {
      nb.color = input.value;
      debouncedSave();
      renderNotebookSelector();
    });

    input.addEventListener('change', () => {
      nb.color = input.value;
      debouncedSave();
      renderNotebookSelector();
      setTimeout(() => input.remove(), 100);
    });

    input.addEventListener('blur', () => {
      setTimeout(() => input.remove(), 200);
    });

    input.click();
  }

  function renameNotebook(nb) {
    const newName = prompt('Rename notebook:', nb.name);
    if (newName && newName.trim()) {
      const trimmed = newName.trim();
      const exists = state.notebooks.find(n => n.name === trimmed && n.id !== nb.id);
      if (exists) {
        alert('A notebook with this name already exists. Please choose a unique name.');
        return;
      }
      nb.name = trimmed;
      debouncedSave();
      renderNotebookSelector();
    }
  }

  function deleteNotebook(nb) {
    // Check if this is the last notebook
    if (state.notebooks.length <= 1) {
      alert('Cannot delete the last notebook. At least one notebook must exist.');
      return;
    }

    // Count total pages across all tabs in this notebook
    let totalPages = 0;
    nb.tabs.forEach(g => { totalPages += g.pages.length; });

    if (totalPages > 0) {
      alert('Cannot delete notebook "' + nb.name + '" because it contains ' + totalPages + ' page(s).\n\nPlease remove all pages first before deleting the notebook.');
      return;
    }

    if (!confirm('Are you sure you want to delete the notebook "' + nb.name + '"?')) return;

    const idx = state.notebooks.indexOf(nb);
    if (idx === -1) return;
    state.notebooks.splice(idx, 1);

    // Switch to another notebook
    state.activeNotebookId = state.notebooks[0].id;
    debouncedSave();
    render();
  }

  function addNewNotebook() {
    let name = prompt('New notebook name:');
    if (!name || !name.trim()) return;
    name = name.trim();
    // Check uniqueness
    const exists = state.notebooks.find(n => n.name === name);
    if (exists) {
      alert('A notebook with this name already exists. Please choose a unique name.');
      return;
    }
    const newNb = {
      id: generateId('notebook'),
      name: name,
      activeTabId: null,
      activePageId: null,
      activeFolderId: null,
      collapsedPages: {},
      activePagePerTab: {},
      tabs: [
        {
          id: generateId('group'),
          name: 'General',
          isFolder: false,
          parentTabId: null,
          color: null,
          pages: []
        }
      ]
    };
    state.notebooks.push(newNb);
    state.activeNotebookId = newNb.id;
    debouncedSave();
    render();
  }

  // ===== Main Render =====
  function render() {
    renderNotebookSelector();
    renderBreadcrumb();
    renderTabs();
    renderPages();
    renderContent();
    // Refresh Lucide icons for any dynamically added elements
    if (window.lucide) lucide.createIcons();
  }

  // ===== Admin Panel =====
  const adminBtn = document.getElementById('admin-btn');
  const adminPanel = document.getElementById('admin-panel');
  const adminCloseBtn = document.getElementById('admin-close-btn');
  const exportBtn = document.getElementById('export-btn');
  const restoreBtn = document.getElementById('restore-btn');
  const restoreFileInput = document.getElementById('restore-file-input');
  const exportStatus = document.getElementById('export-status');
  const restoreStatus = document.getElementById('restore-status');
  const exportNotebookStatus = document.getElementById('export-notebook-status');
  const restoreNotebookStatus = document.getElementById('restore-notebook-status');
  const storageInfoEl = document.getElementById('storage-info');
  const saveServerBtn = document.getElementById('save-server-btn');
  const saveServerStatus = document.getElementById('save-server-status');
  const serverBackupsEl = document.getElementById('server-backups');

  adminBtn.addEventListener('click', () => {
    adminPanel.classList.remove('hidden');
    updateStorageInfo();
    loadServerBackups();
    populateExportNotebookSelect();
  });

  // Top-level admin tab switching
  document.querySelectorAll('.admin-tab-top').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab-top').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-top-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      const target = document.getElementById(tab.dataset.adminTab);
      if (target) target.classList.remove('hidden');
    });
  });

  // Backup sub-tab switching
  document.querySelectorAll('.admin-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.admin-tab-content').forEach(c => c.classList.add('hidden'));
      tab.classList.add('active');
      const target = document.getElementById('tab-' + tab.dataset.tab);
      if (target) target.classList.remove('hidden');
    });
  });

  adminCloseBtn.addEventListener('click', () => {
    adminPanel.classList.add('hidden');
  });

  // Scroll-to-top floating button in admin panel
  const adminScrollTopBtn = document.getElementById('admin-scroll-top');

  adminPanel.addEventListener('scroll', () => {
    const headerHeight = adminPanel.querySelector('.admin-header').offsetHeight;
    if (adminPanel.scrollTop > headerHeight) {
      adminScrollTopBtn.classList.remove('hidden');
    } else {
      adminScrollTopBtn.classList.add('hidden');
    }
  });

  adminScrollTopBtn.addEventListener('click', () => {
    adminPanel.scrollTo({ top: 0, behavior: 'smooth' });
  });

  function populateExportNotebookSelect() {
    const select = document.getElementById('export-notebook-select');
    select.innerHTML = '';
    state.notebooks.forEach(nb => {
      const opt = document.createElement('option');
      opt.value = nb.id;
      opt.textContent = nb.name;
      select.appendChild(opt);
    });
    updateNotebookStorageInfo();
  }

  // Update notebook storage info when selection changes
  document.getElementById('export-notebook-select').addEventListener('change', updateNotebookStorageInfo);

  function updateNotebookStorageInfo() {
    const select = document.getElementById('export-notebook-select');
    const nbId = select.value;
    const nb = state.notebooks.find(n => n.id === nbId);
    const infoEl = document.getElementById('notebook-storage-info');
    if (!nb || !infoEl) return;

    let totalTabs = nb.tabs.filter(g => !g.isFolder).length;
    let totalFolders = nb.tabs.filter(g => g.isFolder).length;
    let totalPages = 0;
    let imageIds = new Set();
    nb.tabs.forEach(g => {
      totalPages += g.pages.length;
      g.pages.forEach(l => {
        const matches = (l.content || '').matchAll(/\{\{img:([\w-]+)(?::\d+:\d+)?\}\}/g);
        for (const m of matches) imageIds.add(m[1]);
      });
    });

    infoEl.innerHTML =
      '<div class="info-row"><span class="info-label">Notebook</span><span class="info-value">' + nb.name + '</span></div>' +
      '<div class="info-row"><span class="info-label">Tabs</span><span class="info-value">' + totalTabs + '</span></div>' +
      '<div class="info-row"><span class="info-label">Folders</span><span class="info-value">' + totalFolders + '</span></div>' +
      '<div class="info-row"><span class="info-label">Pages</span><span class="info-value">' + totalPages + '</span></div>' +
      '<div class="info-row"><span class="info-label">Images referenced</span><span class="info-value">' + imageIds.size + '</span></div>';
  }

  // ===== Export =====
  exportBtn.addEventListener('click', async () => {
    exportBtn.disabled = true;
    exportStatus.className = 'admin-status info';
    exportStatus.textContent = 'Preparing export...';

    try {
      const zip = new JSZip();

      // Add state.json
      const stateData = localStorage.getItem(STORAGE_KEY);
      zip.file('state.json', stateData || '{}');

      // Add images from IndexedDB
      exportStatus.textContent = 'Reading images from storage...';
      const allImages = await getAllImages();
      if (allImages.length > 0) {
        const imgFolder = zip.folder('images');
        for (const img of allImages) {
          const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
          imgFolder.file(img.id + ext, img.blob);
        }
      }

      // Generate ZIP
      exportStatus.textContent = 'Generating ZIP file...';
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      // Download
      const date = new Date().toISOString().slice(0, 10);
      const filename = 'notebook-backup-' + date + '.zip';
      downloadBlob(blob, filename);

      exportStatus.className = 'admin-status success';
      exportStatus.textContent = '✓ Backup exported: ' + filename + ' (' + formatBytes(blob.size) + ')';
    } catch (err) {
      exportStatus.className = 'admin-status error';
      exportStatus.textContent = '✕ Export failed: ' + err.message;
      console.error('Export error:', err);
    } finally {
      exportBtn.disabled = false;
    }
  });

  // ===== Export Single Notebook =====
  const exportNotebookBtn = document.getElementById('export-notebook-btn');
  exportNotebookBtn.addEventListener('click', async () => {
    const selectEl = document.getElementById('export-notebook-select');
    const nbId = selectEl.value;
    const nb = state.notebooks.find(n => n.id === nbId);
    if (!nb) return;

    exportNotebookBtn.disabled = true;
    exportNotebookStatus.className = 'admin-status info';
    exportNotebookStatus.textContent = 'Exporting notebook "' + nb.name + '"...';

    try {
      const zip = new JSZip();

      // Create a state with just this notebook
      const singleState = {
        activeNotebookId: nb.id,
        notebooks: [nb]
      };
      zip.file('state.json', JSON.stringify(singleState));

      // Find all image IDs referenced in this notebook's pages
      const imageIds = new Set();
      nb.tabs.forEach(g => {
        g.pages.forEach(l => {
          const matches = (l.content || '').matchAll(/\{\{img:([\w-]+)(?::\d+:\d+)?\}\}/g);
          for (const m of matches) imageIds.add(m[1]);
        });
      });

      // Export only referenced images
      if (imageIds.size > 0) {
        exportNotebookStatus.textContent = 'Exporting ' + imageIds.size + ' image(s)...';
        const imgFolder = zip.folder('images');
        for (const imgId of imageIds) {
          const img = await getImage(imgId);
          if (img && img.blob) {
            const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
            imgFolder.file(img.id + ext, img.blob);
          }
        }
      }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
      const date = new Date().toISOString().slice(0, 10);
      const filename = 'notebook-' + nb.name.replace(/[^a-zA-Z0-9]/g, '-') + '-' + date + '.zip';
      downloadBlob(blob, filename);

      exportNotebookStatus.className = 'admin-status success';
      exportNotebookStatus.textContent = '✓ Notebook "' + nb.name + '" exported: ' + filename + ' (' + formatBytes(blob.size) + ')';
    } catch (err) {
      exportNotebookStatus.className = 'admin-status error';
      exportNotebookStatus.textContent = '✕ Export failed: ' + err.message;
    } finally {
      exportNotebookBtn.disabled = false;
    }
  });

  // ===== Restore =====
  restoreBtn.addEventListener('click', () => {
    if (!confirm('This will replace ALL current notes and images with the backup data.\n\nAre you sure you want to continue?')) return;
    restoreFileInput.click();
  });

  // ===== Import as Notebook =====
  const restoreNotebookBtn = document.getElementById('restore-notebook-btn');
  const restoreNotebookFileInput = document.getElementById('restore-notebook-file-input');

  restoreNotebookBtn.addEventListener('click', () => {
    restoreNotebookFileInput.click();
  });

  restoreNotebookFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    restoreNotebookFileInput.value = '';

    restoreNotebookBtn.disabled = true;
    restoreNotebookStatus.className = 'admin-status info';
    restoreNotebookStatus.textContent = 'Reading backup file...';

    try {
      const zip = await JSZip.loadAsync(file);
      const stateFile = zip.file('state.json');
      if (!stateFile) throw new Error('Invalid backup: state.json not found.');

      const stateText = await stateFile.async('string');
      const parsedState = JSON.parse(stateText);

      // Extract notebooks from backup
      let importNotebooks = [];
      if (parsedState.notebooks && Array.isArray(parsedState.notebooks)) {
        importNotebooks = parsedState.notebooks;
      } else if (parsedState.tabs && Array.isArray(parsedState.tabs)) {
        // Old format: wrap into a notebook
        importNotebooks = [{
          id: generateId('notebook'),
          name: 'Imported Notebook',
          activeTabId: parsedState.activeTabId || null,
          activePageId: parsedState.activePageId || null,
          activeFolderId: parsedState.activeFolderId || null,
          collapsedPages: parsedState.collapsedPages || {},
          activePagePerTab: parsedState.activePagePerTab || {},
          tabs: parsedState.tabs
        }];
      } else {
        throw new Error('Invalid backup structure.');
      }

      // Ensure unique notebook names
      importNotebooks.forEach(nb => {
        nb.id = generateId('notebook'); // New ID to avoid conflicts
        let name = nb.name;
        let counter = 1;
        while (state.notebooks.find(n => n.name === name)) {
          name = nb.name + ' (' + counter + ')';
          counter++;
        }
        nb.name = name;
      });

      // Import images
      restoreNotebookStatus.textContent = 'Importing images...';
      const imgFolder = zip.folder('images');
      let imageCount = 0;
      if (imgFolder) {
        const imageFiles = [];
        imgFolder.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) imageFiles.push(zipEntry);
        });
        for (const imgFile of imageFiles) {
          const blob = await imgFile.async('blob');
          const fileName = imgFile.name.replace('images/', '');
          const id = fileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
          const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
          await storeImage(id, blob, mimeType);
          imageCount++;
        }
      }

      // Add notebooks to state
      migrateNotebooks(importNotebooks);
      importNotebooks.forEach(nb => {
        state.notebooks.push(nb);
      });

      // Switch to the first imported notebook
      state.activeNotebookId = importNotebooks[0].id;
      saveState();

      restoreNotebookStatus.className = 'admin-status success';
      restoreNotebookStatus.textContent = '✓ Imported ' + importNotebooks.length + ' notebook(s) and ' + imageCount + ' image(s). Switched to "' + importNotebooks[0].name + '".';

      render();
      updateStorageInfo();
      populateExportNotebookSelect();

    } catch (err) {
      restoreNotebookStatus.className = 'admin-status error';
      restoreNotebookStatus.textContent = '✕ Import failed: ' + err.message;
    } finally {
      restoreNotebookBtn.disabled = false;
    }
  });

  restoreFileInput.addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    restoreFileInput.value = ''; // reset for next use

    restoreBtn.disabled = true;
    restoreStatus.className = 'admin-status info';
    restoreStatus.textContent = 'Reading backup file...';

    try {
      const zip = await JSZip.loadAsync(file);

      // Validate: state.json must exist
      const stateFile = zip.file('state.json');
      if (!stateFile) {
        throw new Error('Invalid backup: state.json not found in ZIP.');
      }

      // Parse and validate state
      restoreStatus.textContent = 'Validating backup structure...';
      const stateText = await stateFile.async('string');
      const parsedState = JSON.parse(stateText);

      if (!parsedState.notebooks && (!parsedState.tabs || !Array.isArray(parsedState.tabs))) {
        throw new Error('Invalid backup: state.json does not contain valid notebooks or tabs.');
      }

      // Extract images
      restoreStatus.textContent = 'Extracting images...';
      const imgFolder = zip.folder('images');
      const imageFiles = [];
      if (imgFolder) {
        imgFolder.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) {
            imageFiles.push(zipEntry);
          }
        });
      }

      // Clear existing images in IndexedDB
      restoreStatus.textContent = 'Clearing existing images...';
      await clearAllImages();

      // Store new images
      if (imageFiles.length > 0) {
        restoreStatus.textContent = 'Restoring ' + imageFiles.length + ' image(s)...';
        for (const imgFile of imageFiles) {
          const blob = await imgFile.async('blob');
          const name = imgFile.name.replace('images/', '');
          const id = name.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
          const mimeType = name.endsWith('.png') ? 'image/png' : 'image/jpeg';
          await storeImage(id, blob, mimeType);
        }
      }

      // Write state to localStorage (final step — atomic-ish)
      restoreStatus.textContent = 'Restoring notes data...';
      localStorage.setItem(STORAGE_KEY, stateText);

      // Reload app state with migration
      state = JSON.parse(stateText);
      if (!state.notebooks) {
        // Migrate old format
        const oldState = state;
        state = {
          activeNotebookId: 'notebook-1',
          notebooks: [{ id: 'notebook-1', name: 'My Notebook', activeTabId: oldState.activeTabId, activePageId: oldState.activePageId, activeFolderId: oldState.activeFolderId || null, collapsedPages: oldState.collapsedPages || {}, activePagePerTab: oldState.activePagePerTab || {}, tabs: oldState.tabs || [] }]
        };
      }
      migrateNotebooks(state.notebooks);
      saveState();

      const totalNbs = state.notebooks.length;
      restoreStatus.className = 'admin-status success';
      restoreStatus.textContent = '✓ Restore complete! ' + totalNbs + ' notebook(s) and ' + imageFiles.length + ' image(s) restored.';

      // Re-render
      render();
      updateStorageInfo();

    } catch (err) {
      restoreStatus.className = 'admin-status error';
      restoreStatus.textContent = '✕ Restore failed: ' + err.message;
      console.error('Restore error:', err);
    } finally {
      restoreBtn.disabled = false;
    }
  });

  // ===== Helper functions for admin (getAllImages, clearAllImages imported from NoteStorage) =====

  // formatBytes, downloadBlob imported from NoteUtils

  async function updateStorageInfo() {
    const stateSize = (localStorage.getItem(STORAGE_KEY) || '').length * 2; // UTF-16
    const allImages = await getAllImages();
    let imageSize = 0;
    allImages.forEach(img => { if (img.blob) imageSize += img.blob.size; });

    let totalGroups = 0;
    let totalPages = 0;
    state.notebooks.forEach(nb => {
      totalGroups += nb.tabs.length;
      nb.tabs.forEach(g => { totalPages += g.pages.length; });
    });

    storageInfoEl.innerHTML =
      '<div class="info-row"><span class="info-label">Notebooks</span><span class="info-value">' + state.notebooks.length + '</span></div>' +
      '<div class="info-row"><span class="info-label">Tabs (all notebooks)</span><span class="info-value">' + totalGroups + '</span></div>' +
      '<div class="info-row"><span class="info-label">Pages</span><span class="info-value">' + totalPages + '</span></div>' +
      '<div class="info-row"><span class="info-label">Images stored</span><span class="info-value">' + allImages.length + '</span></div>' +
      '<div class="info-row"><span class="info-label">State data size</span><span class="info-value">' + formatBytes(stateSize) + '</span></div>' +
      '<div class="info-row"><span class="info-label">Image data size</span><span class="info-value">' + formatBytes(imageSize) + '</span></div>' +
      '<div class="info-row"><span class="info-label">Total storage used</span><span class="info-value">' + formatBytes(stateSize + imageSize) + '</span></div>';
  }

  // ===== Save to Server =====
  saveServerBtn.addEventListener('click', async () => {
    saveServerBtn.disabled = true;
    saveServerStatus.className = 'admin-status info';
    saveServerStatus.textContent = 'Preparing backup for server...';

    try {
      const zip = new JSZip();
      const stateData = localStorage.getItem(STORAGE_KEY);
      zip.file('state.json', stateData || '{}');

      const allImages = await getAllImages();
      if (allImages.length > 0) {
        const imgFolder = zip.folder('images');
        for (const img of allImages) {
          const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
          imgFolder.file(img.id + ext, img.blob);
        }
      }

      saveServerStatus.textContent = 'Uploading to server...';
      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const formData = new FormData();
      formData.append('backup', blob, 'backup.zip');

      const response = await fetch('/notebook/api/backup', { method: 'POST', body: formData });
      const result = await response.json();

      if (result.success) {
        saveServerStatus.className = 'admin-status success';
        saveServerStatus.textContent = '✓ Saved to server: ' + result.filename + ' (' + formatBytes(result.size) + ')';
        loadServerBackups();
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (err) {
      saveServerStatus.className = 'admin-status error';
      saveServerStatus.textContent = '✕ Save failed: ' + err.message;
    } finally {
      saveServerBtn.disabled = false;
    }
  });

  // ===== Save to Google Drive =====
  const saveGdriveBtn = document.getElementById('save-gdrive-btn');
  saveGdriveBtn.addEventListener('click', async () => {
    saveGdriveBtn.disabled = true;
    saveServerStatus.className = 'admin-status info';
    saveServerStatus.textContent = 'Saving to Google Drive...';

    try {
      const zip = new JSZip();
      const stateData = localStorage.getItem(STORAGE_KEY);
      zip.file('state.json', stateData || '{}');

      const allImages = await getAllImages();
      if (allImages.length > 0) {
        const imgFolder = zip.folder('images');
        for (const img of allImages) {
          const ext = img.mimeType === 'image/png' ? '.png' : '.jpg';
          imgFolder.file(img.id + ext, img.blob);
        }
      }

      const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });

      const formData = new FormData();
      formData.append('backup', blob, 'backup.zip');

      const response = await fetch('/notebook/api/backup-gdrive', { method: 'POST', body: formData });
      const result = await response.json();

      if (result.success) {
        saveServerStatus.className = 'admin-status success';
        saveServerStatus.textContent = '✓ Saved to Google Drive: ' + result.filename + ' (' + formatBytes(result.size) + ')';
      } else {
        throw new Error(result.error || 'Upload failed');
      }
    } catch (err) {
      saveServerStatus.className = 'admin-status error';
      saveServerStatus.textContent = '✕ Google Drive save failed: ' + err.message;
    } finally {
      saveGdriveBtn.disabled = false;
    }
  });

  // ===== Server Backups List =====
  async function loadServerBackups() {
    try {
      const response = await fetch('/notebook/api/backups');
      const backups = await response.json();
      renderServerBackups(backups);
    } catch (err) {
      serverBackupsEl.innerHTML = '<p style="color:#585b70">Could not load server backups.</p>';
    }
  }

  function renderServerBackups(backups) {
    if (backups.length === 0) {
      serverBackupsEl.innerHTML = '<p style="color:#585b70">No server backups found.</p>';
      return;
    }

    let html = '<div class="backup-list">';
    backups.forEach(b => {
      const date = new Date(b.date).toLocaleString();
      html += '<div class="backup-item">';
      html += '<div class="backup-info"><span class="backup-name">' + b.name + '</span><span class="backup-meta">' + date + ' · ' + formatBytes(b.size) + '</span></div>';
      html += '<div class="backup-actions">';
      html += '<button class="backup-action-btn" data-action="download" data-name="' + b.name + '" title="Download">⬇</button>';
      html += '<button class="backup-action-btn" data-action="restore" data-name="' + b.name + '" title="Restore from this backup">↺</button>';
      html += '<button class="backup-action-btn danger" data-action="delete" data-name="' + b.name + '" title="Delete">🗑</button>';
      html += '</div></div>';
    });
    html += '</div>';
    serverBackupsEl.innerHTML = html;

    // Attach events
    serverBackupsEl.querySelectorAll('.backup-action-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = btn.dataset.action;
        const name = btn.dataset.name;
        if (action === 'download') downloadServerBackup(name);
        if (action === 'restore') restoreServerBackup(name);
        if (action === 'delete') deleteServerBackup(name);
      });
    });
  }

  async function downloadServerBackup(name) {
    window.location.href = '/notebook/api/backup/' + encodeURIComponent(name);
  }

  async function restoreServerBackup(name) {
    if (!confirm('Restore from "' + name + '"?\n\nThis will replace ALL current notes and images.')) return;

    restoreStatus.className = 'admin-status info';
    restoreStatus.textContent = 'Downloading backup from server...';

    try {
      const response = await fetch('/notebook/api/backup/' + encodeURIComponent(name));
      const blob = await response.blob();

      restoreStatus.textContent = 'Processing backup...';
      const zip = await JSZip.loadAsync(blob);

      const stateFile = zip.file('state.json');
      if (!stateFile) throw new Error('Invalid backup: state.json not found.');

      const stateText = await stateFile.async('string');
      const parsedState = JSON.parse(stateText);
      if (!parsedState.notebooks && (!parsedState.tabs || !Array.isArray(parsedState.tabs))) {
        throw new Error('Invalid backup: state.json structure invalid.');
      }

      restoreStatus.textContent = 'Extracting images...';
      const imgFolder = zip.folder('images');
      const imageFiles = [];
      if (imgFolder) {
        imgFolder.forEach((relativePath, zipEntry) => {
          if (!zipEntry.dir) imageFiles.push(zipEntry);
        });
      }

      await clearAllImages();

      for (const imgFile of imageFiles) {
        const imgBlob = await imgFile.async('blob');
        const fileName = imgFile.name.replace('images/', '');
        const id = fileName.replace(/\.(jpg|jpeg|png|gif|webp)$/i, '');
        const mimeType = fileName.endsWith('.png') ? 'image/png' : 'image/jpeg';
        await storeImage(id, imgBlob, mimeType);
      }

      localStorage.setItem(STORAGE_KEY, stateText);
      state = JSON.parse(stateText);
      if (!state.notebooks) {
        const oldState = state;
        state = {
          activeNotebookId: 'notebook-1',
          notebooks: [{ id: 'notebook-1', name: 'My Notebook', activeTabId: oldState.activeTabId, activePageId: oldState.activePageId, activeFolderId: oldState.activeFolderId || null, collapsedPages: oldState.collapsedPages || {}, activePagePerTab: oldState.activePagePerTab || {}, tabs: oldState.tabs || [] }]
        };
      }
      migrateNotebooks(state.notebooks);
      saveState();

      restoreStatus.className = 'admin-status success';
      restoreStatus.textContent = '✓ Restored from "' + name + '": ' + state.notebooks.length + ' notebook(s), ' + imageFiles.length + ' image(s).';
      render();
      updateStorageInfo();

    } catch (err) {
      restoreStatus.className = 'admin-status error';
      restoreStatus.textContent = '✕ Restore failed: ' + err.message;
    }
  }

  async function deleteServerBackup(name) {
    if (!confirm('Delete server backup "' + name + '"?\n\nThis cannot be undone.')) return;
    try {
      await fetch('/notebook/api/backup/' + encodeURIComponent(name), { method: 'DELETE' });
      loadServerBackups();
    } catch (err) {
      alert('Failed to delete: ' + err.message);
    }
  }

  // ===== Purge All Data =====
  const purgeBtn = document.getElementById('purge-btn');
  const purgeStatus = document.getElementById('purge-status');

  purgeBtn.addEventListener('click', async () => {
    // First warning
    if (!confirm('⚠ WARNING: This will permanently delete ALL your pages, tabs, and images.\n\nThis action CANNOT be undone.\n\nAre you sure you want to continue?')) return;

    // Second confirmation with typed input
    const confirmation = prompt('To confirm, please type "DELETE ALL" (case-sensitive):');
    if (confirmation !== 'DELETE ALL') {
      purgeStatus.className = 'admin-status info';
      purgeStatus.textContent = 'Purge cancelled — confirmation text did not match.';
      return;
    }

    purgeBtn.disabled = true;
    purgeStatus.className = 'admin-status info';
    purgeStatus.textContent = 'Purging all data...';

    try {
      // Clear localStorage
      localStorage.removeItem(STORAGE_KEY);

      // Clear IndexedDB images
      await clearAllImages();

      // Reset state to empty
      state = {
        activeNotebookId: 'notebook-1',
        notebooks: [
          {
            id: 'notebook-1',
            name: 'My Notebook',
            activeTabId: null,
            activePageId: null,
            activeFolderId: null,
            collapsedPages: {},
            activePagePerTab: {},
            tabs: []
          }
        ]
      };
      saveState();

      purgeStatus.className = 'admin-status success';
      purgeStatus.textContent = '✓ All data has been purged. The application is now empty.';

      render();
      updateStorageInfo();
    } catch (err) {
      purgeStatus.className = 'admin-status error';
      purgeStatus.textContent = '✕ Purge failed: ' + err.message;
    } finally {
      purgeBtn.disabled = false;
    }
  });

  // ===== Global Labels =====
  if (!state.globalLabels) state.globalLabels = [];

  function renderGlobalLabelsList() {
    const listEl = document.getElementById('global-labels-list');
    listEl.innerHTML = '';
    if (state.globalLabels.length === 0) {
      listEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No global labels defined yet.</p>';
      return;
    }
    state.globalLabels.forEach(lbl => {
      const row = document.createElement('div');
      row.className = 'manage-label-row';
      row.innerHTML = '<span class="lbl-dot" style="background:' + lbl.color + ';width:12px;height:12px;border-radius:50%;flex-shrink:0"></span><span class="manage-label-name">' + escapeHtml(lbl.name) + ' <span style="font-size:10px;color:var(--text-muted)">⊛ global</span></span>';

      const actions = document.createElement('span');
      actions.className = 'manage-label-actions';

      const editBtn = document.createElement('button');
      editBtn.textContent = '✎';
      editBtn.title = 'Rename';
      editBtn.addEventListener('click', () => {
        const newName = prompt('Rename global label:', lbl.name);
        if (newName && newName.trim()) {
          lbl.name = newName.trim();
          debouncedSave();
          renderGlobalLabelsList();
        }
      });

      const colorBtn = document.createElement('button');
      colorBtn.textContent = '🎨';
      colorBtn.title = 'Change color';
      colorBtn.addEventListener('click', () => {
        const input = document.createElement('input');
        input.type = 'color';
        input.value = lbl.color;
        input.style.position = 'fixed';
        input.style.top = '-100px';
        document.body.appendChild(input);
        input.addEventListener('input', () => { lbl.color = input.value; debouncedSave(); renderGlobalLabelsList(); });
        input.addEventListener('change', () => { setTimeout(() => input.remove(), 100); });
        input.click();
      });

      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Delete';
      delBtn.addEventListener('click', () => {
        if (!confirm('Delete global label "' + lbl.name + '"?')) return;
        state.globalLabels = state.globalLabels.filter(l => l.id !== lbl.id);
        debouncedSave();
        renderGlobalLabelsList();
      });

      actions.appendChild(editBtn);
      actions.appendChild(colorBtn);
      actions.appendChild(delBtn);
      row.appendChild(actions);
      listEl.appendChild(row);
    });
  }

  document.getElementById('global-label-add-btn').addEventListener('click', () => {
    const input = document.getElementById('global-label-input');
    const name = input.value.trim();
    if (!name) return;
    if (state.globalLabels.find(l => l.name === name)) {
      alert('Global label "' + name + '" already exists.');
      return;
    }
    const colors = ['#89b4fa', '#a6e3a1', '#f9e2af', '#f38ba8', '#cba6f7', '#fab387', '#94e2d5'];
    state.globalLabels.push({ id: generateId('glbl'), name: name, color: colors[state.globalLabels.length % colors.length] });
    input.value = '';
    debouncedSave();
    renderGlobalLabelsList();
  });

  document.getElementById('global-label-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') document.getElementById('global-label-add-btn').click();
  });

  // Render on admin open
  adminBtn.addEventListener('click', () => { renderGlobalLabelsList(); });

  // ===== Label Macros =====
  const createMacroBtn = document.getElementById('create-macro-btn');
  const macroListEl = document.getElementById('macro-list');

  // Macros stored at top-level state: state.macros = [{ id, labelId, labelName, pluginId }]
  if (!state.macros) state.macros = [];

  function getAllUniqueLabels() {
    return (state.globalLabels || []).map(lbl => ({ id: lbl.id, name: lbl.name, color: lbl.color }));
  }

  function getLabelsWithoutMacro() {
    const macroLabelIds = new Set(state.macros.map(m => m.labelId));
    return getAllUniqueLabels().filter(lbl => !macroLabelIds.has(lbl.id));
  }

  function renderMacroList() {
    macroListEl.innerHTML = '';
    if (state.macros.length === 0) {
      macroListEl.innerHTML = '<p style="color:var(--text-muted);font-size:13px">No macros defined yet.</p>';
      return;
    }
    state.macros.forEach(macro => {
      const plugin = window.PluginRegistry.get(macro.pluginId);
      const row = document.createElement('div');
      row.className = 'manage-label-row';
      row.innerHTML = '<span class="lbl-dot" style="background:' + (macro.labelColor || '#888') + ';width:12px;height:12px;border-radius:50%;flex-shrink:0"></span>' +
        '<span class="manage-label-name">' + escapeHtml(macro.labelName) + '</span>' +
        '<span style="font-size:11px;color:var(--text-muted);margin-left:8px">→ ' + (plugin ? plugin.name : 'Unknown Plugin') + '</span>';

      const actions = document.createElement('span');
      actions.className = 'manage-label-actions';
      const delBtn = document.createElement('button');
      delBtn.textContent = '✕';
      delBtn.title = 'Remove macro';
      delBtn.addEventListener('click', () => {
        state.macros = state.macros.filter(m => m.id !== macro.id);
        debouncedSave();
        renderMacroList();
      });
      actions.appendChild(delBtn);
      row.appendChild(actions);
      macroListEl.appendChild(row);
    });
  }

  createMacroBtn.addEventListener('click', () => {
    const availableLabels = getLabelsWithoutMacro();
    const plugins = window.PluginRegistry.getAll();

    if (availableLabels.length === 0) {
      alert('All labels already have macros assigned, or no labels exist. Create a new label first.');
      return;
    }
    if (plugins.length === 0) {
      alert('No plugins available. Add plugin files to the plugins folder.');
      return;
    }

    // Show creation modal
    const overlay = document.createElement('div');
    overlay.className = 'move-modal-overlay';

    const modal = document.createElement('div');
    modal.className = 'manage-labels-modal';

    const header = document.createElement('div');
    header.className = 'move-modal-header';
    header.innerHTML = '<span>Create Macro</span>';
    const closeBtn = document.createElement('button');
    closeBtn.className = 'btn-icon';
    closeBtn.textContent = '✕';
    closeBtn.addEventListener('click', () => overlay.remove());
    header.appendChild(closeBtn);
    modal.appendChild(header);

    const form = document.createElement('div');
    form.style.padding = '16px';
    form.style.display = 'flex';
    form.style.flexDirection = 'column';
    form.style.gap = '12px';

    // Label selector
    const labelLabel = document.createElement('label');
    labelLabel.style.fontSize = '13px';
    labelLabel.style.color = 'var(--text-secondary)';
    labelLabel.textContent = 'Select Label:';
    form.appendChild(labelLabel);

    const labelSelect = document.createElement('select');
    labelSelect.className = 'admin-select';
    labelSelect.style.width = '100%';
    availableLabels.forEach(lbl => {
      const opt = document.createElement('option');
      opt.value = lbl.id;
      opt.textContent = lbl.name;
      opt.dataset.color = lbl.color;
      labelSelect.appendChild(opt);
    });
    form.appendChild(labelSelect);

    // Plugin selector
    const pluginLabel = document.createElement('label');
    pluginLabel.style.fontSize = '13px';
    pluginLabel.style.color = 'var(--text-secondary)';
    pluginLabel.textContent = 'Select Plugin:';
    form.appendChild(pluginLabel);

    const pluginSelect = document.createElement('select');
    pluginSelect.className = 'admin-select';
    pluginSelect.style.width = '100%';
    plugins.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name + ' — ' + p.description;
      pluginSelect.appendChild(opt);
    });
    form.appendChild(pluginSelect);

    // Create button
    const createBtn = document.createElement('button');
    createBtn.className = 'admin-action-btn';
    createBtn.textContent = 'Create Macro';
    createBtn.addEventListener('click', () => {
      const selectedLabel = availableLabels.find(l => l.id === labelSelect.value);
      if (!selectedLabel) return;
      state.macros.push({
        id: generateId('macro'),
        labelId: selectedLabel.id,
        labelName: selectedLabel.name,
        labelColor: selectedLabel.color,
        pluginId: pluginSelect.value
      });
      debouncedSave();
      renderMacroList();
      overlay.remove();
    });
    form.appendChild(createBtn);

    modal.appendChild(form);
    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  });

  // Render macro list when admin opens
  const origAdminClick = adminBtn.onclick;
  adminBtn.addEventListener('click', () => { renderMacroList(); });

  // ===== Execute Macro from Page =====
  // This is exposed so it can be triggered from the page context menu or labels
  window.executeMacroForPage = function(page) {
    if (!page || !page.labelIds || page.labelIds.length === 0) return;
    const matchingMacros = state.macros.filter(m => page.labelIds.includes(m.labelId));
    if (matchingMacros.length === 0) return;
    matchingMacros.forEach(macro => {
      window.PluginRegistry.execute(macro.pluginId, page.content || '', page);
    });
  };

  // ===== Init =====
  // Initialize favorites panel
  window.FavoritesPanel.init(
    function (result) {
      // Navigate to the page's natural location
      const nb = getActiveNotebook();
      if (nb) {
        nb.activeFolderId = result.folderId;
        nb.activeTabId = result.tabId;
        nb.activePageId = result.pageId;
      }
      debouncedSave();
      render();
    },
    function () {
      // Provide current state info
      const nb = getActiveNotebook();
      return { notebook: nb, folderId: nb ? nb.activeFolderId : null };
    }
  );

  // Initialize page links
  window.PageLinks.init(
    function (result) {
      // Navigate to linked page — save current state to history first
      const nb = getActiveNotebook();
      if (nb) pushNavHistory(nb);
      state.activeNotebookId = result.notebookId;
      const targetNb = getActiveNotebook();
      if (targetNb) {
        targetNb.activeFolderId = result.folderId;
        targetNb.activeTabId = result.tabId;
        targetNb.activePageId = result.pageId;
      }
      debouncedSave();
      render();
    },
    function () {
      return { state: state };
    }
  );

  // Initialize search
  window.NotebookSearch.init(function (result) {
    // Navigate to the selected result
    state.activeNotebookId = result.notebookId;
    const nb = getActiveNotebook();
    if (nb) {
      nb.activeFolderId = result.folderId;
      nb.activeTabId = result.tabId;
      nb.activePageId = result.pageId;
    }
    debouncedSave();
    render();
  });

  document.getElementById('search-btn').addEventListener('click', function () {
    window.NotebookSearch.show();
  });

  // Initialize markdown toolbar (insert before editor container, inside content panel)
  var contentPanel = document.getElementById('content-panel');
  window.MarkdownToolbar.init(editorEl, contentPanel, () => {
    const activePage = getActivePage();
    if (activePage) {
      activePage.content = editorEl.value;
      activePage.updatedAt = new Date().toISOString();
      debouncedSave();
    }
  });
  window.MarkdownToolbar.hide();

  openImageDb().then(() => {
    render();
  }).catch(() => {
    render();
  });

})();
