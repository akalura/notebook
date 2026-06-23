const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;

// Backup folder (use BACKUP_DIR env var or default)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backup');
const GDRIVE_BACKUP_DIR = 'G:\\My Drive\\notebook-backup';
const ATTACHMENTS_DIR = 'C:\\myUtils\\notebook_attachments';

if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(GDRIVE_BACKUP_DIR)) {
  fs.mkdirSync(GDRIVE_BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(ATTACHMENTS_DIR)) {
  fs.mkdirSync(ATTACHMENTS_DIR, { recursive: true });
}

// Multer for backup file uploads
const upload = multer({
  dest: BACKUP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

// Multer for attachment uploads (temp dir before moving to final location)
const attachTmpDir = path.join(ATTACHMENTS_DIR, '.tmp');
if (!fs.existsSync(attachTmpDir)) {
  fs.mkdirSync(attachTmpDir, { recursive: true });
}
const attachmentUpload = multer({
  dest: attachTmpDir,
  limits: { fileSize: 200 * 1024 * 1024 } // 200MB max
});

// ===== Helpers =====

function sanitizePathSegment(name) {
  // Replace forbidden Windows filesystem characters
  var safe = name.replace(/[<>:"\/\\|?*]/g, '_');
  // Replace control characters
  safe = safe.replace(/[\x00-\x1f]/g, '');
  // Trim leading/trailing dots and spaces
  safe = safe.replace(/^[\s.]+|[\s.]+$/g, '');
  // Collapse multiple underscores
  safe = safe.replace(/_+/g, '_');
  // Reserved Windows names
  if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(safe)) {
    safe = '_' + safe;
  }
  // Fallback
  if (!safe) safe = '_unnamed';
  // Limit length
  if (safe.length > 100) safe = safe.substring(0, 100);
  return safe;
}

function resolveVersionConflict(destDir, originalName) {
  var filePath = path.join(destDir, originalName);
  if (!fs.existsSync(filePath)) return originalName;

  // Split at last dot for extension
  var lastDot = originalName.lastIndexOf('.');
  var stem, ext;
  if (lastDot > 0) {
    stem = originalName.substring(0, lastDot);
    ext = originalName.substring(lastDot);
  } else {
    stem = originalName;
    ext = '';
  }

  var version = 2;
  while (fs.existsSync(path.join(destDir, stem + '_v' + version + ext))) {
    version++;
  }
  return stem + '_v' + version + ext;
}

// ===== Backup API (before static middleware) =====

// Save backup to server
app.post('/notebook/api/backup', upload.single('backup'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const newName = 'notebook-backup-' + date + '.zip';
  const newPath = path.join(BACKUP_DIR, newName);
  fs.renameSync(req.file.path, newPath);
  res.json({ success: true, filename: newName, size: req.file.size });
});

// List server backups
app.get('/notebook/api/backups', (req, res) => {
  const files = fs.readdirSync(BACKUP_DIR)
    .filter(f => f.endsWith('.zip'))
    .map(f => {
      const stat = fs.statSync(path.join(BACKUP_DIR, f));
      return { name: f, size: stat.size, date: stat.mtime.toISOString() };
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));
  res.json(files);
});

// Download a specific backup
app.get('/notebook/api/backup/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  res.download(filePath);
});

// Delete a specific backup
app.delete('/notebook/api/backup/:filename', (req, res) => {
  const filename = req.params.filename;
  if (filename.includes('..') || filename.includes('/') || filename.includes('\\')) {
    return res.status(400).json({ error: 'Invalid filename' });
  }
  const filePath = path.join(BACKUP_DIR, filename);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ error: 'Backup not found' });
  }
  fs.unlinkSync(filePath);
  res.json({ success: true });
});

// Save backup to Google Drive sync folder
app.post('/notebook/api/backup-gdrive', upload.single('backup'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }
  const date = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const newName = 'notebook-backup-' + date + '.zip';
  const newPath = path.join(GDRIVE_BACKUP_DIR, newName);
  try {
    fs.copyFileSync(req.file.path, newPath);
    fs.unlinkSync(req.file.path);
    res.json({ success: true, filename: newName, size: req.file.size, path: GDRIVE_BACKUP_DIR });
  } catch (err) {
    res.status(500).json({ error: 'Failed to save to Google Drive folder: ' + err.message });
  }
});

