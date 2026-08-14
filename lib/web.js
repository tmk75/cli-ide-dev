const http = require('http');
const fs = require('fs');
const path = require('path');
const { getConfig, recordTelemetry } = require('./config');
const { listChildDirs, listAllProjects, classifyProjectPath, getGitInfo } = require('./projects');
const { detectTools } = require('./detect');
const { launchToolWeb } = require('./launch');
const { createProject } = require('./newproject');
const { runCodeCheck } = require('./codecheck');
const { previewCleanup, performCleanup } = require('./cleanup');
const { scanCompliance, formatComplianceReport } = require('./compliance');

function launchLog(message) {
  try {
    const file = path.join(__dirname, '..', 'launch.log');
    fs.appendFileSync(file, `${new Date().toISOString()} ${message}\n`, 'utf8');
  } catch {}
}

const HTML = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>devopen</title>
<style>
  :root {
    color-scheme: dark;
    --bg: #0e1116;
    --panel: #151a21;
    --panel-2: #1a2028;
    --border: #242c36;
    --text: #e6e6e6;
    --muted: #8b98a5;
    --accent: #4f8cff;
    --hover: #1d252e;
    --selected: #263444;
  }
  * { box-sizing: border-box; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: "Segoe UI", system-ui, -apple-system, sans-serif;
    background: var(--bg);
    color: var(--text);
    display: flex;
    overflow: hidden;
  }

  .sidebar {
    width: 320px;
    min-width: 260px;
    height: 100vh;
    background: var(--panel);
    border-right: 1px solid var(--border);
    display: flex;
    flex-direction: column;
  }
  .sidebar-header {
    padding: 20px 18px 14px;
    border-bottom: 1px solid var(--border);
  }
  .sidebar-header h1 { margin: 0; font-size: 19px; letter-spacing: 0.2px; }
  .sidebar-header .subtitle { color: var(--muted); font-size: 12px; margin-top: 3px; }
  .tree-wrap { flex: 1; overflow-y: auto; padding: 10px 12px 20px; }

  .tree, .tree ul { list-style: none; margin: 0; padding: 0; }
  .tree ul { margin-left: 15px; border-left: 1px solid var(--border); padding-left: 6px; }
  .tree li { position: relative; }
  .node {
    display: flex;
    align-items: center;
    gap: 7px;
    padding: 6px 8px;
    border-radius: 7px;
    cursor: pointer;
    color: var(--text);
    font-size: 13.5px;
    user-select: none;
  }
  .node:hover { background: var(--hover); }
  .node.selected { background: var(--selected); color: #fff; }
  .chevron { width: 14px; color: var(--muted); font-size: 11px; flex: none; transition: transform 0.12s ease; }
  .chevron.open { transform: rotate(90deg); }
  .chevron.leaf { visibility: hidden; }
  .icon { width: 16px; text-align: center; flex: none; opacity: 0.85; }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .hidden { display: none; }

  .main { flex: 1; height: 100vh; overflow-y: auto; padding: 28px 32px; }
  .main-inner { max-width: 720px; }
  label { display: block; margin: 18px 0 7px; font-weight: 600; font-size: 13px; color: var(--muted); }
  select, input[type=text] {
    width: 100%; padding: 11px 12px; background: var(--panel-2); color: var(--text);
    border: 1px solid var(--border); border-radius: 8px; font-size: 14px; outline: none;
  }
  select:focus, input:focus { border-color: var(--accent); }
  button {
    margin-top: 18px; padding: 11px 16px; background: var(--accent); color: #07101c;
    border: 0; border-radius: 8px; font-size: 14px; font-weight: 700; cursor: pointer;
  }
  button:hover { filter: brightness(1.08); }
  button.secondary { background: var(--panel-2); color: var(--text); border: 1px solid var(--border); font-weight: 500; }
  .actions { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 12px; }
  .actions button { margin-top: 0; }
  #status { margin-top: 18px; min-height: 22px; color: var(--muted); font-size: 13px; }
  .ok { color: #6bd98f; }
  .err { color: #ff7d7d; }
  pre {
    white-space: pre-wrap; background: var(--panel); border: 1px solid var(--border);
    border-radius: 9px; padding: 14px; margin-top: 14px; max-height: 320px;
    overflow: auto; font-size: 12px; color: #cbd5df;
  }
  .check { display: flex; align-items: center; gap: 8px; font-weight: 400; color: var(--text); }
  .check input { width: auto; }
  h2 { font-size: 15px; margin-top: 30px; }
</style>
</head>
<body>
  <aside class="sidebar">
    <div class="sidebar-header">
      <h1>devopen</h1>
      <div class="subtitle">Projects</div>
    </div>
    <div class="tree-wrap" id="projectTree"></div>
  </aside>

  <main class="main">
    <div class="main-inner">
      <label for="tool">CLI / IDE / Agent</label>
      <select id="tool"></select>

      <button id="launch">Launch</button>
      <div class="actions">
        <button id="compliance" class="secondary">Compliance Check</button>
        <button id="check" class="secondary">Code Check</button>
        <button id="clean" class="secondary">Clean Up</button>
      </div>

      <div id="status"></div>
      <pre id="result"></pre>

      <h2>New Project</h2>
      <label for="newName">Name</label>
      <input id="newName" type="text" placeholder="my-new-project">
      <label class="check"><input id="newCompliance" type="checkbox" checked> Apply CSL/DSL/PIPL compliance</label>
      <button id="create" class="secondary">Create Project</button>
    </div>
  </main>

  <script>
    const status = document.getElementById('status');
    const result = document.getElementById('result');
    const tree = document.getElementById('projectTree');
    let selectedProject = null;

    function setStatus(msg, cls) { status.textContent = msg; status.className = cls || ''; }

    function post(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(r => r.json());
    }

    function treeRow(child) {
      const li = document.createElement('li');
      const node = document.createElement('div');
      node.className = 'node';

      const chevron = document.createElement('span');
      chevron.className = 'chevron' + (child.hasChildren ? '' : ' leaf');
      chevron.textContent = child.hasChildren ? '▸' : '';

      const icon = document.createElement('span');
      icon.className = 'icon';
      icon.textContent = child.isProject ? '📄' : '📁';

      const name = document.createElement('span');
      name.className = 'name';
      name.textContent = child.name;
      name.title = child.path;

      node.appendChild(chevron);
      node.appendChild(icon);
      node.appendChild(name);

      node.addEventListener('click', () => {
        if (child.isProject) {
          selectedProject = child;
          document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
          node.classList.add('selected');
          setStatus('Selected project: ' + child.path, 'ok');
        }

        if (child.hasChildren) {
          let sub = li.querySelector(':scope > ul');
          if (sub) {
            const willHide = !sub.classList.contains('hidden');
            sub.classList.toggle('hidden', willHide);
            chevron.classList.toggle('open', !willHide);
          } else {
            chevron.classList.add('open');
            sub = document.createElement('ul');
            li.appendChild(sub);
            loadChildren(child.path, sub);
          }
        }
      });

      li.appendChild(node);
      return li;
    }

    async function loadChildren(dir, container) {
      const url = '/api/tree' + (dir ? '?path=' + encodeURIComponent(dir) : '');
      try {
        const data = await fetch(url).then(r => r.json());
        for (const child of data.children) {
          container.appendChild(treeRow(child));
        }
      } catch (err) {
        setStatus('Failed to load tree: ' + err.message, 'err');
      }
    }

    fetch('/api/tools').then(r => r.json()).then(data => {
      const sel = document.getElementById('tool');
      for (const tool of data.tools) {
        const opt = document.createElement('option');
        opt.value = tool.id;
        opt.textContent = '[' + tool.kind.toUpperCase() + '] ' + tool.label;
        sel.appendChild(opt);
      }
    }).catch(() => setStatus('Failed to load tools', 'err'));

    document.getElementById('launch').addEventListener('click', async () => {
      if (!selectedProject) { setStatus('Select a project first', 'err'); return; }
      setStatus('Launching...');
      const data = await post('/api/launch', { path: selectedProject.path, tool: document.getElementById('tool').value });
      if (data.error) setStatus(data.error, 'err');
      else setStatus(data.message || 'Launched', 'ok');
    });

    document.getElementById('compliance').addEventListener('click', async () => {
      if (!selectedProject) { setStatus('Select a project first', 'err'); return; }
      setStatus('Checking compliance...');
      const data = await post('/api/compliance', { path: selectedProject.path });
      result.textContent = data.report || data.error || 'No result';
      setStatus(data.error ? 'Compliance check failed' : 'Compliance check complete', data.error ? 'err' : 'ok');
    });

    document.getElementById('check').addEventListener('click', async () => {
      if (!selectedProject) { setStatus('Select a project first', 'err'); return; }
      setStatus('Running code check...');
      const data = await post('/api/check', { path: selectedProject.path });
      result.textContent = '$ ' + (data.command || '') + '\\n\\n' + (data.output || data.error || '');
      setStatus(data.error ? 'Code check failed' : 'Code check complete', data.error ? 'err' : 'ok');
    });

    document.getElementById('clean').addEventListener('click', async () => {
      if (!selectedProject) { setStatus('Select a project first', 'err'); return; }
      const preview = await post('/api/clean', { path: selectedProject.path, confirm: false });
      if (preview.error) { setStatus(preview.error, 'err'); return; }
      const targets = preview.targets || [];
      if (!targets.length) { result.textContent = 'Nothing to clean.'; setStatus('Clean complete'); return; }
      result.textContent = 'Would remove:\\n' + targets.map(t => '[' + t.type + '] ' + t.path).join('\\n');
      if (!confirm('Remove ' + targets.length + ' item(s)?')) { setStatus('Clean cancelled'); return; }
      const done = await post('/api/clean', { path: selectedProject.path, confirm: true });
      result.textContent = done.message || done.error || 'Done';
      setStatus(done.error ? 'Clean failed' : 'Clean complete', done.error ? 'err' : 'ok');
    });

    document.getElementById('create').addEventListener('click', async () => {
      const name = document.getElementById('newName').value.trim();
      const compliance = document.getElementById('newCompliance').checked;
      if (!name) { setStatus('Enter a project name', 'err'); return; }
      const data = await post('/api/new', { name, compliance });
      setStatus(data.message || data.error || 'Created', data.error ? 'err' : 'ok');
      if (data.ok) setTimeout(() => location.reload(), 800);
    });

    loadChildren('', tree);
  </script>
</body>
</html>`;

function json(res, code, data) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

function projectFromPath(projectPath) {
  if (!projectPath || !fs.existsSync(projectPath)) return null;
  return { name: path.basename(projectPath), path: projectPath };
}

function startServer(port = 8787) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/tree') {
      const cfg = getConfig();
      const dir = url.searchParams.get('path') || cfg.developmentRoot || process.cwd();
      const children = listChildDirs(dir);
      json(res, 200, { path: dir, children });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/tools') {
      const tools = detectTools().map((tool) => ({
        id: tool.id,
        label: tool.label,
        kind: tool.kind,
      }));
      json(res, 200, { tools });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/launch') {
      const body = await readBody(req);
      const project = projectFromPath(body.path);
      const tool = detectTools().find((t) => t.id === body.tool);

      if (!project || !tool) {
        launchLog(`launch rejected: path=${body.path} tool=${body.tool}`);
        json(res, 400, { error: 'Unknown project or tool' });
        return;
      }

      const cfg = getConfig();
      const profile =
        cfg.defaultProfile && cfg.profiles && cfg.profiles[cfg.defaultProfile]
          ? cfg.profiles[cfg.defaultProfile]
          : null;

      try {
        launchLog(`launch start: project=${project.name} tool=${tool.id} exe=${tool.exe}`);
        launchToolWeb(tool, project.path, profile);
        launchLog(`launch ok: project=${project.name} tool=${tool.id}`);
        recordTelemetry(project.name, tool.id);
        json(res, 200, { ok: true, message: `Launched ${tool.label} in ${project.path}` });
      } catch (error) {
        launchLog(`launch error: project=${project.name} tool=${tool.id} ${error.message}`);
        json(res, 500, { error: error.message });
      }
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/compliance') {
      const body = await readBody(req);
      const project = projectFromPath(body.path);
      if (!project) {
        json(res, 400, { error: 'Unknown project' });
        return;
      }
      const report = formatComplianceReport(project.name, project.path, scanCompliance(project.path));
      json(res, 200, { report });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/check') {
      const body = await readBody(req);
      const project = projectFromPath(body.path);
      if (!project) {
        json(res, 400, { error: 'Unknown project' });
        return;
      }
      const result = await runCodeCheck(project.path);
      json(res, 200, result);
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/clean') {
      const body = await readBody(req);
      const project = projectFromPath(body.path);
      if (!project) {
        json(res, 400, { error: 'Unknown project' });
        return;
      }

      if (!body.confirm) {
        json(res, 200, { targets: previewCleanup(project.path) });
        return;
      }

      const removed = performCleanup(project.path);
      json(res, 200, {
        ok: true,
        message: `Removed ${removed.length} item(s):\n` + removed.join('\n'),
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/new') {
      const body = await readBody(req);
      try {
        const target = createProject(body.name, { compliance: Boolean(body.compliance) });
        json(res, 200, {
          ok: true,
          message: `Created ${target}${body.compliance ? ' (CSL/DSL/PIPL framework enabled)' : ''}`,
        });
      } catch (error) {
        json(res, 400, { error: error.message });
      }
      return;
    }

    json(res, 404, { error: 'Not found' });
  });

  server.listen(port, '127.0.0.1', () => {
    console.log(`devopen web UI: http://localhost:${port}`);
  });

  return server;
}

module.exports = { startServer };
