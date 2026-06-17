# Plugins

Each plugin is a standalone JavaScript file that registers itself with the Plugin Registry.

## Creating a Plugin

Create a new `.js` file in this folder:

```javascript
(function () {
  'use strict';

  window.PluginRegistry.register({
    id: 'my-plugin-id',          // Unique identifier
    name: 'My Plugin Name',      // Display name
    description: 'What it does', // Shown in admin UI
    execute: function (pageContent, page) {
      // pageContent: string - the raw content of the page
      // page: object - the full page object (name, id, contentType, etc.)
      
      // Your logic here...
    }
  });
})();
```

Then add a `<script>` tag in `index.html` after `plugin-registry.js`.

## Available Plugins

- `sequence-diagram.js` — Opens sequencediagram.org with page content
