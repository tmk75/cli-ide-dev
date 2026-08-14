const { spawn, spawnSync, execFileSync } = require('child_process');
const { expandEnv, psQuote, isCmdFile } = require('./util');

const POWERSHELL = 'C:\\WINDOWS\\System32\\WindowsPowerShell\\v1.0\\powershell.exe';

function buildEnv(profile) {
  const env = { ...process.env };
  if (profile) {
    if (profile.gitName) {
      env.GIT_AUTHOR_NAME = profile.gitName;
      env.GIT_COMMITTER_NAME = profile.gitName;
    }
    if (profile.gitEmail) {
      env.GIT_AUTHOR_EMAIL = profile.gitEmail;
      env.GIT_COMMITTER_EMAIL = profile.gitEmail;
    }
    Object.assign(env, profile.env || {});
  }
  return env;
}

function cmdEscapeArg(arg) {
  return '"' + String(arg).replace(/"/g, '""') + '"';
}

function cmdQuote(arg) {
  return '"' + String(arg).replace(/"/g, '""') + '"';
}

function buildCmdLine(exe, args) {
  return [exe, ...args].map(cmdEscapeArg).join(' ');
}

function spawnCmdFile(exe, args, opts = {}) {
  return spawn(buildCmdLine(exe, args), { ...opts, shell: true });
}

function startProcess(exe, args, cwd, env, hidden = false) {
  const argString = args.map((arg) => cmdQuote(String(arg))).join(' ');
  const windowStyle = hidden ? '-WindowStyle Hidden' : '';
  const parts = ['Start-Process', '-FilePath', psQuote(exe)];
  if (args.length) {
    parts.push('-ArgumentList', psQuote(argString));
  }
  parts.push('-WorkingDirectory', psQuote(cwd), windowStyle);
  const script = parts.join(' ');

  const result = spawnSync(
    POWERSHELL,
    ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', script],
    { cwd, env, encoding: 'utf8', timeout: 20000 },
  );

  if (result.error) throw result.error;
  if (result.status !== 0 && result.status !== null) {
    throw new Error(result.stderr || 'Start-Process failed');
  }
}

function buildLaunchArgs(type, declaredArgs, projectPath) {
  switch (type) {
    case 'wt':
      return { args: ['-d', projectPath], hidden: false };
    case 'powershell':
    case 'cmd':
    case 'git-bash':
      return { args: [], hidden: false };
    case 'wsl':
      return { args: ['--cd', projectPath], hidden: false };
    case 'cmd-folder':
      return { args: declaredArgs, hidden: true };
    case 'exe-folder':
    default:
      return { args: declaredArgs, hidden: false };
  }
}

function launchTool(tool, projectPath, profile) {
  const exe = expandEnv(tool.launch.exe);
  const declaredArgs = (tool.launch.args || []).map((arg) =>
    expandEnv(arg).replace(/\{project\}/g, projectPath),
  );
  const env = buildEnv(profile);
  const type = tool.launch.type || 'exe-folder';

  if (tool.kind === 'agent' || type === 'agent') {
    const child = isCmdFile(exe)
      ? spawnCmdFile(exe, declaredArgs, { cwd: projectPath, stdio: 'inherit', env })
      : spawn(exe, declaredArgs, { cwd: projectPath, stdio: 'inherit', env });
    child.on('exit', (code) => process.exit(code === null ? 0 : code));
    return child;
  }

  const { args, hidden } = buildLaunchArgs(type, declaredArgs, projectPath);
  startProcess(exe, args, projectPath, env, hidden);
}

function launchToolWeb(tool, projectPath, profile) {
  const exe = expandEnv(tool.launch.exe);
  const declaredArgs = (tool.launch.args || []).map((arg) =>
    expandEnv(arg).replace(/\{project\}/g, projectPath),
  );
  const env = buildEnv(profile);

  if (tool.kind === 'agent') {
    const wtExe = process.env.LOCALAPPDATA + '\\Microsoft\\WindowsApps\\wt.exe';
    startProcess(wtExe, ['-d', projectPath, 'cmd.exe', '/k', exe], projectPath, env, false);
    return;
  }

  const { args, hidden } = buildLaunchArgs(tool.launch.type || 'exe-folder', declaredArgs, projectPath);
  startProcess(exe, args, projectPath, env, hidden);
}

function getGitRemote(projectPath) {
  try {
    const out = execFileSync(
      'git',
      ['-C', projectPath, 'remote', 'get-url', 'origin'],
      { encoding: 'utf8', timeout: 3000, stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim();

    if (!out) return null;
    if (out.startsWith('git@')) {
      return 'https://' + out.replace(/^git@([^:]+):/, '$1/').replace(/\.git$/, '');
    }
    return out.replace(/\.git$/, '');
  } catch {
    return null;
  }
}

function openGitHub(projectPath) {
  const url = getGitRemote(projectPath);
  if (!url) return null;
  startProcess('cmd.exe', ['/c', 'start', '', url], projectPath, process.env, true);
  return url;
}

module.exports = { launchTool, launchToolWeb, getGitRemote, openGitHub };
