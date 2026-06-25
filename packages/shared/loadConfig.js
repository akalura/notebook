/**
 * Shared Configuration Loader
 * Reads config.json from project root. Falls back to defaults if missing.
 */
const path = require('path');

const CONFIG_PATH = path.resolve(__dirname, '../../config.json');

const DEFAULTS = {
  server: { port: 4000 },
  paths: {
    root: 'C:\\myUtils',
    attachments: 'C:\\myUtils\\notebook_attachments',
    attachmentBackup: 'C:\\myUtils\\cache\\attachmentsBackup',
    notebookBackup: 'C:\\myUtils\\cache\\notebookBackup',
    gdriveBackup: 'G:\\My Drive\\notebook-backup',
    syncCache: 'C:\\myUtils\\cache\\utility_syncLinks'
  },
  firebase: {
    serviceAccountKey: './secrets/serviceAccountKey.json',
    collection: 'incoming_urls'
  }
};

function deepMerge(defaults, overrides) {
  var result = {};
  Object.keys(defaults).forEach(function (key) {
    if (overrides && overrides.hasOwnProperty(key)) {
      if (typeof defaults[key] === 'object' && defaults[key] !== null && !Array.isArray(defaults[key])) {
        result[key] = deepMerge(defaults[key], overrides[key]);
      } else {
        result[key] = overrides[key];
      }
    } else {
      result[key] = defaults[key];
    }
  });
  return result;
}

function loadConfig() {
  var userConfig = {};
  try {
    delete require.cache[require.resolve(CONFIG_PATH)];
    userConfig = require(CONFIG_PATH);
  } catch (e) {
    // config.json not found — use defaults
  }
  return deepMerge(DEFAULTS, userConfig);
}

module.exports = loadConfig();
