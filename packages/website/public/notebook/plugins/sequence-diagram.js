/**
 * Sequence Diagram Plugin
 * Opens sequencediagram.org with the page content as input.
 * Uses lz-string compression for URL encoding.
 */
(function () {
  'use strict';

  window.PluginRegistry.register({
    id: 'sequence-diagram',
    name: 'Sequence Diagram',
    description: 'Open page content in sequencediagram.org for visualization',
    execute: function (pageContent, page) {
      var compressed = LZString.compressToEncodedURIComponent(pageContent || '');
      var url = 'https://sequencediagram.org/index.html#initialData=' + compressed;
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  });
})();
