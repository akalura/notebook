const { execSync } = require('child_process');

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
  // Pipe content via stdin to avoid quoting issues
  execSync('powershell -command "$input | Set-Clipboard"', {
    input: text,
    encoding: 'utf-8',
  });
}

module.exports = {
  description: 'Replace literal \\n sequences in clipboard text with actual line breaks',
  run() {
    const content = readClipboard();
    if (!content || content.trim().length === 0) {
      console.error('Clipboard is empty.');
      process.exit(1);
    }

    // Replace literal \n (the two characters backslash + n) with real CRLF
    const converted = content.replace(/\\n/g, '\r\n');

    writeClipboard(converted);
    console.log('Done. Literal \\n sequences replaced with actual line breaks and copied to clipboard.');
  },
};
