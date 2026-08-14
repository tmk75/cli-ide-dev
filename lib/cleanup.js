const fs = require('fs');
const path = require('path');

const DEFAULT_DIRS = [
  '__pycache__', '.pytest_cache', '.mypy_cache', '.ruff_cache', '.next', '.nuxt',
  '.cache', '.expo', '.turbo', 'coverage', '.parcel-cache', '.vite', 'target', 'dist', 'build',
];

const DEFAULT_FILE_EXTS = ['.pyc', '.pyo', '.log'];
const SKIP_DIRS = new Set(['node_modules', '.git', '.venv', 'venv']);

function collectCleanTargets(projectPath, maxDepth = 6) {
  const targets = [];

  function walk(dir, depth) {
    if (depth > maxDepth) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        if (DEFAULT_DIRS.includes(entry.name)) {
          targets.push({ path: full, type: 'dir' });
        } else {
          walk(full, depth + 1);
        }
      } else if (entry.isFile() && DEFAULT_FILE_EXTS.includes(path.extname(entry.name).toLowerCase())) {
        targets.push({ path: full, type: 'file' });
      }
    }
  }

  walk(projectPath, 0);
  return targets;
}

function previewCleanup(projectPath) {
  return collectCleanTargets(projectPath);
}

function performCleanup(projectPath) {
  const targets = collectCleanTargets(projectPath);
  const root = path.resolve(projectPath);
  const removed = [];

  for (const target of targets) {
    const resolved = path.resolve(target.path);
    if (resolved !== root && !resolved.startsWith(root + path.sep)) continue;
    try {
      fs.rmSync(resolved, { recursive: true, force: true });
      removed.push(resolved);
    } catch {}
  }

  return removed;
}

module.exports = { previewCleanup, performCleanup };
