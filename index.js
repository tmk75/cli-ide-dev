const path = require('path');
const { getConfig, saveConfig, getState, saveState, recordTelemetry } = require('./lib/config');
const { detectTools } = require('./lib/detect');
const { listChildDirs, listAllProjects, classifyProjectPath, getGitInfo } = require('./lib/projects');
const { scanProject } = require('./lib/security');
const { pickList } = require('./lib/picker');
const { launchTool, openGitHub } = require('./lib/launch');
const { printProviders, configureProvider, resolveProviderId } = require('./lib/providers');
const { scanCompliance, complianceStatus, formatComplianceReport } = require('./lib/compliance');
const { startServer } = require('./lib/web');
const { createProject } = require('./lib/newproject');
const { runCodeCheck } = require('./lib/codecheck');
const { previewCleanup, performCleanup } = require('./lib/cleanup');

const KIND_ORDER = { agent: 0, ide: 1, terminal: 2 };

function findProject(name) {
  const cfg = getConfig();
  const projects = listAllProjects(cfg.developmentRoot || process.cwd());
  return projects.find((p) => p.name.toLowerCase() === String(name || '').toLowerCase());
}

function projectLabel(project) {
  const cls = classifyProjectPath(project.path);
  const git = getGitInfo(project.path);
  const secrets = scanProject(project.path);
  const tags = [];

  if (git && !git.error) {
    tags.push(`git:${git.branch}${git.aheadBehind ? ' ' + git.aheadBehind : ''}${git.dirty ? ` ~${git.dirty}` : ''}`);
  }
  if (secrets.length) {
    tags.push(`secrets:${secrets.length}`);
  } else if (!cls.markerCount) {
    tags.push('plain folder');
  }

  const cfg = getConfig();
  if (cfg.complianceCheck !== false) {
    const compliance = complianceStatus(project.path);
    if (compliance.count) {
      tags.push('comp:⚠');
    } else {
      tags.push(compliance.enabled ? 'comp:☑' : 'comp:☐');
    }
  }

  return `${project.name}${tags.length ? '  [' + tags.join(' · ') + ']' : ''}`;
}

async function pickProjectTree(root) {
  let current = root;

  while (true) {
    const children = listChildDirs(current);
    const items = [];

    if (current !== root) {
      items.push({ value: { type: 'up' }, label: '.. (up)' });
    }

    for (const child of children) {
      if (child.isProject) {
        items.push({ value: { type: 'project', child }, label: `${child.name}  [project]` });
        if (child.hasChildren) {
          items.push({ value: { type: 'group', child }, label: `${child.name}/  [browse subprojects]` });
        }
      } else {
        items.push({ value: { type: 'group', child }, label: `${child.name}/` });
      }
    }

    const pick = await pickList({ title: `Browse: ${current}`, items });
    if (!pick) return null;

    if (pick.value.type === 'up') {
      current = path.dirname(current);
    } else if (pick.value.type === 'group') {
      current = pick.value.child.path;
    } else if (pick.value.type === 'project') {
      return pick.value.child;
    }
  }
}

async function interactive() {
  const cfg = getConfig();
  const root = cfg.developmentRoot || process.cwd();
  if (!root) {
    console.error(`No project folders found under: ${cfg.developmentRoot || process.cwd()}`);
    process.exit(1);
  }

  const project = await pickProjectTree(root);
  if (!project) {
    console.log('Cancelled.');
    return;
  }

  if (cfg.complianceCheck !== false) {
    const compliance = complianceStatus(project.path);
    if (compliance.count) {
      console.log(`\n⚠ Compliance quick scan: ${compliance.count} high-risk signal(s) in ${project.name}.`);
      console.log(`  Run: devopen compliance "${project.name}" for details.\n`);
    }
  }

  const tools = detectTools();
  if (!tools.length) {
    console.error('No CLIs, IDEs, or agents detected. Check tools.json.');
    process.exit(1);
  }

  tools.sort(
    (a, b) =>
      (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) ||
      a.label.localeCompare(b.label),
  );

  const toolItems = tools.map((tool) => ({
    value: tool,
    label: `[${tool.kind.toUpperCase().padEnd(8)}] ${tool.label}`,
  }));

  const toolPick = await pickList({ title: `Tool for ${project.name}`, items: toolItems });
  if (!toolPick) {
    console.log('Cancelled.');
    return;
  }
  const tool = toolPick.value;

  const confirmPick = await pickList({
    title: `Launch ${tool.label} in ${project.name}?`,
    items: [
      { value: true, label: 'Launch now' },
      { value: false, label: 'Cancel' },
    ],
  });
  if (!confirmPick || !confirmPick.value) {
    console.log('Cancelled.');
    return;
  }

  const secrets = scanProject(project.path);
  if (secrets.length) {
    console.log('\n⚠ Sensitive files detected:');
    for (const finding of secrets) {
      console.log(`  - ${finding.label}: ${finding.file}`);
    }
    console.log('');
  }

  const profile =
    cfg.defaultProfile && cfg.profiles && cfg.profiles[cfg.defaultProfile]
      ? cfg.profiles[cfg.defaultProfile]
      : null;

  launchTool(tool, project.path, profile);
  recordTelemetry(project.name, tool.id);
  console.log(`Launched ${tool.label} in ${project.path}`);
}

