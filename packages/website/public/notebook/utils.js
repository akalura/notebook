/**
 * Utility Module - Shared helper functions
 */
window.NoteUtils = (function () {
  'use strict';

  function generateId(prefix) {
    return prefix + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function getContrastColor(hex) {
    if (!hex) return '#cdd6f4';
    var c = hex.replace('#', '');
    var r = parseInt(c.substring(0, 2), 16);
    var g = parseInt(c.substring(2, 4), 16);
    var b = parseInt(c.substring(4, 6), 16);
    var luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.5 ? '#1e1e2e' : '#cdd6f4';
  }

  function formatDate(isoStr) {
    if (!isoStr) return 'N/A';
    var d = new Date(isoStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function formatBytes(bytes) {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function downloadBlob(blob, filename) {
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () {
      URL.revokeObjectURL(url);
      a.remove();
    }, 100);
  }

  function autoLinkify(text) {
    var urlRegex = /(\bhttps?:\/\/[^\s<]+)|(\bwww\.[^\s<]+)/gi;
    return text.replace(urlRegex, function (match) {
      var href = match;
      if (match.startsWith('www.')) {
        href = 'https://' + match;
      }
      return '<a href="' + href + '" target="_blank" rel="noopener noreferrer">' + match + '</a>';
    });
  }

  function migrateNotebooks(notebooks) {
    notebooks.forEach(function (nb) {
      if (nb.activeFolderId === undefined) nb.activeFolderId = null;
      if (!nb.collapsedPages) nb.collapsedPages = {};
      if (!nb.activePagePerTab) nb.activePagePerTab = {};
      if (!nb.tabs) nb.tabs = [];
      nb.tabs.forEach(function (g) {
        if (g.isFolder === undefined) g.isFolder = false;
        if (g.parentTabId === undefined) g.parentTabId = null;
        if (g.color === undefined) g.color = null;
        if (!g.pages) g.pages = [];
        g.pages.forEach(function (p) {
          if (p.parentPageId === undefined) p.parentPageId = null;
          if (p.createdAt === undefined) p.createdAt = null;
          if (p.updatedAt === undefined) p.updatedAt = null;
        });
      });
    });
  }

  return {
    generateId: generateId,
    escapeHtml: escapeHtml,
    getContrastColor: getContrastColor,
    formatDate: formatDate,
    formatBytes: formatBytes,
    downloadBlob: downloadBlob,
    autoLinkify: autoLinkify,
    migrateNotebooks: migrateNotebooks
  };
})();
