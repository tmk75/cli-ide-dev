const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const SKIP_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'target', '.venv', 'venv',
  '__pycache__', '.next', '.nuxt', 'coverage', '.cache',
]);

function runCommand(cmd, args, cwd, timeoutMs = 60000) {
  return new Promise((resolve) => {
    const useShell = process.platform === 'win32' && /\.(cmd|bat)$/i.test(cmd);
    let child;
    try {
      child = spawn(cmd, args, { cwd, shell: useShell, env: process.env });
    } catch (error) {
      resolve({ code: -1, output: error.message });
      return;
    }

    let output = '';
    const timer = setTimeout(() => {
      try {
        child.kill('SIGKILL');
      } catch {}
      resolve({ code: -1, output: output + '\n[timed out]' });
    }, timeoutMs);

    child.stdout.on('data', (chunk) => (output += chunk.toString()));
    child.stderr.on('data', (chunk) => (output += chunk.toString()));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ code: -1, output: output + '\n' + error.message });
    });
    child.on('exit', (code) => {
      clearTimeout(timer);
      resolve({ code, output });
    });
  });
}

function collectFiles(root, extensions, maxFiles = 500) {
  const files = [];

  function walk(dir) {
    if (files.length >= maxFiles) return;
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }

    for (const entry of entries) {
      if (files.length >= maxFiles) return;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.')) continue;
        walk(full);
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name).toLowerCase())) {
        files.push(full);
      }
    }
  }

  walk(root);
  return files.slice(0, maxFiles);
}

async function nodeSyntaxCheck(root) {
  const files = collectFiles(root, ['.js', '.mjs', '.cjs']);
  let output = '';
  let failed = 0;

  for (const file of files) {
    const result = await runCommand('node', ['--check', file], root, 15000);
    if (result.code !== 0) {
      failed++;
      output += `FAIL ${file}\n${result.output}\n`;
    } else {
      output += `OK ${file}\n`;
    }
  }

  output += `\n${files.length - failed}/${files.length} JS files passed syntax check`;
  return { command: 'node --check (JS files)', code: failed ? 1 : 0, output };
}

async function runCodeCheck(projectPath) {
  const packageJson = path.join(projectPath, 'package.json');
  const cargoToml = path.join(projectPath, 'Cargo.toml');
  const pyproject = path.join(projectPath, 'pyproject.toml');
  const requirements = path.join(projectPath, 'requirements.txt');

  if (fs.existsSync(cargoToml)) {
    const result = await runCommand('cargo', ['check'], projectPath, 120000);
    return { command: 'cargo check', code: result.code, output: result.output };
  }

  if (fs.existsSync(packageJson)) {
    let scripts = {};
    try {
      scripts = JSON.parse(fs.readFileSync(packageJson, 'utf8')).scripts || {};
    } catch {}

    if (scripts.check) {
      const result = await runCommand('npm.cmd', ['run', 'check'], projectPath);
      return { command: 'npm run check', code: result.code, output: result.output };
    }
    if (scripts.lint) {
      const result = await runCommand('npm.cmd', ['run', 'lint'], projectPath);
      return { command: 'npm run lint', code: result.code, output: result.output };
    }
    if (scripts.test) {
      const result = await runCommand('npm.cmd', ['run', 'test'], projectPath);
      return { command: 'npm run test', code: result.code, output: result.output };
    }
    return nodeSyntaxCheck(projectPath);
  }

  if (fs.existsSync(pyproject) || fs.existsSync(requirements)) {
    const result = await runCommand('python', ['-m', 'compileall', '-q', '.'], projectPath);
    return { command: 'python -m compileall', code: result.code, output: result.output };
  }

  return {
    command: '(none detected)',
    code: 0,
    output: 'No recognized project type for a code check.',
  };
}

module.exports = { runCodeCheck };
