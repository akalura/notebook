const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// ===== Helpers =====

function formatSize(bytes) {
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  if (bytes < 1024 * 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  return (bytes / (1024 * 1024 * 1024)).toFixed(2) + ' GB';
}

function parseSize(str) {
  var match = str.match(/^(\d+(?:\.\d+)?)\s*(B|KB|MB|GB)$/i);
  if (!match) return null;
  var num = parseFloat(match[1]);
  var unit = match[2].toUpperCase();
  if (unit === 'B') return num;
  if (unit === 'KB') return num * 1024;
  if (unit === 'MB') return num * 1024 * 1024;
  if (unit === 'GB') return num * 1024 * 1024 * 1024;
  return null;
}

function copyToClipboard(text) {
  try {
    execSync('clip', { input: text, stdio: ['pipe', 'pipe', 'pipe'] });
  } catch (e) {
    // Silently fail if clip not available
  }
}

// ===== Folder Stats Mode =====

function getFolderStats(folderPath, currentDepth, maxDepth) {
  var result = { path: folderPath, size: 0, fileCount: 0, subfolders: [] };

  var entries;
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch (e) {
    return result; // Permission denied or inaccessible
  }

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fullPath = path.join(folderPath, entry.name);

    if (entry.isFile()) {
      try {
        var stat = fs.statSync(fullPath);
        result.size += stat.size;
        result.fileCount++;
      } catch (e) { /* skip inaccessible files */ }
    } else if (entry.isDirectory()) {
      if (currentDepth < maxDepth) {
        var sub = getFolderStats(fullPath, currentDepth + 1, maxDepth);
        result.subfolders.push(sub);
        result.size += sub.size;
        result.fileCount += sub.fileCount;
      } else {
        // Count size without recursing into display
        var dirStats = getDirSizeFlat(fullPath);
        result.size += dirStats.size;
        result.fileCount += dirStats.fileCount;
      }
    }
  }

  return result;
}

function getDirSizeFlat(folderPath) {
  var totalSize = 0;
  var fileCount = 0;

  function walk(dir) {
    var entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (e) { return; }
    for (var i = 0; i < entries.length; i++) {
      var fullPath = path.join(dir, entries[i].name);
      if (entries[i].isFile()) {
        try {
          var stat = fs.statSync(fullPath);
          totalSize += stat.size;
          fileCount++;
        } catch (e) { /* skip */ }
      } else if (entries[i].isDirectory()) {
        walk(fullPath);
      }
    }
  }

  walk(folderPath);
  return { size: totalSize, fileCount: fileCount };
}

function renderStatsTree(stats, prefix, isLast, lines) {
  var connector = prefix === '' ? '' : (isLast ? '└── ' : '├── ');
  var sizeStr = formatSize(stats.size).padStart(10);
  var countStr = (stats.fileCount + ' file' + (stats.fileCount !== 1 ? 's' : '')).padStart(12);
  var displayPath = prefix === '' ? stats.path : path.basename(stats.path);

  lines.push(prefix + connector + displayPath + '  ' + sizeStr + '  ' + countStr);

  var childPrefix = prefix === '' ? '' : (prefix + (isLast ? '    ' : '│   '));
  for (var i = 0; i < stats.subfolders.length; i++) {
    var isChildLast = (i === stats.subfolders.length - 1);
    renderStatsTree(stats.subfolders[i], childPrefix, isChildLast, lines);
  }
}

// ===== JSON Flatten Helper =====

function flattenStatsToRows(stats, depth, rows) {
  rows.push({
    path: stats.path,
    folderName: path.basename(stats.path),
    depth: depth,
    sizeBytes: stats.size,
    size: formatSize(stats.size),
    fileCount: stats.fileCount,
    subfolderCount: stats.subfolders.length
  });
  for (var i = 0; i < stats.subfolders.length; i++) {
    flattenStatsToRows(stats.subfolders[i], depth + 1, rows);
  }
}

// ===== Large File Finder Mode =====

function findLargeFiles(folderPath, minSize, currentDepth, maxDepth) {
  var results = [];

  var entries;
  try {
    entries = fs.readdirSync(folderPath, { withFileTypes: true });
  } catch (e) {
    return results;
  }

  for (var i = 0; i < entries.length; i++) {
    var entry = entries[i];
    var fullPath = path.join(folderPath, entry.name);

    if (entry.isFile()) {
      try {
        var stat = fs.statSync(fullPath);
        if (stat.size >= minSize) {
          results.push({ path: fullPath, size: stat.size });
        }
      } catch (e) { /* skip */ }
    } else if (entry.isDirectory() && currentDepth < maxDepth) {
      var subResults = findLargeFiles(fullPath, minSize, currentDepth + 1, maxDepth);
      results = results.concat(subResults);
    }
  }

  return results;
}

