/**
 * Swagger Editor Plugin
 * Copies page content to clipboard and opens Swagger Editor.
 * User pastes content into the editor with Ctrl+V.
 */
(function () {
  'use strict';

  window.PluginRegistry.register({
    id: 'swagger-editor',
    name: 'Swagger Editor',
    description: 'Copy content and open in Swagger Editor (paste with Ctrl+V)',
    execute: function (pageContent, page) {
      navigator.clipboard.writeText(pageContent || '').then(function () {
        window.open('https://editor.swagger.io/', '_blank', 'noopener,noreferrer');
        showPluginNotification('Content copied! Paste with Ctrl+V in Swagger Editor.');
      }).catch(function () {
        window.open('https://editor.swagger.io/', '_blank', 'noopener,noreferrer');
        showPluginNotification('Could not copy automatically. Please copy manually.');
      });
    }
  });

  // Shared notification helper
  if (!window.showPluginNotification) {
    window.showPluginNotification = function (message) {
      var toast = document.createElement('div');
      toast.className = 'plugin-toast';
      toast.textContent = message;
      document.body.appendChild(toast);
      setTimeout(function () {
        toast.classList.add('plugin-toast-hide');
        setTimeout(function () { toast.remove(); }, 300);
      }, 3000);
    };
  }
})();
