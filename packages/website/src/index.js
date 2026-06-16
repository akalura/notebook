const express = require('express');
const path = require('path');
const fs = require('fs');
const multer = require('multer');

const app = express();
const PORT = process.env.PORT || 4000;

// Backup folder (use BACKUP_DIR env var or default)
const BACKUP_DIR = process.env.BACKUP_DIR || path.join(__dirname, '../backup');
const GDRIVE_BACKUP_DIR = 'G:\\My Drive\\notebook-backup';
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}
if (!fs.existsSync(GDRIVE_BACKUP_DIR)) {
  fs.mkdirSync(GDRIVE_BACKUP_DIR, { recursive: true });
}

// Multer for file uploads
const upload = multer({
  dest: BACKUP_DIR,
  limits: { fileSize: 100 * 1024 * 1024 } // 100MB max
});

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