// ===== Command =====

module.exports = {
  description: 'Show folder size/file count stats or find large files in a directory',
  run(args) {
    // Parse arguments
    var folderPath = null;
    var depth = 3;
    var largeSize = null;
    var jsonOutput = false;

    for (var i = 0; i < args.length; i++) {
      if (args[i] === '--depth' && args[i + 1]) {
        depth = parseInt(args[i + 1], 10);
        if (isNaN(depth) || depth < 1) depth = 3;
        i++;
      } else if (args[i] === '--large' && args[i + 1]) {
        largeSize = parseSize(args[i + 1]);
        if (!largeSize) {
          console.error('Invalid size format: ' + args[i + 1]);
          console.error('Use format: 10MB, 500KB, 1GB');
          process.exit(1);
        }
        i++;
      } else if (args[i] === '--json') {
        jsonOutput = true;
      } else if (!args[i].startsWith('--')) {
        folderPath = args[i];
      }
    }

    if (!folderPath) {
      console.log('Usage:');
      console.log('  folderStats <folder-path>                  Show folder sizes (default 3 levels)');
      console.log('  folderStats <folder-path> --depth 5        Show folder sizes (5 levels deep)');
      console.log('  folderStats <folder-path> --large 10MB     Find files larger than 10MB');
      console.log('  folderStats <folder-path> --large 1GB --depth 5');
      console.log('  folderStats <folder-path> --json           Output as JSON (for jsongrid.com)');
      console.log('');
      console.log('Options:');
      console.log('  --depth <n>     Max recursion depth (default: 3)');
      console.log('  --large <size>  Find files exceeding size (e.g. 10MB, 500KB, 1GB)');
      console.log('  --json          Output in JSON format (flat array for grid viewers)');
      process.exit(0);
    }

    // Resolve path
    folderPath = path.resolve(folderPath);

    if (!fs.existsSync(folderPath)) {
      console.error('Error: Folder does not exist: ' + folderPath);
      process.exit(1);
    }

    var stat = fs.statSync(folderPath);
    if (!stat.isDirectory()) {
      console.error('Error: Path is not a directory: ' + folderPath);
      process.exit(1);
    }

    var output = '';

    if (largeSize) {
      // Large file finder mode
      var sizeLabel = args[args.indexOf('--large') + 1];
      var files = findLargeFiles(folderPath, largeSize, 0, depth);
      files.sort(function (a, b) { return b.size - a.size; });

      if (jsonOutput) {
        var jsonData = files.map(function (f) {
          return {
            path: f.path,
            fileName: path.basename(f.path),
            folder: path.dirname(f.path),
            sizeBytes: f.size,
            size: formatSize(f.size)
          };
        });
        output = JSON.stringify(jsonData, null, 2);
      } else {
        output += 'Large Files (> ' + sizeLabel + ') in ' + folderPath + ' (depth: ' + depth + ')\n';
        output += '\u2550'.repeat(60) + '\n\n';

        if (files.length === 0) {
          output += '  No files found exceeding ' + sizeLabel + '\n';
        } else {
          var totalSize = 0;
          files.forEach(function (f) {
            output += '  ' + formatSize(f.size).padStart(10) + '  ' + f.path + '\n';
            totalSize += f.size;
          });

          output += '\n' + '\u2500'.repeat(60) + '\n';
          output += files.length + ' file(s) found \u00b7 Total: ' + formatSize(totalSize) + '\n';
        }
      }
    } else {
      // Folder stats mode
      var stats = getFolderStats(folderPath, 0, depth);

      if (jsonOutput) {
        var jsonRows = [];
        flattenStatsToRows(stats, 0, jsonRows);
        output = JSON.stringify(jsonRows, null, 2);
      } else {
        output += 'Folder Stats: ' + folderPath + ' (depth: ' + depth + ')\n';
        output += '\u2550'.repeat(60) + '\n\n';

        var lines = [];
        renderStatsTree(stats, '', true, lines);
        lines[0] = stats.path + '  ' + formatSize(stats.size).padStart(10) + '  ' + (stats.fileCount + ' file' + (stats.fileCount !== 1 ? 's' : '')).padStart(12);
        output += lines.join('\n') + '\n';
      }
    }

    // Display output
    console.log(output);

    // Copy to clipboard
    copyToClipboard(output);
    console.log('(Output copied to clipboard)');
  },
};
