const fs = require('fs');
const path = require('path');

const SENSITIVE_PATTERNS = [
  { pattern: /\.pem$/i, label: 'PEM key' },
  { pattern: /\.key$/i, label: 'private key' },
  { pattern: /id_rsa$/i, label: 'SSH private key' },
  { pattern: /apikey.*\.csv$/i, label: 'API key CSV' },
  { pattern: /\.env$/i, label: 'environment secrets' },
  { pattern: /\.ppk$/i, label: 'PuTTY private key' },
];

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build', '.venv', 'venv', '__pycache__']);

function scanProject(projectPath, maxDepth = 2) {
  const findings = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      for (const rule of SENSITIVE_PATTERNS) {
        if (rule.pattern.test(entry.name)) {
          findings.push({ file: full, label: rule.label });
        }
      }
      if (entry.isDirectory()) walk(full, depth + 1);
    }
  }

  walk(projectPath, 0);
  return findings;
}

module.exports = { scanProject };
