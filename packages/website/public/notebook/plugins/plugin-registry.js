/**
 * Plugin Registry
 * Manages available plugins for label macros.
 * Each plugin exports: { id, name, description, execute(pageContent, page) }
 */
window.PluginRegistry = (function () {
  'use strict';

  var plugins = {};

  function register(plugin) {
    if (!plugin.id || !plugin.name || !plugin.execute) {
      console.warn('Plugin registration failed: missing id, name, or execute', plugin);
      return;
    }
    plugins[plugin.id] = plugin;
  }

  function get(id) {
    return plugins[id] || null;
  }

  function getAll() {
    return Object.values(plugins);
  }

  function execute(pluginId, pageContent, page) {
    var plugin = plugins[pluginId];
    if (!plugin) {
      console.warn('Plugin not found:', pluginId);
      return;
    }
    plugin.execute(pageContent, page);
  }

  return {
    register: register,
    get: get,
    getAll: getAll,
    execute: execute
  };
})();
