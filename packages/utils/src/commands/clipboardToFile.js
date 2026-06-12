const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const OUTPUT_DIR = 'C:\\myUtils\\tempFiles';

/**
 * Read clipboard content using PowerShell (Windows).
 */
function readClipboard() {
  const result = execSync('powershell -command "Get-Clipboard -Raw"', {
    encoding: 'utf-8',
  });
  return result;
}

/**
 * Write text to clipboard using PowerShell (Windows).
 */
function writeClipboard(text) {
  execSync(`powershell -command "Set-Clipboard -Value '${text.replace(/'/g, "''")}'"`);
}

/**
 * Detect the content type and return { type, extension, formatted }.
 */
function detectAndFormat(content) {
  const trimmed = content.trim();

  // Try JSON
  try {
    const parsed = JSON.parse(trimmed);
    return {
      type: 'json',
      extension: '.json',
      formatted: JSON.stringify(parsed, null, 2),
    };
  } catch (_) {
    // not JSON
  }

  // Try YAML (basic heuristic — key: value patterns, no braces/brackets start)
  if (looksLikeYaml(trimmed)) {
    try {
      const yaml = require('js-yaml');
      const parsed = yaml.load(trimmed);
      if (parsed && typeof parsed === 'object') {
        return {
          type: 'yaml',
          extension: '.yaml',
          formatted: yaml.dump(parsed, { indent: 2, lineWidth: 120 }),
        };
      }
    } catch (_) {
      // not valid yaml
    }
  }

  // Try XML (starts with < and contains closing tags)
  if (trimmed.startsWith('<') && trimmed.includes('</')) {
    return {
      type: 'xml',
      extension: '.xml',
      formatted: formatXml(trimmed),
    };
  }

  // Try CSV (multiple lines with consistent comma-separated values)
  if (looksLikeCsv(trimmed)) {
    return {
      type: 'csv',
      extension: '.csv',
      formatted: trimmed,
    };
  }

  // Try SQL
  if (looksLikeSql(trimmed)) {
    return {
      type: 'sql',
      extension: '.sql',
      formatted: trimmed,
    };
  }

  // Try HTML (contains common html tags but isn't strict XML)
  if (/<html|<body|<div|<span|<head/i.test(trimmed)) {
    return {
      type: 'html',
      extension: '.html',
      formatted: formatXml(trimmed),
    };
  }

  // Try Markdown (headings, lists, links)
  if (looksLikeMarkdown(trimmed)) {
    return {
      type: 'markdown',
      extension: '.md',
      formatted: trimmed,
    };
  }

  // Default: plain text
  return {
    type: 'text',
    extension: '.txt',
    formatted: trimmed,
  };
}

function looksLikeYaml(text) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length === 0) return false;
  // YAML typically has key: value lines or starts with ---
  if (text.startsWith('---')) return true;
  const keyValuePattern = /^\s*[\w.-]+\s*:/;
  const matchCount = lines.filter((l) => keyValuePattern.test(l)).length;
  return matchCount / lines.length > 0.4;
}

function looksLikeCsv(text) {
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return false;
  const commaCount = lines[0].split(',').length;
  if (commaCount < 2) return false;
  // Check if most lines have similar column count
  const consistent = lines.filter((l) => {
    const cols = l.split(',').length;
    return Math.abs(cols - commaCount) <= 1;
  });
  return consistent.length / lines.length > 0.8;
}

function looksLikeSql(text) {
  const sqlKeywords = /^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP|WITH)\b/im;
  return sqlKeywords.test(text);
}

function looksLikeMarkdown(text) {
  const mdPatterns = [
    /^#{1,6}\s+/m, // headings
    /^\s*[-*+]\s+/m, // unordered lists
    /^\s*\d+\.\s+/m, // ordered lists
    /\[.+\]\(.+\)/, // links
    /```[\s\S]*```/, // code blocks
  ];
  const matches = mdPatterns.filter((p) => p.test(text)).length;
  return matches >= 2;
}

function formatXml(xml) {
  let formatted = '';
  let indent = 0;
  const parts = xml.replace(/(>)(<)/g, '$1\n$2').split('\n');

  parts.forEach((part) => {
    const trimmedPart = part.trim();
    if (!trimmedPart) return;

    if (trimmedPart.startsWith('</')) {
      indent = Math.max(indent - 1, 0);
    }
    formatted += '  '.repeat(indent) + trimmedPart + '\n';
    if (trimmedPart.startsWith('<') && !trimmedPart.startsWith('</') && !trimmedPart.endsWith('/>') && !trimmedPart.includes('</')) {
      indent++;
    }
  });

  return formatted;
}

/**
 * Generate a friendly, unique file name.
 * Format: <adjective>-<noun>-<short-id>
 */
function generateFileName() {
  const adjectives = [
    'quick', 'bright', 'calm', 'bold', 'cool', 'crisp', 'fair', 'fresh',
    'keen', 'light', 'neat', 'pure', 'sharp', 'smart', 'soft', 'warm',
  ];
  const nouns = [
    'clip', 'note', 'snap', 'file', 'data', 'page', 'item', 'leaf',
    'drop', 'spark', 'wave', 'star', 'seed', 'link', 'blob', 'chunk',
  ];

  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const id = crypto.randomBytes(3).toString('hex'); // 6 hex chars

  return `${adj}-${noun}-${id}`;
}

module.exports = {
  description: 'Read clipboard, detect format, save to C:\\myUtils\\tempFiles, copy path to clipboard',
  run() {
    // 1. Read clipboard
    const content = readClipboard();
    if (!content || content.trim().length === 0) {
      console.error('Clipboard is empty.');
      process.exit(1);
    }

    // 2. Detect type and format
    const { type, extension, formatted } = detectAndFormat(content);
    console.log(`Detected content type: ${type}`);

    // 3. Ensure output directory exists
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    // 4. Generate file name and save
    const fileName = generateFileName() + extension;
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, formatted, 'utf-8');
    console.log(`File saved: ${filePath}`);

    // 5. Copy file path to clipboard
    writeClipboard(filePath);
    console.log('File path copied to clipboard.');
  },
};