function listCommand() {
  const projects = listAllProjects(getConfig().developmentRoot || process.cwd());
  if (!projects.length) {
    console.log('No projects found.');
    return;
  }
  for (const project of projects) {
    console.log(projectLabel(project));
    console.log(`  ${project.path}`);
  }
}

function toolsCommand() {
  const tools = detectTools();
  if (!tools.length) {
    console.log('No tools detected.');
    return;
  }
  const order = { agent: 0, ide: 1, terminal: 2 };
  tools.sort(
    (a, b) =>
      (order[a.kind] ?? 9) - (order[b.kind] ?? 9) || a.label.localeCompare(b.label),
  );
  for (const tool of tools) {
    console.log(`[${tool.kind.toUpperCase().padEnd(8)}] ${tool.label}`);
    console.log(`  ${tool.exe}`);
    if (resolveProviderId(tool)) console.log(`  provider: ${resolveProviderId(tool)}`);
  }
}

function statsCommand() {
  const state = getState();
  const telemetry = Array.isArray(state.telemetry) ? state.telemetry : [];
  if (!telemetry.length) {
    console.log('No usage recorded yet.');
    return;
  }

  const byTool = {};
  const byProject = {};
  for (const row of telemetry) {
    byTool[row.tool] = (byTool[row.tool] || 0) + 1;
    byProject[row.project] = (byProject[row.project] || 0) + 1;
  }

  console.log('Usage (total launches: ' + telemetry.length + ')');
  console.log('\nBy tool:');
  for (const [key, count] of Object.entries(byTool).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
  console.log('\nBy project:');
  for (const [key, count] of Object.entries(byProject).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${key}: ${count}`);
  }
  if (state.last) {
    console.log(`\nLast: ${state.last.project} with ${state.last.tool}`);
  }
}

function ghCommand(projectName) {
  const project = findProject(projectName);
  if (!project) {
    console.error(`Project not found: ${projectName}`);
    process.exit(1);
  }
  const url = openGitHub(project.path);
  if (!url) {
    console.error(`No Git remote found for ${project.name}.`);
    process.exit(1);
  }
  console.log(`Opened ${url}`);
}

function complianceCommand(projectName) {
  if (!projectName) {
    console.error('Usage: devopen compliance <project>');
    process.exit(1);
  }
  const projects = listProjects();
  const project = projects.find((p) => p.name.toLowerCase() === String(projectName).toLowerCase());
  if (!project) {
    console.error(`Project not found: ${projectName}`);
    process.exit(1);
  }
  const result = scanCompliance(project.path);
  console.log(formatComplianceReport(project.name, project.path, result));
}

function newCommand(args) {
  const name = args.find((arg) => !arg.startsWith('-'));
  const compliance = args.includes('--compliance');
  if (!name) {
    console.error('Usage: devopen new <name> [--compliance]');
    process.exit(1);
  }
  try {
    const target = createProject(name, { compliance });
    console.log(`Created ${target}${compliance ? ' (CSL/DSL/PIPL framework enabled)' : ''}`);
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

async function checkCommand(projectName) {
  const project = findProject(projectName);
  if (!project) {
    console.error(`Project not found: ${projectName}`);
    process.exit(1);
  }
  console.log(`Running code check on ${project.name}...`);
  const result = await runCodeCheck(project.path);
  console.log(`\n$ ${result.command}\n`);
  console.log(result.output || '(no output)');
  console.log(`\nExit code: ${result.code}`);
}

function cleanCommand(args) {
  const name = args.find((arg) => !arg.startsWith('--'));
  const yes = args.includes('--yes');
  if (!name) {
    console.error('Usage: devopen clean <name> [--yes]');
    process.exit(1);
  }
  const project = findProject(name);
  if (!project) {
    console.error(`Project not found: ${name}`);
    process.exit(1);
  }

  const targets = previewCleanup(project.path);
  if (!targets.length) {
    console.log('Nothing to clean.');
    return;
  }

  if (!yes) {
    console.log('Would remove:');
    for (const target of targets) {
      console.log(`  [${target.type}] ${target.path}`);
    }
    console.log(`\nRun: devopen clean "${project.name}" --yes  to actually remove.`);
    return;
  }

  const removed = performCleanup(project.path);
  console.log(`Removed ${removed.length} item(s):`);
  for (const file of removed) console.log(`  ${file}`);
}

function webCommand() {
  const cfg = getConfig();
  const port =
    Number(process.env.DEVOPEN_WEB_PORT) ||
    Number(cfg.webPort) ||
    8787;
  startServer(port);
  console.log('Press Ctrl+C to stop.');
}

function favoriteCommand(projectName) {
  const project = findProject(projectName);
  if (!project) {
    console.error(`Project not found: ${projectName}`);
    process.exit(1);
  }
  const state = getState();
  state.favorites = Array.isArray(state.favorites) ? state.favorites : [];
  const exists = state.favorites.includes(project.name);
  if (exists) {
    state.favorites = state.favorites.filter((name) => name !== project.name);
    console.log(`Removed ${project.name} from favorites.`);
  } else {
    state.favorites.push(project.name);
    console.log(`Added ${project.name} to favorites.`);
  }
  saveState(state);
}

function profileCommand(args) {
  const cfg = getConfig();
  cfg.profiles = cfg.profiles || {};

  if (args[0] === 'add') {
    const [, name, gitName, gitEmail] = args;
    if (!name || !gitName || !gitEmail) {
      console.log('Usage: devopen profile add <name> <gitName> <gitEmail>');
      process.exit(1);
    }
    cfg.profiles[name] = { gitName, gitEmail, env: {} };
    saveConfig(cfg);
    console.log(`Added profile "${name}".`);
    return;
  }

  if (!args[0]) {
    console.log('Profiles:');
    for (const [name, profile] of Object.entries(cfg.profiles)) {
      const active = cfg.defaultProfile === name ? ' (default)' : '';
      console.log(`  ${name}${active}  ${profile.gitName || ''} <${profile.gitEmail || ''}>`);
    }
    if (!Object.keys(cfg.profiles).length) console.log('  (none)');
    return;
  }

  const name = args[0];
  if (!cfg.profiles[name]) {
    console.error(`Profile not found: ${name}`);
    process.exit(1);
  }
  cfg.defaultProfile = name;
  saveConfig(cfg);
  console.log(`Set default profile to "${name}".`);
}

function help() {
  console.log(`devopen — project launcher

Usage:
  node index.js                 Interactive: pick project, then tool, confirm, launch.
  node index.js list            List projects with Git/secret hints.
  node index.js tools           List detected CLIs/IDEs/agents.
  node index.js providers       List AI providers and routing.
  node index.js provider        Interactively set an editor/agent's provider.
  node index.js compliance <name>  Run a CSL/DSL/PIPL code-level check on a project.
  node index.js web            Start the browser UI on http://localhost:8787.
  node index.js new <name> [--compliance]  Create a project, optionally with compliance.
  node index.js check <name>   Run a project-type-aware code check.
  node index.js clean <name> [--yes]  Preview or remove build/cache artifacts.
  node index.js profile [name]  List profiles or set the default profile.
  node index.js profile add <name> <gitName> <gitEmail>
  node index.js favorite <name> Toggle a project favorite.
  node index.js stats           Show your launch usage.
  node index.js gh <name>       Open a project's GitHub remote in the browser.`);
}

async function main() {
  const [command, ...args] = process.argv.slice(2);
  switch (command) {
    case undefined:
    case 'open':
      await interactive();
      break;
    case 'list':
    case 'projects':
      listCommand();
      break;
    case 'tools':
      toolsCommand();
      break;
    case 'providers':
      printProviders();
      break;
    case 'provider':
      await configureProvider();
      break;
    case 'profile':
      profileCommand(args);
      break;
    case 'favorite':
      favoriteCommand(args[0]);
      break;
    case 'stats':
      statsCommand();
      break;
    case 'gh':
      ghCommand(args[0]);
      break;
    case 'compliance':
      complianceCommand(args[0]);
      break;
    case 'web':
    case 'localhost':
      webCommand();
      break;
    case 'new':
      newCommand(args);
      break;
    case 'check':
      await checkCommand(args[0]);
      break;
    case 'clean':
      cleanCommand(args);
      break;
    case 'help':
    case '--help':
    case '-h':
      help();
      break;
    default:
      console.error(`Unknown command: ${command}`);
      help();
      process.exit(1);
  }
}

main();
