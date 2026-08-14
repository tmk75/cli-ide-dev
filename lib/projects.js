const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { getConfig } = require('./config');

const PROJECT_MARKERS = [
  '.git',
  'package.json',
  'pyproject.toml',
  'requirements.txt',
  'Cargo.toml',
  'go.mod',
  'pom.xml',
  'build.gradle',
  'build.gradle.kts',
  'docker-compose.yml',
  'docker-compose.yaml',
  'Dockerfile',
  'tsconfig.json',
  'next.config.js',
  'next.config.ts',
  '*.csproj',
  '*.sln',
];

const EXCLUDE_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', '.next', '.nuxt', '.venv', 'venv',
  '__pycache__', 'coverage', '.cache', '.idea', '.vscode', '.expo', '.turbo',
  '.parcel-cache', '.vite', '.pytest_cache', '.mypy_cache', '.ruff_cache',
  'builds', 'sample_repos', 'release', 'win-unpacked', 'tests', 'fixtures',
  'benchmark', 'bin', 'obj', 'out',
]);

function isExcludedDir(name) {
  return name.startsWith('.') || EXCLUDE_DIRS.has(name);
}

function classifyProjectPath(dirPath) {
  const present = {};

  for (const marker of PROJECT_MARKERS) {
    if (marker.startsWith('*')) {
      const ext = marker.slice(1);
      try {
        present[marker] = fs
          .readdirSync(dirPath, { withFileTypes: true })
          .some((entry) => entry.isFile() && entry.name.endsWith(ext));
      } catch {
        present[marker] = false;
      }
    } else {
      try {
        present[marker] = fs.existsSync(path.join(dirPath, marker));
      } catch {
        present[marker] = false;
      }
    }
  }

  const markers = PROJECT_MARKERS.filter((marker) => present[marker]);
  return {
    markers,
    markerCount: markers.length,
    hasGit: Boolean(present['.git']),
    isProject: markers.length > 0,
  };
}

function listChildDirs(dirPath, maxEntries = 200) {
  let entries;
  try {
    entries = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch {
    return [];
  }

  return entries
    .filter((entry) => entry.isDirectory() && !isExcludedDir(entry.name))
    .slice(0, maxEntries)
    .map((entry) => {
      const full = path.join(dirPath, entry.name);
      const classification = classifyProjectPath(full);
      let hasChildren = false;
      try {
        hasChildren = fs
          .readdirSync(full, { withFileTypes: true })
          .some((child) => child.isDirectory() && !isExcludedDir(child.name));
      } catch {}
      return {
        name: entry.name,
        path: full,
        isProject: classification.isProject,
        hasChildren,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function listAllProjects(root, maxDepth = 5, maxEntries = 1000) {
  const projects = [];

  function walk(dirPath, depth) {
    if (depth > maxDepth || projects.length >= maxEntries) return;
    for (const child of listChildDirs(dirPath, 500)) {
      if (projects.length >= maxEntries) return;
      if (child.isProject) {
        projects.push({ name: child.name, path: child.path });
      }
      if (child.hasChildren) {
        walk(child.path, depth + 1);
      }
    }
  }

  walk(root, 0);
  return projects;
}

function getGitInfo(projectPath) {
  if (!fs.existsSync(path.join(projectPath, '.git'))) return null;

  try {
    const out = execFileSync(
      'git',
      ['-C', projectPath, 'status', '--porcelain=v1', '--branch'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
    );
    const lines = out.split(/\r?\n/).filter(Boolean);
    const header = lines[0] || '';
    const match = header.match(/^##\s+(.+?)(?:\.\.\.(\S+))?\s*(?:\[(.*?)\])?$/);
    return {
      branch: match ? match[1].trim() : '?',
      aheadBehind: match && match[3] ? match[3] : '',
      dirty: Math.max(0, lines.length - 1),
    };
  } catch {
    return { branch: '?', aheadBehind: '', dirty: 0, error: true };
  }
}

module.exports = { listChildDirs, listAllProjects, classifyProjectPath, getGitInfo };
