/**
 * Attachments Module
 * Handles file drag-and-drop attachments.
 * - Drop zone on editor (edit mode only)
 * - Upload to server
 * - Token insertion {{attach:id}}
 * - Preview rendering with clickable links
 * - Click-to-copy file path
 */
window.NotebookAttachments = (function () {
  'use strict';

  var MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB
  var ATTACHMENTS_ROOT = 'C:\\myUtils\\notebook_attachments\\';

  var editorEl = null;
  var editorContainer = null;
  var previewContainer = null;
  var getContextFn = null;
  var onContentChangeFn = null;
  var dropOverlay = null;
  var statusEl = null;
  var dragCounter = 0;

  /**
   * Initialize the attachments module.
   * @param {Object} opts
   * @param {HTMLElement} opts.editor - The textarea element
   * @param {HTMLElement} opts.editorContainer - The editor container div
   * @param {HTMLElement} opts.previewContainer - The preview container div
   * @param {Function} opts.getContext - Returns { page, notebookName, folderPath, mode }
   * @param {Function} opts.onContentChange - Called after token insertion to persist
   */
  function init(opts) {
    editorEl = opts.editor;
    editorContainer = opts.editorContainer;
    previewContainer = opts.previewContainer;
    getContextFn = opts.getContext;
    onContentChangeFn = opts.onContentChange;

    createDropOverlay();
    createStatusElement();
    attachEditorEvents();
    attachPreviewBlocker();
    attachClickHandler();
  }

  function createDropOverlay() {
    dropOverlay = document.createElement('div');
    dropOverlay.className = 'attachment-drop-overlay';
    dropOverlay.innerHTML = '<div class="attachment-drop-content"><i data-lucide="paperclip" class="icon-lg"></i><span>Drop file to attach</span></div>';
    dropOverlay.style.display = 'none';
    editorContainer.style.position = 'relative';
    editorContainer.appendChild(dropOverlay);
  }

  function createStatusElement() {
    statusEl = document.createElement('div');
    statusEl.className = 'attachment-status';
    statusEl.style.display = 'none';
    editorContainer.appendChild(statusEl);
  }

  function shouldEnableDrop() {
    var ctx = getContextFn();
    return ctx && ctx.page !== null && ctx.mode === 'edit';
  }

  function attachEditorEvents() {
    editorContainer.addEventListener('dragenter', function (e) {
      if (!shouldEnableDrop()) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      // Only react to files from outside the browser
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragCounter++;
      showDropOverlay();
    });

    editorContainer.addEventListener('dragover', function (e) {
      if (!shouldEnableDrop()) {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'none';
        return;
      }
      if (!hasFiles(e)) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });

    editorContainer.addEventListener('dragleave', function (e) {
      if (!shouldEnableDrop()) return;
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        hideDropOverlay();
      }
    });

    editorContainer.addEventListener('drop', function (e) {
      if (!shouldEnableDrop()) {
        e.preventDefault();
        return;
      }
      e.preventDefault();
      dragCounter = 0;
      hideDropOverlay();

      var files = e.dataTransfer && e.dataTransfer.files;
      if (!files || files.length === 0) return;

      handleFileDrop(Array.from(files));
    });
  }

  function attachPreviewBlocker() {
    // Prevent default browser behavior in preview mode (opening the file)
    previewContainer.addEventListener('dragover', function (e) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'none';
    });
    previewContainer.addEventListener('drop', function (e) {
      e.preventDefault();
    });
  }

  function hasFiles(e) {
    if (e.dataTransfer && e.dataTransfer.types) {
      return e.dataTransfer.types.indexOf('Files') !== -1;
    }
    return false;
  }

  function showDropOverlay() {
    dropOverlay.style.display = 'flex';
    if (window.lucide) lucide.createIcons({ nodes: [dropOverlay] });
  }

  function hideDropOverlay() {
    dropOverlay.style.display = 'none';
  }

  function showStatus(msg) {
    statusEl.textContent = msg;
    statusEl.style.display = 'block';
  }

  function hideStatus() {
    statusEl.style.display = 'none';
    statusEl.textContent = '';
  }

  async function handleFileDrop(files) {
    var ctx = getContextFn();
    if (!ctx || !ctx.page) return;

    var total = files.length;
    var errors = [];

    for (var i = 0; i < total; i++) {
      var file = files[i];
      var label = total > 1 ? '(' + (i + 1) + '/' + total + ') ' : '';
      showStatus(label + 'Uploading ' + file.name + '...');

      // Client-side size check
      if (file.size > MAX_FILE_SIZE) {
        errors.push(file.name + ' — exceeds 200MB (' + formatSize(file.size) + ')');
        continue;
      }

      try {
        var result = await uploadFile(file, ctx.notebookName, ctx.folderPath);
        if (result.error) {
          errors.push(file.name + ' — ' + result.error);
          continue;
        }
        // Store attachment metadata in state
        storeAttachment(result, file, ctx.page.id);
        // Insert token at cursor
        insertToken(result.id, total > 1 && i < total - 1);
      } catch (err) {
        errors.push(file.name + ' — upload failed');
      }
    }

    hideStatus();

    if (errors.length > 0) {
      var uploaded = total - errors.length;
      var msg = uploaded + ' of ' + total + ' file(s) uploaded.';
      if (errors.length > 0) {
        msg += '\n\nFailed:\n' + errors.join('\n');
      }
      alert(msg);
    }

    if (onContentChangeFn) onContentChangeFn();
  }

  async function uploadFile(file, notebookName, folderPath) {
    var formData = new FormData();
    formData.append('file', file);
    formData.append('notebookName', notebookName || '_default');
    formData.append('folderPath', folderPath || '');

    var response = await fetch('/notebook/api/attachment', {
      method: 'POST',
      body: formData
    });

    if (response.status === 413) {
      return { error: 'File too large (server rejected)' };
    }
    if (!response.ok) {
      var errData = await response.json().catch(function () { return {}; });
      return { error: errData.error || 'Server error ' + response.status };
    }

    return await response.json();
  }

  function storeAttachment(result, file, pageId) {
    // Get state from context
    var ctx = getContextFn();
    if (!ctx || !ctx.state) return;

    if (!ctx.state.attachments) ctx.state.attachments = [];

    ctx.state.attachments.push({
      id: result.id,
      fileName: result.fileName,
      originalName: result.originalName || file.name,
      relativePath: result.relativePath,
      extension: getExtension(result.fileName),
      size: result.size || file.size,
      mimeType: result.mimeType || file.type || 'application/octet-stream',
      createdAt: new Date().toISOString(),
      pageId: pageId
    });
  }

  function insertToken(attachId, addNewline) {
    var token = '{{attach:' + attachId + '}}';
    var start = editorEl.selectionStart;
    var end = editorEl.selectionEnd;
    var text = editorEl.value;
    var insertion = token + (addNewline ? '\n' : '');
    editorEl.value = text.substring(0, start) + insertion + text.substring(end);
    editorEl.selectionStart = editorEl.selectionEnd = start + insertion.length;
    editorEl.focus();
  }

  /**
   * Process attachment tokens in content string.
   * Returns the content with tokens replaced by HTML.
   * @param {string} content - The page content
   * @param {Object} state - The full app state (with state.attachments)
   * @returns {string} Content with tokens replaced
   */
  function processTokens(content, state) {
    if (!content) return content;
    var attachments = (state && state.attachments) || [];
    var tokenRegex = /\{\{attach:([\w-]+)\}\}/g;

    return content.replace(tokenRegex, function (fullMatch, id) {
      var meta = attachments.find(function (a) { return a.id === id; });
      if (!meta) {
        return '<span class="attachment-link attachment-missing" title="Attachment not found">📎 [missing]</span>';
      }
      var fullPath = ATTACHMENTS_ROOT + meta.relativePath.replace(/\//g, '\\');
      var tooltip = meta.fileName + '\n' + formatSize(meta.size) + ' · ' + getExtension(meta.fileName).toUpperCase() + '\n' + formatDate(meta.createdAt) + '\nClick to copy path';
      return '<span class="attachment-link" data-attach-id="' + id + '" data-full-path="' + escapeAttr(fullPath) + '" title="' + escapeAttr(tooltip) + '"><span class="attachment-icon">📎</span> ' + escapeHtml(meta.fileName) + '</span>';
    });
  }

  /**
   * Attach click handler for attachment links in preview (delegation on document).
   */
  function attachClickHandler() {
    document.addEventListener('click', function (e) {
      var link = e.target.closest('.attachment-link');
      if (!link) return;
      var fullPath = link.dataset.fullPath;
      if (!fullPath) return;

      // Copy path to clipboard
      navigator.clipboard.writeText(fullPath).then(function () {
        showToast('Path copied!');
      }).catch(function () {
        // Fallback
        var ta = document.createElement('textarea');
        ta.value = fullPath;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        ta.remove();
        showToast('Path copied!');
      });
    });
  }

  function showToast(msg) {
    var toast = document.createElement('div');
    toast.className = 'attachment-toast';
    toast.textContent = msg;
    document.body.appendChild(toast);
    setTimeout(function () {
      toast.classList.add('fade-out');
      setTimeout(function () { toast.remove(); }, 300);
    }, 1500);
  }

  // ===== Utility helpers =====

  function formatSize(bytes) {
    if (!bytes || bytes === 0) return '0 B';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatDate(isoStr) {
    if (!isoStr) return '';
    var d = new Date(isoStr);
    return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  function getExtension(filename) {
    if (!filename) return '';
    var dot = filename.lastIndexOf('.');
    if (dot <= 0) return '';
    return filename.substring(dot + 1);
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function escapeAttr(str) {
    return str.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return {
    init: init,
    processTokens: processTokens
  };
})();