// List Google Drive backups
app.get('/notebook/api/backups-gdrive', (req, res) => {
  try {
    if (!fs.existsSync(GDRIVE_BACKUP_DIR)) {
      return res.json([]);
    }
    const files = fs.readdirSync(GDRIVE_BACKUP_DIR)
      .filter(f => f.endsWith('.zip'))
      .map(f => {
        const stat = fs.statSync(path.join(GDRIVE_BACKUP_DIR, f));
        return { name: f, size: stat.size, date: stat.mtime.toISOString() };
      })
      .sort((a, b) => new Date(b.date) - new Date(a.date));
    res.json(files);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===== Attachment API =====

// Upload attachment file
app.post('/notebook/api/attachment', attachmentUpload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No file uploaded' });
  }

  var notebookName = (req.body && req.body.notebookName) || '_default';
  var folderPath = (req.body && req.body.folderPath) || '';

  // Sanitize notebook name
  var safeNotebook = sanitizePathSegment(notebookName);

  // Sanitize folder path segments
  var safeFolders = [];
  if (folderPath && folderPath.trim()) {
    safeFolders = folderPath.split('/').filter(Boolean).map(sanitizePathSegment);
  }

  // Build destination directory
  var destDir = path.join(ATTACHMENTS_DIR, safeNotebook);
  if (safeFolders.length > 0) {
    destDir = path.join(destDir, ...safeFolders);
  }

  // Create directory structure
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  // Sanitize the original filename
  var originalName = req.file.originalname || 'unnamed_file';
  var safeFileName = sanitizePathSegment(originalName.replace(/\.[^.]+$/, ''));
  var extMatch = originalName.match(/\.[^.]+$/);
  var ext = extMatch ? extMatch[0].toLowerCase() : '';
  var targetName = safeFileName + ext;

  // Resolve version conflicts
  var finalName = resolveVersionConflict(destDir, targetName);
  var finalPath = path.join(destDir, finalName);

  // Move file from temp to destination
  try {
    fs.renameSync(req.file.path, finalPath);
  } catch (moveErr) {
    // Cross-device: copy then delete
    try {
      fs.copyFileSync(req.file.path, finalPath);
      fs.unlinkSync(req.file.path);
    } catch (copyErr) {
      return res.status(500).json({ error: 'Failed to store file: ' + copyErr.message });
    }
  }

  // Build relative path (from ATTACHMENTS_DIR)
  var relativePath = path.relative(ATTACHMENTS_DIR, finalPath).replace(/\\/g, '/');

  // Generate unique ID
  var attachId = 'attach-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);

  res.json({
    id: attachId,
    fileName: finalName,
    originalName: originalName,
    relativePath: relativePath,
    size: req.file.size,
    mimeType: req.file.mimetype || 'application/octet-stream'
  });
});

// Multer error handler (file size limit)
app.use(function (err, req, res, next) {
  if (err && err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ error: 'File exceeds maximum size of 200MB' });
  }
  next(err);
});

// ===== Staged Links API =====
const STAGED_LINKS_FILE = path.join(__dirname, '../staged-links.json');

// Parse JSON bodies
app.use(express.json({ limit: '10mb' }));

function readStagedLinks() {
  try {
    if (fs.existsSync(STAGED_LINKS_FILE)) {
      return JSON.parse(fs.readFileSync(STAGED_LINKS_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return [];
}

function writeStagedLinks(data) {
  fs.writeFileSync(STAGED_LINKS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Get all staged link batches
app.get('/notebook/api/staged-links', (req, res) => {
  res.json(readStagedLinks());
});

// Stage a new batch
app.post('/notebook/api/staged-links', (req, res) => {
  var batch = req.body;
  if (!batch || !batch.id) {
    return res.status(400).json({ error: 'Invalid batch: missing id' });
  }
  var existing = readStagedLinks();
  existing.push(batch);
  writeStagedLinks(existing);
  res.json({ success: true, id: batch.id });
});

// Delete a batch by id (after browser imports it)
app.delete('/notebook/api/staged-links/:id', (req, res) => {
  var id = req.params.id;
  var existing = readStagedLinks();
  var filtered = existing.filter(function (b) { return b.id !== id; });
  if (filtered.length === existing.length) {
    return res.status(404).json({ error: 'Batch not found' });
  }
  writeStagedLinks(filtered);
  res.json({ success: true });
});

// ===== Link Sync API =====
const { execFile } = require('child_process');
const SYNC_STATUS_FILE = path.join(__dirname, '../sync-status.json');

function readSyncStatus() {
  try {
    if (fs.existsSync(SYNC_STATUS_FILE)) {
      return JSON.parse(fs.readFileSync(SYNC_STATUS_FILE, 'utf8'));
    }
  } catch (e) { /* ignore */ }
  return { lastSync: null, lastResult: null, isRunning: false };
}

function writeSyncStatus(data) {
  fs.writeFileSync(SYNC_STATUS_FILE, JSON.stringify(data, null, 2), 'utf8');
}

// Get sync status
app.get('/notebook/api/sync-status', (req, res) => {
  res.json(readSyncStatus());
});

// Trigger sync
app.post('/notebook/api/sync-trigger', (req, res) => {
  var status = readSyncStatus();
  if (status.isRunning) {
    return res.status(409).json({ error: 'Sync is already running' });
  }

  var skipPreview = req.body && req.body.skipPreview;

  // Mark as running
  status.isRunning = true;
  status.startedAt = new Date().toISOString();
  writeSyncStatus(status);

  res.json({ success: true, message: 'Sync started' });

  // Run syncLinks as child process
  var args = [path.resolve(__dirname, '../../utils/src/index.js'), 'syncLinks'];
  if (skipPreview) args.push('--no-preview');

  var child = execFile('node', args, { timeout: 300000, cwd: path.resolve(__dirname, '../../utils') }, function (err, stdout, stderr) {
    var result = readSyncStatus();
    result.isRunning = false;
    result.lastSync = new Date().toISOString();
    if (err) {
      result.lastResult = { success: false, error: err.message, output: (stdout || '') + (stderr || '') };
    } else {
      result.lastResult = { success: true, output: stdout || '' };
    }
    writeSyncStatus(result);
  });
});

// ===== Static files & page routes =====

// Serve static files
app.use(express.static(path.join(__dirname, '../public')));

// Routes
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Notebook sub-application
app.get('/notebook', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/notebook/index.html'));
});

app.listen(PORT, () => {
  console.log(`Website server running at http://localhost:${PORT}`);
  console.log(`Notebook available at http://localhost:${PORT}/notebook`);
});
