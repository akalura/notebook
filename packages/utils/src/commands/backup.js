const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const MYUTILS_ROOT = 'C:\\myUtils';
const BACKUP_DIR = path.join(MYUTILS_ROOT, 'backup');
const ATTACHMENTS_DIR = path.join(MYUTILS_ROOT, 'notebook_attachments');

// Folders to exclude from full backup (relative to MYUTILS_ROOT)
const EXCLUDE_RELATIVE = [
  'tempFiles',
  'backup',
  'nodejs\\node_modules',
  'nodejs\\.vscode'
];

module.exports = {
  description: 'Backup project files or attachments to C:\\myUtils\\backup as a ZIP',
  async run(args) {
    const attachmentsOnly = args.includes('--attachments') || args.includes('-a');
    const fullBackup = args.includes('--full') || args.includes('-f');

    if (!attachmentsOnly && !fullBackup) {
      console.log('Usage:');
      console.log('  backup --full          Full backup of C:\\myUtils (excluding temp, node_modules, etc.)');
      console.log('  backup --attachments   Backup only C:\\myUtils\\notebook_attachments');
      console.log('');
      console.log('Flags:');
      console.log('  --full, -f             Full project backup');
      console.log('  --attachments, -a      Attachments only backup');
      process.exit(0);
    }

    // Ensure backup directory exists
    if (!fs.existsSync(BACKUP_DIR)) {
      fs.mkdirSync(BACKUP_DIR, { recursive: true });
    }

    var date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    var zipName, sourceDir;

    if (attachmentsOnly) {
      zipName = 'attachments-backup-' + date + '.zip';
      sourceDir = ATTACHMENTS_DIR;

      if (!fs.existsSync(sourceDir)) {
        console.error('Error: Attachments folder does not exist: ' + sourceDir);
        process.exit(1);
      }

      console.log('Backup Type: Attachments Only');
      console.log('Source:      ' + sourceDir);
    } else {
      zipName = 'full-backup-' + date + '.zip';
      sourceDir = MYUTILS_ROOT;

      console.log('Backup Type: Full Project');
      console.log('Source:      ' + sourceDir);
      console.log('Excluding:');
      EXCLUDE_RELATIVE.forEach(function (f) { console.log('  - ' + f); });
    }

    var zipPath = path.join(BACKUP_DIR, zipName);
    console.log('Destination: ' + zipPath);
    console.log('---');
    console.log('Creating backup...');

    try {
      if (attachmentsOnly) {
        // Simple zip of attachments folder
        var psCmd = "Compress-Archive -Path '" + sourceDir + "\\*' -DestinationPath '" + zipPath + "' -Force";
        execSync('powershell -NoProfile -Command "' + psCmd + '"', { stdio: 'pipe', timeout: 300000 });
      } else {
        // Full backup: use robocopy to a temp staging folder, then zip
        var stagingDir = path.join(BACKUP_DIR, '_staging_' + Date.now());

        // Build robocopy exclude args
        var excludeDirs = EXCLUDE_RELATIVE.map(function (rel) {
          return path.join(MYUTILS_ROOT, rel);
        });
        var xdArgs = excludeDirs.map(function (d) { return '"' + d + '"'; }).join(' ');

        console.log('Staging files (excluding folders)...');

        // Robocopy: /E=recurse, /XD=exclude dirs, /NFL /NDL /NJH /NJS = quiet
        var roboCmd = 'robocopy "' + MYUTILS_ROOT + '" "' + stagingDir + '" /E /XD ' + xdArgs + ' /NFL /NDL /NJH /NJS /NC /NS /NP';
        try {
          execSync(roboCmd, { stdio: 'pipe', timeout: 300000 });
        } catch (roboErr) {
          // Robocopy returns non-zero for success (1=copied, 2=extras, etc.)
          // Only 8+ is a real error
          if (roboErr.status >= 8) {
            throw new Error('Robocopy failed with exit code ' + roboErr.status);
          }
        }

        console.log('Compressing...');
        var zipCmd = "Compress-Archive -Path '" + stagingDir + "\\*' -DestinationPath '" + zipPath + "' -Force";
        execSync('powershell -NoProfile -Command "' + zipCmd + '"', { stdio: 'pipe', timeout: 300000 });

        // Clean up staging
        console.log('Cleaning up staging folder...');
        execSync('rmdir /s /q "' + stagingDir + '"', { stdio: 'pipe' });
      }

      // Verify the zip was created
      if (!fs.existsSync(zipPath)) {
        throw new Error('ZIP file was not created');
      }

      var stat = fs.statSync(zipPath);
      var sizeMB = (stat.size / (1024 * 1024)).toFixed(2);

      console.log('---');
      console.log('Backup complete!');
      console.log('  File: ' + zipName);
      console.log('  Size: ' + sizeMB + ' MB');
      console.log('  Path: ' + zipPath);

    } catch (err) {
      console.error('Backup failed:', err.message || err);
      process.exit(1);
    }
  },
};
