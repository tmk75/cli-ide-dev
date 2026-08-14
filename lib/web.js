const http = require('http');
const fs = require('fs');
const path = require('path');
const {
  getConfig,
  getState,
  saveState,
  recordTelemetry,
  getProviders,
} = require('./config');
const {
  listChildDirs,
  getGitInfo,
  listAllProjects,
  classifyProjectPath,
} = require('./projects');
const { detectTools } = require('./detect');
const { launchToolWeb, openGitHub } = require('./launch');
const { createProject } = require('./newproject');
const { runCodeCheck } = require('./codecheck');
const { previewCleanup, performCleanup } = require('./cleanup');
const { scanCompliance, formatComplianceReport } = require('./compliance');
const { scanProject } = require('./security');
const { resolveProviderId } = require('./providers');

let lastHeartbeat = Date.now();

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
<meta name="color-scheme" content="dark light">
<title>IntelliDev</title>
<link rel="icon" type="image/svg+xml" href="/assets/devopen-mark.svg">
<style>
  :root {
    color-scheme: dark;
    --bg: #080b11;
    --bg-2: #0d1118;
    --sidebar: rgba(10, 13, 20, 0.86);
    --panel: rgba(18, 24, 34, 0.78);
    --panel-solid: #121822;
    --panel-soft: #161e2a;
    --border: rgba(255, 255, 255, 0.075);
    --border-strong: rgba(255, 255, 255, 0.13);
    --text: #f2f6fb;
    --text-soft: #cbd5e1;
    --muted: #8493a8;
    --accent: #3ddc84;
    --accent-strong: #69f6a5;
    --accent-deep: #0f9b5c;
    --accent-wash: rgba(61, 220, 132, 0.11);
    --danger: #ff6b6b;
    --warning: #f4b860;
    --info: #63a8ff;
    --violet: #bd93f9;
    --cyan: #5de4d1;
    --shadow: 0 24px 80px rgba(0, 0, 0, 0.38);
    --radius-sm: 10px;
    --radius-md: 16px;
    --radius-lg: 24px;
    --mono: "Cascadia Code", "JetBrains Mono", Consolas, monospace;
  }

  :root[data-theme="light"] {
    color-scheme: light;
    --bg: #f4f7fb;
    --bg-2: #ffffff;
    --sidebar: rgba(255, 255, 255, 0.86);
    --panel: rgba(255, 255, 255, 0.76);
    --panel-solid: #ffffff;
    --panel-soft: #f4f7fb;
    --border: rgba(15, 23, 42, 0.09);
    --border-strong: rgba(15, 23, 42, 0.15);
    --text: #141c28;
    --text-soft: #334155;
    --muted: #64748b;
    --accent: #0f9b5c;
    --accent-strong: #087347;
    --accent-deep: #0b6b42;
    --accent-wash: rgba(15, 155, 92, 0.09);
    --danger: #dc2626;
    --warning: #c77800;
    --info: #2f6fd0;
    --violet: #7c3aed;
    --cyan: #0f766e;
    --shadow: 0 24px 70px rgba(15, 23, 42, 0.14);
  }

  * { box-sizing: border-box; }
  [hidden] { display: none !important; }
  html, body { height: 100%; margin: 0; }
  body {
    font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    background:
      radial-gradient(circle at 78% -10%, rgba(61, 220, 132, 0.13), transparent 34%),
      radial-gradient(circle at -5% 108%, rgba(99, 168, 255, 0.10), transparent 28%),
      var(--bg);
    color: var(--text);
    overflow: hidden;
  }

  button, input { font: inherit; }
  button { cursor: pointer; }

  .app {
    --sidebar-width: 330px;
    --sidebar-height: 42vh;
    display: grid;
    grid-template-columns: var(--sidebar-width) minmax(0, 1fr);
    height: 100vh;
    width: 100vw;
    overflow: hidden;
  }

  .sidebar {
    position: relative;
    display: flex;
    flex-direction: column;
    min-height: 0;
    background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.035), transparent 18%),
      var(--sidebar);
    border-right: 1px solid var(--border);
    box-shadow: 18px 0 55px rgba(0, 0, 0, 0.13);
    backdrop-filter: blur(22px);
    z-index: 2;
  }

  .sidebar-resizer {
    position: absolute;
    top: 0;
    right: -3px;
    width: 8px;
    height: 100%;
    z-index: 5;
    cursor: col-resize;
    touch-action: none;
  }
  .sidebar-resizer::after {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 3px;
    width: 2px;
    border-radius: 999px;
    background: transparent;
    transition: background 0.15s ease;
  }
  .sidebar-resizer:hover::after,
  .sidebar-resizer:focus-visible::after,
  body.is-resizing-sidebar .sidebar-resizer::after {
    background: color-mix(in srgb, var(--accent) 72%, transparent);
  }
  .sidebar-resizer:focus-visible { outline: none; }
  body.is-resizing-sidebar { cursor: col-resize; user-select: none; }
  body.is-resizing-sidebar-y { cursor: row-resize; }

  .brand {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 22px 18px 18px;
  }
  .brand-mark {
    width: 42px;
    height: 42px;
    border-radius: 13px;
    box-shadow: 0 0 0 1px rgba(61, 220, 132, 0.25), 0 12px 32px rgba(61, 220, 132, 0.16);
    flex: none;
  }
  .brand-text { display: flex; flex-direction: column; line-height: 1.1; }
  .brand-name {
    font-size: 19px;
    font-weight: 780;
    letter-spacing: -0.03em;
  }
  .brand-tag {
    margin-top: 4px;
    color: var(--muted);
    font-size: 10px;
    font-weight: 650;
    letter-spacing: 0.14em;
    text-transform: uppercase;
  }

  .sidebar-search { padding: 0 14px 12px; }
  .search-box {
    position: relative;
    display: flex;
    align-items: center;
    color: var(--muted);
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 13px;
    transition: border-color 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
  }
  .search-box:focus-within {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    box-shadow: 0 0 0 4px var(--accent-wash);
    background: var(--panel-solid);
  }
  .search-box svg { width: 16px; height: 16px; margin-left: 12px; flex: none; }
  .search-box input {
    width: 100%;
    padding: 11px 11px 11px 9px;
    color: var(--text);
    background: transparent;
    border: 0;
    outline: none;
    font-size: 13px;
  }
  .search-box input::placeholder { color: var(--muted); }
  .search-box kbd {
    margin-right: 10px;
    padding: 2px 6px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    flex: none;
  }

  .sidebar-section {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px 8px;
    color: var(--muted);
    font-size: 10px;
    font-weight: 720;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .sidebar-section span:last-child { color: var(--muted); font-family: var(--mono); font-weight: 500; }

  .favorites {
    display: flex;
    gap: 7px;
    padding: 0 14px 8px;
    overflow-x: auto;
    scrollbar-width: none;
  }
  .favorites::-webkit-scrollbar { display: none; }
  .favorite-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    max-width: 180px;
    padding: 7px 10px;
    border: 1px solid var(--border);
    border-radius: 999px;
    color: var(--text-soft);
    background: var(--panel-soft);
    font-size: 11px;
    font-weight: 650;
    white-space: nowrap;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .favorite-chip:hover { background: var(--panel-solid); border-color: var(--border-strong); }
  .favorite-chip svg { width: 12px; height: 12px; color: var(--warning); flex: none; }
  .favorite-chip span { overflow: hidden; text-overflow: ellipsis; }

  .tree-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 12px 22px;
    scrollbar-width: thin;
    scrollbar-color: rgba(130, 145, 160, 0.35) transparent;
  }
  .tree-wrap::-webkit-scrollbar { width: 8px; }
  .tree-wrap::-webkit-scrollbar-thumb { background: rgba(130, 145, 160, 0.32); border-radius: 999px; }

  .tree, .tree ul { list-style: none; margin: 0; padding: 0; }
  .tree ul {
    position: relative;
    margin-left: 13px;
    padding-left: 8px;
    border-left: 1px solid var(--border);
  }

  .node {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    min-height: 38px;
    margin: 2px 0;
    padding: 6px 9px;
    border-radius: 11px;
    border: 1px solid transparent;
    color: var(--text-soft);
    font-size: 13px;
    cursor: pointer;
    user-select: none;
    transition: background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }
  .node:hover {
    background: color-mix(in srgb, var(--panel-soft) 78%, transparent);
    border-color: var(--border);
    color: var(--text);
  }
  .node.selected {
    background: linear-gradient(90deg, var(--accent-wash), transparent);
    border-color: color-mix(in srgb, var(--accent) 24%, transparent);
    color: var(--text);
  }
  .node.selected .name { color: var(--text); }
  .node.filtered { display: none; }

  .chevron {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    color: var(--muted);
    flex: none;
    transition: transform 0.16s ease;
  }
  .chevron svg { width: 13px; height: 13px; }
  .chevron.open { transform: rotate(90deg); }
  .chevron.leaf { visibility: hidden; }

  .node-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 22px;
    height: 22px;
    border-radius: 7px;
    background: var(--panel-soft);
    color: var(--muted);
    flex: none;
  }
  .node-icon svg { width: 14px; height: 14px; }
  .node.is-project .node-icon {
    background: var(--accent-wash);
    color: var(--accent-strong);
  }

  .node-main {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-width: 0;
    flex: 1;
    gap: 8px;
  }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .badges { display: inline-flex; align-items: center; gap: 5px; flex: none; margin-left: auto; }
  .badge {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    height: 18px;
    padding: 0 6px;
    border-radius: 6px;
    font-size: 9px;
    font-weight: 720;
    letter-spacing: 0.02em;
    color: var(--muted);
    background: var(--panel-soft);
  }
  .badge.ok { color: var(--accent-strong); background: var(--accent-wash); }
  .badge.warn { color: var(--warning); background: rgba(244, 184, 96, 0.10); }
  .badge.git { color: var(--info); background: rgba(99, 168, 255, 0.10); }
  .badge.git.dirty { color: var(--warning); }

  .main {
    position: relative;
    min-width: 0;
    height: 100vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .topbar {
    position: sticky;
    top: 0;
    z-index: 4;
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: 70px;
    padding: 0 28px;
    background: color-mix(in srgb, var(--bg) 72%, transparent);
    backdrop-filter: blur(22px);
    border-bottom: 1px solid var(--border);
  }
  .topbar-left {
    display: flex;
    align-items: center;
    gap: 12px;
    min-width: 0;
  }
  .breadcrumb {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    font-size: 12px;
    font-weight: 650;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .topbar-right { display: flex; align-items: center; gap: 9px; flex: none; }

  .command-trigger {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    min-width: 260px;
    padding: 9px 11px;
    border: 1px solid var(--border);
    border-radius: 12px;
    color: var(--muted);
    background: var(--panel-soft);
    font-size: 12px;
    text-align: left;
    transition: border-color 0.15s ease, background 0.15s ease;
  }
  .command-trigger:hover { border-color: var(--border-strong); background: var(--panel-solid); }
  .command-trigger svg { width: 15px; height: 15px; flex: none; }
  .command-trigger kbd {
    margin-left: auto;
    padding: 2px 6px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 10px;
    border: 1px solid var(--border);
    border-radius: 6px;
    background: transparent;
  }

  .icon-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border: 1px solid var(--border);
    border-radius: 11px;
    color: var(--muted);
    background: var(--panel-soft);
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }
  .icon-button:hover { color: var(--text); border-color: var(--border-strong); background: var(--panel-solid); }
  .icon-button svg { width: 16px; height: 16px; }

  .avatar {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 34px;
    height: 34px;
    border-radius: 11px;
    color: #05200f;
    background: linear-gradient(135deg, var(--accent-strong), var(--accent-deep));
    font-size: 11px;
    font-weight: 800;
  }

  .content {
    flex: 1;
    min-height: 0;
    display: flex;
    padding: 14px 16px 16px;
  }

  .hero {
    display: flex;
    align-items: flex-end;
    justify-content: space-between;
    gap: 28px;
    margin-bottom: 26px;
  }
  .eyebrow {
    margin: 0 0 9px;
    color: var(--accent-strong);
    font-size: 11px;
    font-weight: 760;
    letter-spacing: 0.16em;
    text-transform: uppercase;
  }
  .hero h1 {
    margin: 0;
    font-size: clamp(30px, 4.6vw, 46px);
    font-weight: 760;
    letter-spacing: -0.04em;
    line-height: 1.03;
  }
  .hero p {
    max-width: 520px;
    margin: 12px 0 0;
    color: var(--muted);
    font-size: 13px;
    line-height: 1.65;
  }
  .hero-mark {
    width: 76px;
    height: 76px;
    border-radius: 21px;
    box-shadow: 0 0 0 1px color-mix(in srgb, var(--accent) 24%, transparent), 0 24px 60px var(--accent-wash);
    flex: none;
  }

  .stats {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 12px;
    margin-bottom: 18px;
  }
  .stat {
    padding: 15px 16px;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--panel);
    backdrop-filter: blur(18px);
  }
  .stat-label {
    color: var(--muted);
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.1em;
    text-transform: uppercase;
  }
  .stat-value {
    margin-top: 7px;
    font-size: 22px;
    font-weight: 760;
    letter-spacing: -0.03em;
  }

  .dashboard {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(330px, 1.05fr) minmax(260px, 0.75fr) minmax(330px, 1fr);
    gap: 14px;
  }
  .new-panel { flex: 0 0 auto; }
  .dashboard-col {
    min-height: 0;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .panel {
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--panel);
    box-shadow: var(--shadow);
    backdrop-filter: blur(22px);
    overflow: hidden;
    min-height: 0;
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
  }
  .panel-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 19px 20px 0;
    color: var(--muted);
    font-size: 11px;
    font-weight: 740;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }
  .panel-body {
    flex: 1;
    min-height: 0;
    padding: 15px 16px 16px;
    overflow: auto;
    scrollbar-width: thin;
    scrollbar-color: rgba(130, 145, 160, 0.32) transparent;
  }
  .panel-body::-webkit-scrollbar { width: 7px; }
  .panel-body::-webkit-scrollbar-thumb { background: rgba(130, 145, 160, 0.3); border-radius: 999px; }

  .selection-card {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    min-height: 92px;
    padding: 12px 12px 44px;
    margin-bottom: 12px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--panel-soft);
  }
  .selection-card.is-empty {
    align-items: center;
    justify-content: center;
    min-height: 60px;
    padding: 10px 11px;
    border-style: dashed;
    color: var(--muted);
    text-align: center;
    font-size: 12px;
  }
  .selection-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 11px;
    background: var(--accent-wash);
    color: var(--accent-strong);
    flex: none;
  }
  .selection-icon svg { width: 18px; height: 18px; }
  .selection-info { min-width: 0; flex: 1; }
  .selection-title {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 14px;
    font-weight: 760;
    letter-spacing: -0.02em;
  }
  .selection-sub {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    margin-top: 5px;
  }
  .selection-path {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
    flex: 1;
    font-family: var(--mono);
    font-size: 10px;
    color: var(--muted);
  }
  .selection-tool {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 46%;
    flex: none;
    color: var(--text-soft);
    font-size: 11px;
    font-weight: 650;
  }
  .selection-actions {
    position: absolute;
    right: 10px;
    bottom: 10px;
    display: flex;
    align-items: center;
    gap: 7px;
  }
  .selection-meta { margin-top: 8px; padding-right: 108px; }

  .tool-groups { display: flex; flex-direction: column; gap: 10px; }
  .tool-group-label {
    margin-bottom: 8px;
    color: var(--muted);
    font-size: 10px;
    font-weight: 720;
    letter-spacing: 0.11em;
    text-transform: uppercase;
  }
  .tool-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 7px;
  }
  .tool-card {
    display: flex;
    align-items: center;
    gap: 7px;
    min-height: 38px;
    padding: 7px 9px;
    width: auto;
    text-align: left;
    color: var(--text-soft);
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 10px;
    transition: border-color 0.15s ease, background 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease;
  }
  .tool-card:hover { border-color: var(--border-strong); background: var(--panel-solid); transform: translateY(-1px); }
  .tool-card.selected {
    color: var(--text);
    background: var(--accent-wash);
    border-color: color-mix(in srgb, var(--accent) 38%, transparent);
    box-shadow: 0 0 0 3px var(--accent-wash);
  }
  .tool-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    background: var(--panel-solid);
    color: var(--muted);
    flex: none;
  }
  .tool-card.selected .tool-icon { color: var(--accent-strong); }
  .tool-icon svg { width: 14px; height: 14px; }
  .tool-info { min-width: 0; }
  .tool-name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 11px;
    font-weight: 720;
  }
  .tool-meta {
    margin-top: 3px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    color: var(--muted);
    display: none;
    font-size: 10px;
  }

  .launch-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 9px;
    width: 100%;
    margin-top: 12px;
    padding: 11px 16px;
    border: 0;
    border-radius: 15px;
    color: #03140b;
    background: linear-gradient(135deg, var(--accent-strong), var(--accent-deep));
    box-shadow: 0 14px 34px var(--accent-wash);
    font-size: 13px;
    font-weight: 820;
    transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease;
  }
  .launch-button:hover { transform: translateY(-1px); box-shadow: 0 18px 42px var(--accent-wash); filter: brightness(1.03); }
  .launch-button:active { transform: translateY(0); }
  .launch-button:disabled { opacity: 0.46; cursor: not-allowed; transform: none; box-shadow: none; }
  .launch-button kbd {
    padding: 2px 6px;
    margin-left: 5px;
    border-radius: 6px;
    background: rgba(0, 0, 0, 0.16);
    font-family: var(--mono);
    font-size: 10px;
  }

  .notice {
    margin-top: 12px;
    padding: 11px 13px;
    border-radius: 13px;
    color: var(--cyan);
    background: rgba(93, 228, 209, 0.08);
    border: 1px solid rgba(93, 228, 209, 0.16);
    font-size: 12px;
    line-height: 1.5;
  }

  .action-grid {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }
  .action {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 11px;
    min-height: 102px;
    padding: 14px;
    text-align: left;
    color: var(--text-soft);
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 16px;
    transition: background 0.16s ease, border-color 0.16s ease, transform 0.16s ease;
  }
  .action:hover { background: var(--panel-solid); border-color: var(--border-strong); transform: translateY(-1px); }
  .action-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    color: var(--muted);
    background: var(--panel-solid);
  }
  .action-icon svg { width: 16px; height: 16px; }
  .action-title { font-size: 12px; font-weight: 760; color: var(--text); }
  .action-desc { font-size: 11px; line-height: 1.45; color: var(--muted); }
  .action.warn .action-icon { color: var(--warning); background: rgba(244, 184, 96, 0.10); }
  .action.danger .action-icon { color: var(--danger); background: rgba(255, 107, 107, 0.10); }

  .status {
    min-height: 22px;
    margin-top: 14px;
    color: var(--muted);
    font-size: 12px;
    transition: color 0.15s ease;
  }
  .status.ok { color: var(--accent-strong); }
  .status.err { color: var(--danger); }

  pre {
    display: none;
    max-height: 360px;
    margin: 14px 0 0;
    padding: 16px;
    overflow: auto;
    white-space: pre-wrap;
    color: var(--text-soft);
    background: var(--panel-solid);
    border: 1px solid var(--border);
    border-radius: 14px;
    font-family: var(--mono);
    font-size: 11px;
    line-height: 1.55;
  }
  pre.visible { display: block; }

  .recent-list { display: flex; flex-direction: column; gap: 8px; }
  .recent-item {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 10px 11px;
    border: 1px solid var(--border);
    border-radius: 13px;
    background: var(--panel-soft);
    color: var(--text-soft);
    text-align: left;
  }
  .recent-item:hover { border-color: var(--border-strong); }
  .recent-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: var(--accent);
    box-shadow: 0 0 0 4px var(--accent-wash);
    flex: none;
  }
  .recent-info { min-width: 0; flex: 1; }
  .recent-name { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 720; }
  .recent-tool { display: block; margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 10px; }

  .new-grid {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
    align-items: center;
  }
  input[type="text"] {
    width: 100%;
    padding: 12px 14px;
    color: var(--text);
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 13px;
    font-size: 13px;
    outline: none;
    transition: border-color 0.16s ease, box-shadow 0.16s ease;
  }
  input[type="text"]:focus {
    border-color: color-mix(in srgb, var(--accent) 55%, transparent);
    box-shadow: 0 0 0 4px var(--accent-wash);
  }
  .secondary {
    padding: 12px 16px;
    color: var(--text);
    background: var(--panel-soft);
    border: 1px solid var(--border);
    border-radius: 13px;
    font-size: 12px;
    font-weight: 720;
    transition: background 0.15s ease, border-color 0.15s ease;
  }
  .secondary:hover { background: var(--panel-solid); border-color: var(--border-strong); }
  .check-row {
    display: flex;
    align-items: center;
    gap: 9px;
    margin-top: 12px;
    color: var(--text-soft);
    font-size: 12px;
  }
  .check-row input { width: 15px; height: 15px; accent-color: var(--accent); }

  .toast {
    position: fixed;
    right: 24px;
    bottom: 24px;
    z-index: 30;
    max-width: 430px;
    padding: 13px 16px;
    border-radius: 14px;
    color: var(--text);
    background: var(--panel-solid);
    border: 1px solid var(--border-strong);
    box-shadow: var(--shadow);
    font-size: 12px;
    line-height: 1.5;
    transform: translateY(20px);
    opacity: 0;
    transition: transform 0.2s ease, opacity 0.2s ease;
  }
  .toast.show { transform: translateY(0); opacity: 1; }
  .toast.ok { border-color: color-mix(in srgb, var(--accent) 40%, transparent); }
  .toast.err { border-color: rgba(255, 107, 107, 0.44); }

  .palette-backdrop {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: none;
    align-items: flex-start;
    justify-content: center;
    padding: 10vh 22px 22px;
    background: rgba(2, 5, 9, 0.58);
    backdrop-filter: blur(12px);
  }
  .palette-backdrop.open { display: flex; }
  .palette {
    width: min(640px, 100%);
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: 20px;
    background: var(--panel-solid);
    box-shadow: 0 30px 90px rgba(0, 0, 0, 0.5);
  }
  .palette-input {
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 16px 17px;
    border-bottom: 1px solid var(--border);
  }
  .palette-input svg { width: 19px; height: 19px; color: var(--muted); flex: none; }
  .palette-input input {
    width: 100%;
    color: var(--text);
    background: transparent;
    border: 0;
    outline: none;
    font-size: 15px;
  }
  .palette-input kbd {
    padding: 3px 7px;
    color: var(--muted);
    font-family: var(--mono);
    font-size: 10px;
    border: 1px solid var(--border);
    border-radius: 7px;
    flex: none;
  }
  .palette-results { max-height: 440px; overflow-y: auto; padding: 10px; }
  .palette-label {
    padding: 9px 9px 5px;
    color: var(--muted);
    font-size: 10px;
    font-weight: 740;
    letter-spacing: 0.12em;
    text-transform: uppercase;
  }
  .palette-item {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 100%;
    padding: 11px 12px;
    border: 1px solid transparent;
    border-radius: 12px;
    color: var(--text-soft);
    background: transparent;
    text-align: left;
  }
  .palette-item:hover, .palette-item.active {
    color: var(--text);
    background: var(--accent-wash);
    border-color: color-mix(in srgb, var(--accent) 24%, transparent);
  }
  .palette-item-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 30px;
    height: 30px;
    border-radius: 9px;
    background: var(--panel-soft);
    color: var(--muted);
    flex: none;
  }
  .palette-item-icon svg { width: 15px; height: 15px; }
  .palette-item-main { min-width: 0; flex: 1; }
  .palette-item-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 720; }
  .palette-item-sub { margin-top: 3px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; color: var(--muted); font-size: 10px; }

  .loading {
    display: flex;
    align-items: center;
    gap: 9px;
    padding: 14px 12px;
    color: var(--muted);
    font-size: 12px;
  }
  .spinner {
    width: 14px;
    height: 14px;
    border: 2px solid var(--border);
    border-top-color: var(--accent);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }
  @keyframes spin { to { transform: rotate(360deg); } }

  .empty-tree {
    padding: 26px 18px;
    color: var(--muted);
    text-align: center;
    font-size: 12px;
    line-height: 1.6;
  }

  @media (max-width: 980px) {
    .app { grid-template-columns: 1fr; }
    .sidebar {
      height: var(--sidebar-height);
      border-right: 0;
      border-bottom: 1px solid var(--border);
    }
    .main { height: calc(100vh - var(--sidebar-height)); }
    .sidebar-resizer {
      top: auto;
      right: 0;
      bottom: -3px;
      width: 100%;
      height: 8px;
      cursor: row-resize;
    }
    .sidebar-resizer::after {
      top: 3px;
      right: 0;
      bottom: auto;
      left: 0;
      width: auto;
      height: 2px;
    }
    .dashboard, .stats { grid-template-columns: 1fr; }
    .tool-grid { grid-template-columns: 1fr; }
  }
</style>
</head>
<body>
  <div class="app">
    <aside class="sidebar">
      <div class="brand">
        <img class="brand-mark" src="/assets/devopen-mark.svg" alt="IntelliDev mark">
        <div class="brand-text">
          <span class="brand-name">IntelliDev</span>
          <span class="brand-tag">Launch cockpit</span>
        </div>
      </div>

      <div class="sidebar-search">
        <div class="search-box">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <circle cx="11" cy="11" r="7"></circle>
            <path d="m20 20-3.4-3.4"></path>
          </svg>
          <input id="search" type="text" placeholder="Filter workspace">
          <kbd>/</kbd>
        </div>
      </div>

      <div class="sidebar-section">
        <span>Pinned</span>
        <span id="favoriteCount">0</span>
      </div>
      <div class="favorites" id="favorites"></div>

      <div class="sidebar-section">
        <span>Workspace</span>
        <span id="treeCount">Ready</span>
      </div>
      <div class="tree-wrap">
        <ul class="tree" id="projectTree"></ul>
      </div>
      <div class="sidebar-resizer" id="sidebarResizer" role="separator" aria-orientation="vertical" aria-label="Resize sidebar" tabindex="0"></div>
    </aside>

    <main class="main">
      <div class="topbar">
        <div class="topbar-left">
          <div class="breadcrumb" id="breadcrumb">IntelliDev / Workspace</div>
        </div>
        <div class="topbar-right">
          <button class="command-trigger" id="commandTrigger">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
              <circle cx="11" cy="11" r="7"></circle>
              <path d="m20 20-3.4-3.4"></path>
            </svg>
            <span>Search projects and tools</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button class="icon-button" id="themeToggle" title="Toggle theme">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <circle cx="12" cy="12" r="4"></circle>
              <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"></path>
            </svg>
          </button>
          <div class="avatar">ID</div>
        </div>
      </div>

      <div class="content">
        <div class="dashboard">
          <div class="dashboard-col launch-col">
            <section class="panel launch-panel">
              <div class="panel-head">
                <span>Launch target</span>
                <span id="targetState">No project</span>
              </div>
              <div class="panel-body">
                <div class="selection-card is-empty" id="selectionCard">
                  <span>Select a project from the sidebar or press Ctrl K</span>
                </div>

                <div class="tool-groups" id="toolGroups"></div>

                <button class="launch-button" id="launch" disabled>
                  <span>Launch selected tool</span>
                  <kbd>Enter</kbd>
                </button>

                <div class="notice" id="dockerNotice" hidden>
                  Running inside Docker: desktop tools are unavailable here. Use the native IntelliDev launcher on Windows to open editors, terminals, and agents.
                </div>
              </div>
            </section>
          </div>

          <div class="dashboard-col side-col">
            <section class="panel recent-panel">
              <div class="panel-head">
                <span>Recent launches</span>
                <span id="recentCount">0</span>
              </div>
              <div class="panel-body">
                <div class="recent-list" id="recentList"></div>
              </div>
            </section>
          </div>

          <div class="dashboard-col ops-col">
            <section class="panel ops-panel">
              <div class="panel-head">
                <span>Operations</span>
                <span>project-aware</span>
              </div>
              <div class="panel-body">
                <div class="action-grid">
                  <button class="action" id="compliance">
                    <span class="action-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 3 5 5.8v5.1c0 4.4 2.9 7.6 7 9.1 4.1-1.5 7-4.7 7-9.1V5.8L12 3Z"></path>
                        <path d="m9 12 2.1 2.1L15.5 9.5"></path>
                      </svg>
                    </span>
                    <span class="action-title">Compliance</span>
                    <span class="action-desc">CSL / DSL / PIPL scan</span>
                  </button>
                  <button class="action" id="check">
                    <span class="action-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="m8 8-4 4 4 4"></path>
                        <path d="m16 8 4 4-4 4"></path>
                        <path d="m14 5-4 14"></path>
                      </svg>
                    </span>
                    <span class="action-title">Code check</span>
                    <span class="action-desc">Run the project's check</span>
                  </button>
                  <button class="action warn" id="clean">
                    <span class="action-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M4 7h16"></path>
                        <path d="M9 7V4h6v3"></path>
                        <path d="m7 7 1 13h8l1-13"></path>
                      </svg>
                    </span>
                    <span class="action-title">Clean up</span>
                    <span class="action-desc">Preview and remove artifacts</span>
                  </button>
                  <button class="action danger" id="refresh">
                    <span class="action-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M20 11a8 8 0 1 0-1.4 6.5"></path>
                        <path d="M20 5v6h-6"></path>
                      </svg>
                    </span>
                    <span class="action-title">Refresh</span>
                    <span class="action-desc">Reload workspace data</span>
                  </button>
                </div>
                <div class="status" id="status" role="status"></div>
                <pre id="result"></pre>
              </div>
            </section>

            <section class="panel new-panel">
              <div class="panel-head">
                <span>New project</span>
                <span>scaffold</span>
              </div>
              <div class="panel-body">
                <div class="new-grid">
                  <input id="newName" type="text" placeholder="my-new-project">
                  <button id="create" class="secondary">Create</button>
                </div>
                <label class="check-row">
                  <input id="newCompliance" type="checkbox" checked>
                  Apply CSL / DSL / PIPL compliance framework
                </label>
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  </div>

  <div class="palette-backdrop" id="paletteBackdrop" hidden>
    <div class="palette">
      <div class="palette-input">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <circle cx="11" cy="11" r="7"></circle>
          <path d="m20 20-3.4-3.4"></path>
        </svg>
        <input id="paletteInput" type="text" placeholder="Search projects, tools, and actions...">
        <kbd>Esc</kbd>
      </div>
      <div class="palette-results" id="paletteResults"></div>
    </div>
  </div>

  <div class="toast" id="toast" hidden></div>

  <script>
    const statusEl = document.getElementById('status');
    const resultEl = document.getElementById('result');
    const tree = document.getElementById('projectTree');
    const selectionCard = document.getElementById('selectionCard');
    const toolGroups = document.getElementById('toolGroups');
    const launchBtn = document.getElementById('launch');
    const searchInput = document.getElementById('search');
    const treeCount = document.getElementById('treeCount');
    const favoriteCount = document.getElementById('favoriteCount');
    const recentCount = document.getElementById('recentCount');
    const favoritesEl = document.getElementById('favorites');
    const recentList = document.getElementById('recentList');
    const breadcrumb = document.getElementById('breadcrumb');
    const targetState = document.getElementById('targetState');
    const toast = document.getElementById('toast');
    const dockerNotice = document.getElementById('dockerNotice');
    const commandTrigger = document.getElementById('commandTrigger');
    const paletteBackdrop = document.getElementById('paletteBackdrop');
    const paletteInput = document.getElementById('paletteInput');
    const paletteResults = document.getElementById('paletteResults');
    const themeToggle = document.getElementById('themeToggle');

    let selectedProject = null;
    let selectedToolId = null;
    let allTools = [];
    let favorites = [];
    let recent = [];
    let isDocker = false;
    let toastTimer = null;
    let paletteIndex = 0;

    const ICONS = {
      chevron: '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m6 4 4 4-4 4"></path></svg>',
      folder: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 7.5h6l1.5-2h5.5l3 2H20"></path><path d="M3.5 8h16l-1 10h-14l-1-10Z"></path></svg>',
      project: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="m5 7 5-3 5 3 5 3v5l-5 3-5-3-5-3V7Z"></path><path d="m10 4 9 5"></path><path d="m10 4v5l9 5"></path><path d="m5 7 5 3 5-3"></path></svg>',
      terminal: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2"></rect><path d="m7 9 3 3-3 3M12 15h5"></path></svg>',
      agent: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v2M12 19v2M5.2 5.2l1.4 1.4M17.4 17.4l1.4 1.4M3 12h2M19 12h2M5.2 18.8l1.4-1.4M17.4 6.6l1.4-1.4"></path><circle cx="12" cy="12" r="3"></circle></svg>',
      star: '<svg viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="m12 3 2.7 5.6 6.1.8-4.5 4.3 1.1 6.1-5.4-2.9-5.4 2.9 1.1-6.1L3.2 9.4l6.1-.8L12 3Z"></path></svg>',
      copy: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="12" height="12" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>',
      github: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0C6.5 2.8 5.4 3.1 5.4 3.1a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4 9.5c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21"></path></svg>'
    };

    function setStatus(msg, cls) {
      statusEl.textContent = msg || '';
      statusEl.className = 'status' + (cls ? ' ' + cls : '');
    }

    function showToast(msg, cls) {
      toast.textContent = msg;
      toast.className = 'toast show' + (cls ? ' ' + cls : '');
      toast.hidden = false;
      clearTimeout(toastTimer);
      toastTimer = setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => { toast.hidden = true; }, 220);
      }, 2800);
    }

    function showResult(text) {
      if (!text) {
        resultEl.textContent = '';
        resultEl.classList.remove('visible');
        return;
      }
      resultEl.textContent = text;
      resultEl.classList.add('visible');
    }

    function post(url, body) {
      return fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      }).then(r => r.json());
    }

    function esc(s) {
      return String(s).replace(/[&<>"]/g, c => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;'
      })[c]);
    }

    function renderBadges(meta) {
      meta = meta || {};
      const parts = [];
      if (meta.git && !meta.git.error && meta.git.branch) {
        const dirty = meta.git.dirty > 0;
        parts.push('<span class="badge git' + (dirty ? ' dirty' : '') + '">' + esc(meta.git.branch) + (dirty ? ' \u00b7 ' + meta.git.dirty : '') + '</span>');
      }
      if (meta.secretCount > 0) {
        parts.push('<span class="badge warn">key ' + meta.secretCount + '</span>');
      }
      if (meta.complianceEnabled) {
        parts.push('<span class="badge ok">PIPL</span>');
      }
      if (meta.markerCount) {
        parts.push('<span class="badge">' + meta.markerCount + ' markers</span>');
      }
      return parts.join('');
    }

    function treeRow(child) {
      const li = document.createElement('li');
      const node = document.createElement('div');
      node.className = 'node' + (child.isProject ? ' is-project' : '');
      node.title = child.path;

      const chevron = child.hasChildren ? ICONS.chevron : '';
      const icon = child.isProject ? ICONS.project : ICONS.folder;
      node.innerHTML =
        '<span class="chevron' + (child.hasChildren ? '' : ' leaf') + '">' + chevron + '</span>' +
        '<span class="node-icon">' + icon + '</span>' +
        '<span class="node-main">' +
          '<span class="name"></span>' +
          '<span class="badges">' + renderBadges(child.meta) + '</span>' +
        '</span>';
      node.querySelector('.name').textContent = child.name;

      node.addEventListener('click', () => {
        if (child.isProject) selectProject(child, node);
        if (child.hasChildren) {
          const chevronEl = node.querySelector('.chevron');
          let sub = Array.from(li.children).find((el) => el.tagName === 'UL');
          if (sub) {
            const willHide = !sub.hidden;
            sub.hidden = willHide;
            chevronEl.classList.toggle('open', !willHide);
          } else {
            chevronEl.classList.add('open');
            sub = document.createElement('ul');
            li.appendChild(sub);
            loadChildren(child.path, sub, true);
          }
        }
      });

      li.appendChild(node);
      return li;
    }

    function selectProject(child, node) {
      selectedProject = child;
      document.querySelectorAll('.node.selected').forEach(el => el.classList.remove('selected'));
      if (node) node.classList.add('selected');
      renderSelection();
      updateLaunchButton();
      setStatus('Project selected', 'ok');
    }

    function renderSelection() {
      if (!selectedProject) {
        selectionCard.classList.add('is-empty');
        selectionCard.innerHTML = '<span>Select a project from the sidebar or press Ctrl K</span>';
        targetState.textContent = 'No project';
        breadcrumb.textContent = 'IntelliDev / Workspace';
        return;
      }

      const isFavorite = favorites.some(f => f.name === selectedProject.name);
      selectionCard.classList.remove('is-empty');
      const selectedTool = allTools.find((tool) => tool.id === selectedToolId);
      selectionCard.innerHTML =
        '<span class="selection-icon">' + ICONS.project + '</span>' +
        '<span class="selection-info">' +
          '<span class="selection-title"></span>' +
          '<span class="selection-sub">' +
            '<span class="selection-path"></span>' +
            '<span class="selection-tool"></span>' +
          '</span>' +
          '<span class="selection-meta badges"></span>' +
        '</span>' +
        '<span class="selection-actions">' +
          '<button class="icon-button" id="copyPath" title="Copy path">' + ICONS.copy + '</button>' +
          '<button class="icon-button" id="openGithub" title="Open GitHub">' + ICONS.github + '</button>' +
          '<button class="icon-button" id="toggleFavorite" title="Pin project">' + ICONS.star + '</button>' +
        '</span>';
      selectionCard.querySelector('.selection-title').textContent = selectedProject.name;
      selectionCard.querySelector('.selection-path').textContent = selectedProject.path;
      const toolEl = selectionCard.querySelector('.selection-tool');
      if (selectedTool) toolEl.textContent = selectedTool.label;
      else toolEl.hidden = true;
      selectionCard.querySelector('.selection-meta').innerHTML = renderBadges(selectedProject.meta);
      breadcrumb.textContent = 'IntelliDev / ' + selectedProject.name;
      targetState.textContent = 'Ready';

      document.getElementById('copyPath').addEventListener('click', () => {
        navigator.clipboard.writeText(selectedProject.path).then(() => showToast('Path copied', 'ok'));
      });
      document.getElementById('openGithub').addEventListener('click', openSelectedGithub);
      document.getElementById('toggleFavorite').addEventListener('click', toggleSelectedFavorite);
      const starButton = document.getElementById('toggleFavorite');
      if (isFavorite) starButton.style.color = 'var(--warning)';
    }

    function updateLaunchButton() {
      launchBtn.disabled = !selectedProject || !selectedToolId;
    }

    async function loadChildren(dir, container, showLoading) {
      if (showLoading && !container.querySelector('.loading')) {
        const loading = document.createElement('div');
        loading.className = 'loading';
        loading.innerHTML = '<span class="spinner"></span><span>Loading folders\u2026</span>';
        container.appendChild(loading);
      }

      const url = '/api/tree' + (dir ? '?path=' + encodeURIComponent(dir) : '');
      try {
        const data = await fetch(url).then(r => r.json());
        const oldLoading = container.querySelector('.loading');
        if (oldLoading) oldLoading.remove();

        if (!data.children || !data.children.length) {
          const empty = document.createElement('div');
          empty.className = 'empty-tree';
          empty.textContent = 'No folders found in this location.';
          container.appendChild(empty);
        } else {
          for (const child of data.children) container.appendChild(treeRow(child));
        }

        const count = data.children ? data.children.length : 0;
        treeCount.textContent = count + ' folder' + (count === 1 ? '' : 's');
      } catch (err) {
        const oldLoading = container.querySelector('.loading');
        if (oldLoading) oldLoading.remove();
        setStatus('Failed to load tree: ' + err.message, 'err');
        showToast('Could not load the workspace tree', 'err');
      }
    }

    function filterTree(query) {
      query = query.trim().toLowerCase();
      const nodes = Array.from(document.querySelectorAll('.tree .node'));
      for (const node of nodes) {
        const nameEl = node.querySelector('.name');
        const name = (nameEl ? nameEl.textContent : '').toLowerCase();
        node.classList.toggle('filtered', Boolean(query) && !name.includes(query));
      }
    }

    function renderToolCard(tool) {
      const card = document.createElement('button');
      card.className = 'tool-card';
      card.type = 'button';
      card.dataset.id = tool.id;
      card.innerHTML =
        '<span class="tool-icon">' + (ICONS[tool.kind] || ICONS.terminal) + '</span>' +
        '<span class="tool-info">' +
          '<span class="tool-name"></span>' +
          '<span class="tool-meta"></span>' +
        '</span>';
      card.querySelector('.tool-name').textContent = tool.label;
      card.querySelector('.tool-meta').textContent = tool.providerLabel ? tool.providerLabel : (tool.kind === 'terminal' ? 'Terminal' : 'Native tool');
      card.addEventListener('click', () => {
        selectedToolId = tool.id;
        document.querySelectorAll('.tool-card').forEach(el => el.classList.toggle('selected', el === card));
        updateLaunchButton();
        if (selectedProject) renderSelection();
      });
      return card;
    }

    function renderTools(tools) {
      toolGroups.innerHTML = '';
      const groups = [
        { id: 'agent', label: 'AI agents' },
        { id: 'ide', label: 'Editors / IDEs' },
        { id: 'terminal', label: 'Terminals' }
      ];
      for (const group of groups) {
        const groupTools = tools.filter(t => t.kind === group.id);
        if (!groupTools.length) continue;
        const wrapper = document.createElement('div');
        const label = document.createElement('div');
        label.className = 'tool-group-label';
        label.textContent = group.label;
        const grid = document.createElement('div');
        grid.className = 'tool-grid';
        for (const tool of groupTools) grid.appendChild(renderToolCard(tool));
        wrapper.appendChild(label);
        wrapper.appendChild(grid);
        toolGroups.appendChild(wrapper);
      }
      if (!tools.length) {
        toolGroups.innerHTML = '<div class="empty-tree">No host tools detected' + (isDocker ? ' in Docker' : '') + '.</div>';
      }
      if (tools.length) {
        const first = toolGroups.querySelector('.tool-card');
        if (first) first.click();
      }
    }

    function renderFavorites() {
      favoritesEl.innerHTML = '';
      favoriteCount.textContent = String(favorites.length);
      if (!favorites.length) {
        favoritesEl.innerHTML = '<div class="empty-tree" style="padding: 10px 16px;">Pin projects to see them here.</div>';
        return;
      }
      for (const fav of favorites) {
        const chip = document.createElement('button');
        chip.className = 'favorite-chip';
        chip.innerHTML = ICONS.star + '<span></span>';
        chip.querySelector('span').textContent = fav.name;
        chip.addEventListener('click', () => {
          if (fav.project) selectProject(fav.project, null);
          else showToast('Project not found: ' + fav.name, 'err');
        });
        favoritesEl.appendChild(chip);
      }
    }

    function renderRecent() {
      recentList.innerHTML = '';
      recentCount.textContent = String(recent.length);
      if (!recent.length) {
        recentList.innerHTML = '<div class="empty-tree">No launches recorded yet.</div>';
        return;
      }
      for (const item of recent) {
        const button = document.createElement('button');
        button.className = 'recent-item';
        button.innerHTML = '<span class="recent-dot"></span><span class="recent-info"><span class="recent-name"></span> <span class="recent-tool"></span></span>';
        button.querySelector('.recent-name').textContent = item.project;
        button.querySelector('.recent-tool').textContent = item.tool || 'Launched';
        button.addEventListener('click', () => {
          if (item.projectData) selectProject(item.projectData, null);
          else showToast('Project not found: ' + item.project, 'err');
        });
        recentList.appendChild(button);
      }
    }

    async function refreshDashboard() {
      try {
        const state = await fetch('/api/state').then(r => r.json());
        favorites = state.favorites || [];
        recent = state.recent || [];
        renderFavorites();
        renderRecent();
        renderSelection();
      } catch (err) {
        showToast('Could not load dashboard data', 'err');
      }
    }

    async function toggleSelectedFavorite() {
      if (!selectedProject) return;
      const data = await post('/api/favorite', { path: selectedProject.path });
      if (data.favorites) {
        favorites = data.favorites;
        renderFavorites();
        renderSelection();
        showToast(data.message || 'Pinned', 'ok');
      } else {
        showToast(data.error || 'Could not update favorite', 'err');
      }
    }

    async function openSelectedGithub() {
      if (!selectedProject) return;
      const data = await post('/api/gh', { path: selectedProject.path });
      if (data.error) showToast(data.error, 'err');
      else showToast(data.message || 'Opened GitHub', 'ok');
    }

    async function openPalette() {
      paletteBackdrop.hidden = false;
      paletteBackdrop.classList.add('open');
      paletteInput.value = '';
      paletteIndex = 0;
      await renderPalette('');
      setTimeout(() => paletteInput.focus(), 20);
    }

    function closePalette() {
      paletteBackdrop.hidden = true;
      paletteBackdrop.classList.remove('open');
    }

    async function renderPalette(query) {
      const projects = [];
      const tools = allTools.filter(t => !query || t.label.toLowerCase().includes(query.toLowerCase()));
      if (query) {
        const data = await fetch('/api/search?q=' + encodeURIComponent(query)).then(r => r.json());
        projects.push(...(data.projects || []));
      }
      paletteResults.innerHTML = '';

      if (!query) {
        paletteResults.innerHTML = '<div class="palette-label">Quick actions</div>';
        const actions = [
          { title: 'Refresh workspace', sub: 'Reload project tree and dashboard', icon: ICONS.folder, run: () => { closePalette(); refreshDashboard(); loadChildren('', tree, true); } },
          { title: 'Toggle theme', sub: 'Switch between dark and light appearance', icon: ICONS.agent, run: () => { closePalette(); toggleTheme(); } }
        ];
        for (const action of actions) {
          const item = document.createElement('button');
          item.className = 'palette-item';
          item.innerHTML = '<span class="palette-item-icon">' + action.icon + '</span><span class="palette-item-main"><span class="palette-item-title"></span><span class="palette-item-sub"></span></span>';
          item.querySelector('.palette-item-title').textContent = action.title;
          item.querySelector('.palette-item-sub').textContent = action.sub;
          item.addEventListener('click', action.run);
          paletteResults.appendChild(item);
        }
        paletteResults.innerHTML += '<div class="palette-label">Projects</div>';
        const data = await fetch('/api/search?q=').then(r => r.json());
        projects.push(...(data.projects || []));
      }

      if (projects.length) {
        if (query) paletteResults.innerHTML += '<div class="palette-label">Projects</div>';
        for (const project of projects.slice(0, 12)) {
          const item = document.createElement('button');
          item.className = 'palette-item';
          item.innerHTML = '<span class="palette-item-icon">' + ICONS.project + '</span><span class="palette-item-main"><span class="palette-item-title"></span><span class="palette-item-sub"></span></span>';
          item.querySelector('.palette-item-title').textContent = project.name;
          item.querySelector('.palette-item-sub').textContent = project.path;
          item.addEventListener('click', () => { closePalette(); selectProject(project, null); });
          paletteResults.appendChild(item);
        }
      }

      if (tools.length) {
        paletteResults.innerHTML += '<div class="palette-label">Tools</div>';
        for (const tool of tools.slice(0, 12)) {
          const item = document.createElement('button');
          item.className = 'palette-item';
          item.innerHTML = '<span class="palette-item-icon">' + (ICONS[tool.kind] || ICONS.terminal) + '</span><span class="palette-item-main"><span class="palette-item-title"></span><span class="palette-item-sub"></span></span>';
          item.querySelector('.palette-item-title').textContent = tool.label;
          item.querySelector('.palette-item-sub').textContent = tool.providerLabel || tool.kind;
          item.addEventListener('click', () => {
            const card = document.querySelector('.tool-card[data-id="' + tool.id + '"]');
            if (card) card.click();
            closePalette();
          });
          paletteResults.appendChild(item);
        }
      }

      if (!projects.length && !tools.length) {
        paletteResults.innerHTML += '<div class="empty-tree">No matches found.</div>';
      }
    }

    function toggleTheme() {
      const root = document.documentElement;
      const next = root.getAttribute('data-theme') === 'light' ? 'dark' : 'light';
      root.setAttribute('data-theme', next);
      localStorage.setItem('intellidev-theme', next);
    }

    function initSidebarResize() {
      const app = document.querySelector('.app');
      const sidebar = document.querySelector('.sidebar');
      const resizer = document.getElementById('sidebarResizer');
      const stackedMq = window.matchMedia('(max-width: 980px)');
      const widthKey = 'intellidev-sidebar-width';
      const heightKey = 'intellidev-sidebar-height';
      const defaultWidth = 330;
      const minWidth = 220;
      const maxWidth = 640;
      const minHeight = 160;

      function stacked() {
        return stackedMq.matches;
      }

      function clampWidth(px) {
        const max = Math.min(maxWidth, Math.floor(window.innerWidth * 0.6));
        return Math.max(minWidth, Math.min(max, Math.round(px)));
      }

      function clampHeight(px) {
        const max = Math.floor(window.innerHeight * 0.7);
        return Math.max(minHeight, Math.min(max, Math.round(px)));
      }

      function applyWidth(px) {
        app.style.setProperty('--sidebar-width', clampWidth(px) + 'px');
      }

      function applyHeight(px) {
        app.style.setProperty('--sidebar-height', clampHeight(px) + 'px');
      }

      const savedWidth = Number(localStorage.getItem(widthKey));
      if (Number.isFinite(savedWidth) && savedWidth > 0) applyWidth(savedWidth);
      const savedHeight = Number(localStorage.getItem(heightKey));
      if (Number.isFinite(savedHeight) && savedHeight > 0) applyHeight(savedHeight);

      let dragging = false;
      let startPos = 0;
      let startSize = 0;

      resizer.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return;
        dragging = true;
        const rect = sidebar.getBoundingClientRect();
        if (stacked()) {
          startPos = event.clientY;
          startSize = rect.height;
        } else {
          startPos = event.clientX;
          startSize = rect.width;
        }
        document.body.classList.toggle('is-resizing-sidebar-y', stacked());
        document.body.classList.add('is-resizing-sidebar');
        resizer.setPointerCapture(event.pointerId);
        event.preventDefault();
      });

      resizer.addEventListener('pointermove', (event) => {
        if (!dragging) return;
        if (stacked()) applyHeight(startSize + (event.clientY - startPos));
        else applyWidth(startSize + (event.clientX - startPos));
      });

      function stopDrag() {
        if (!dragging) return;
        dragging = false;
        document.body.classList.remove('is-resizing-sidebar', 'is-resizing-sidebar-y');
        const rect = sidebar.getBoundingClientRect();
        if (stacked()) localStorage.setItem(heightKey, String(Math.round(rect.height)));
        else localStorage.setItem(widthKey, String(Math.round(rect.width)));
      }

      resizer.addEventListener('pointerup', stopDrag);
      resizer.addEventListener('pointercancel', stopDrag);

      resizer.addEventListener('dblclick', () => {
        if (stacked()) {
          applyHeight(Math.round(window.innerHeight * 0.42));
          localStorage.removeItem(heightKey);
        } else {
          applyWidth(defaultWidth);
          localStorage.setItem(widthKey, String(defaultWidth));
        }
      });

      resizer.addEventListener('keydown', (event) => {
        const step = event.shiftKey ? 32 : 16;
        const rect = sidebar.getBoundingClientRect();
        if (stacked()) {
          if (event.key === 'ArrowUp') {
            event.preventDefault();
            applyHeight(rect.height - step);
          } else if (event.key === 'ArrowDown') {
            event.preventDefault();
            applyHeight(rect.height + step);
          } else {
            return;
          }
          localStorage.setItem(heightKey, String(Math.round(sidebar.getBoundingClientRect().height)));
        } else {
          if (event.key === 'ArrowLeft') {
            event.preventDefault();
            applyWidth(rect.width - step);
          } else if (event.key === 'ArrowRight') {
            event.preventDefault();
            applyWidth(rect.width + step);
          } else {
            return;
          }
          localStorage.setItem(widthKey, String(Math.round(sidebar.getBoundingClientRect().width)));
        }
      });
    }

    fetch('/api/tools').then(r => r.json()).then(data => {
      allTools = data.tools || [];
      isDocker = Boolean(data.container);
      if (data.container) {
        dockerNotice.hidden = false;
      }
      renderTools(allTools);
      updateLaunchButton();
    }).catch(() => {
      setStatus('Failed to load tools', 'err');
      showToast('Could not load tools', 'err');
    });

    launchBtn.addEventListener('click', async () => {
      if (!selectedProject) { showToast('Select a project first', 'err'); return; }
      if (!selectedToolId) { showToast('Select a tool first', 'err'); return; }
      setStatus('Launching\u2026');
      launchBtn.disabled = true;
      try {
        const data = await post('/api/launch', { path: selectedProject.path, tool: selectedToolId });
        if (data.error) {
          setStatus(data.error, 'err');
          showToast(data.error, 'err');
        } else {
          setStatus(data.message || 'Launched', 'ok');
          showToast(data.message || 'Launched', 'ok');
          refreshDashboard();
        }
      } finally {
        updateLaunchButton();
      }
    });

    document.getElementById('compliance').addEventListener('click', async () => {
      if (!selectedProject) { showToast('Select a project first', 'err'); return; }
      setStatus('Checking compliance\u2026');
      const data = await post('/api/compliance', { path: selectedProject.path });
      showResult(data.report || data.error || 'No result');
      setStatus(data.error ? 'Compliance check failed' : 'Compliance check complete', data.error ? 'err' : 'ok');
      showToast(data.error ? data.error : 'Compliance scan finished', data.error ? 'err' : 'ok');
    });

    document.getElementById('check').addEventListener('click', async () => {
      if (!selectedProject) { showToast('Select a project first', 'err'); return; }
      setStatus('Running code check\u2026');
      const data = await post('/api/check', { path: selectedProject.path });
      showResult('$ ' + (data.command || '') + '\\n\\n' + (data.output || data.error || ''));
      setStatus(data.error ? 'Code check failed' : 'Code check complete', data.error ? 'err' : 'ok');
      showToast(data.error ? data.error : 'Code check finished', data.error ? 'err' : 'ok');
    });

    document.getElementById('clean').addEventListener('click', async () => {
      if (!selectedProject) { showToast('Select a project first', 'err'); return; }
      setStatus('Previewing cleanup\u2026');
      const preview = await post('/api/clean', { path: selectedProject.path, confirm: false });
      if (preview.error) { setStatus(preview.error, 'err'); showToast(preview.error, 'err'); return; }
      const targets = preview.targets || [];
      if (!targets.length) {
        showResult('Nothing to clean.');
        setStatus('Cleanup complete', 'ok');
        showToast('Nothing to clean', 'ok');
        return;
      }
      showResult('Would remove:\\n' + targets.map(t => '[' + t.type + '] ' + t.path).join('\\n'));
      if (!confirm('Remove ' + targets.length + ' item(s)?')) {
        setStatus('Cleanup cancelled');
        showToast('Cleanup cancelled');
        return;
      }
      setStatus('Cleaning\u2026');
      const done = await post('/api/clean', { path: selectedProject.path, confirm: true });
      showResult(done.message || done.error || 'Done');
      setStatus(done.error ? 'Cleanup failed' : 'Cleanup complete', done.error ? 'err' : 'ok');
      showToast(done.error ? done.error : 'Cleanup complete', done.error ? 'err' : 'ok');
    });

    document.getElementById('refresh').addEventListener('click', async () => {
      tree.innerHTML = '';
      await Promise.all([loadChildren('', tree, true), refreshDashboard()]);
    });

    document.getElementById('create').addEventListener('click', async () => {
      const name = document.getElementById('newName').value.trim();
      const compliance = document.getElementById('newCompliance').checked;
      if (!name) { showToast('Enter a project name', 'err'); return; }
      setStatus('Creating project\u2026');
      const data = await post('/api/new', { name, compliance });
      if (data.error) {
        setStatus(data.error, 'err');
        showToast(data.error, 'err');
      } else {
        setStatus(data.message || 'Created', 'ok');
        showToast(data.message || 'Created', 'ok');
        setTimeout(() => { tree.innerHTML = ''; loadChildren('', tree, true); }, 700);
      }
    });

    searchInput.addEventListener('input', () => filterTree(searchInput.value));
    commandTrigger.addEventListener('click', openPalette);
    themeToggle.addEventListener('click', toggleTheme);
    paletteInput.addEventListener('input', () => renderPalette(paletteInput.value.trim()));
    paletteBackdrop.addEventListener('click', (e) => {
      if (e.target === paletteBackdrop) closePalette();
    });

    document.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        openPalette();
      }
      if (event.key === 'Escape') closePalette();
      if (event.key === '/' && document.activeElement !== searchInput && paletteBackdrop.hidden) {
        event.preventDefault();
        searchInput.focus();
      }
      if (event.key === 'Enter' && selectedProject && selectedToolId && !launchBtn.disabled && document.activeElement.tagName !== 'INPUT') {
        event.preventDefault();
        launchBtn.click();
      }
    });

    (function initTheme() {
      const saved = localStorage.getItem('intellidev-theme');
      if (saved) document.documentElement.setAttribute('data-theme', saved);
    })();
    initSidebarResize();

    function sendHeartbeat() {
      fetch('/api/heartbeat').catch(() => {});
    }

    sendHeartbeat();
    setInterval(sendHeartbeat, 5000);

    refreshDashboard();
    loadChildren('', tree, true);
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
  if (!projectPath) return null;
  try {
    if (!fs.statSync(projectPath).isDirectory()) return null;
  } catch {
    return null;
  }
  return { name: path.basename(projectPath), path: projectPath };
}

function containerMode() {
  return process.env.DEVOPEN_CONTAINER === 'true';
}

function resolveRoot() {
  const cfg = getConfig();
  return process.env.DEVOPEN_ROOT || cfg.developmentRoot || process.cwd();
}

function projectSummary(project) {
  const cls = classifyProjectPath(project.path);
  return {
    name: project.name,
    path: project.path,
    meta: {
      git: getGitInfo(project.path),
      markerCount: cls.markerCount,
      markers: cls.markers.slice(0, 4),
      complianceEnabled: fs.existsSync(path.join(project.path, '.compliance-framework.json')),
    },
  };
}

function serveAsset(req, res, url) {
  const assetMap = {
    '/assets/devopen-mark.svg': {
      file: 'devopen-mark.svg',
      type: 'image/svg+xml; charset=utf-8',
    },
    '/assets/devopen-icon.png': {
      file: 'devopen-icon.png',
      type: 'image/png',
    },
    '/assets/devopen-icon.ico': {
      file: 'devopen-icon.ico',
      type: 'image/x-icon',
    },
  };

  const asset = assetMap[url.pathname];
  if (!asset) return false;

  try {
    const file = path.join(__dirname, '..', 'assets', asset.file);
    const content = fs.readFileSync(file);
    res.writeHead(200, {
      'Content-Type': asset.type,
      'Cache-Control': 'public, max-age=300',
    });
    res.end(content);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Asset not found');
  }
  return true;
}

function enrichTreeChildren(children) {
  return children.map((child) => {
    if (!child.isProject) return child;
    const meta = {
      git: getGitInfo(child.path),
      secretCount: scanProject(child.path).length,
      complianceEnabled: fs.existsSync(path.join(child.path, '.compliance-framework.json')),
      markerCount: classifyProjectPath(child.path).markerCount,
    };
    return { ...child, meta };
  });
}

function statePayload() {
  const state = getState();
  const root = resolveRoot();
  const projectMap = new Map(listAllProjects(root, 4, 300).map((p) => [p.name, p]));

  const favorites = (Array.isArray(state.favorites) ? state.favorites : []).map((name) => {
    const project = projectMap.get(name);
    return project ? projectSummary(project) : { name, path: null, meta: null };
  });

  const telemetry = Array.isArray(state.telemetry) ? state.telemetry : [];
  const recent = [];
  const seen = new Set();
  for (let i = telemetry.length - 1; i >= 0 && recent.length < 8; i--) {
    const row = telemetry[i];
    if (!row || !row.project || seen.has(row.project)) continue;
    seen.add(row.project);
    const project = projectMap.get(row.project);
    recent.push({
      project: row.project,
      tool: row.tool || '',
      ts: row.ts || '',
      projectData: project ? projectSummary(project) : null,
    });
  }

  return { favorites, recent, last: state.last || null };
}

function startServer(port = 8787) {
  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);

    if (req.method === 'GET' && url.pathname === '/') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(HTML);
      return;
    }

    if (req.method === 'GET' && url.pathname.startsWith('/assets/')) {
      if (serveAsset(req, res, url)) return;
    }

    if (req.method === 'GET' && url.pathname === '/api/heartbeat') {
      lastHeartbeat = Date.now();
      json(res, 200, { ok: true, ts: lastHeartbeat });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/tree') {
      const dir = url.searchParams.get('path') || resolveRoot();
      const children = enrichTreeChildren(listChildDirs(dir));
      json(res, 200, { path: dir, children });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/tools') {
      const providers = getProviders();
      const tools = detectTools().map((tool) => {
        const provider = resolveProviderId(tool);
        return {
          id: tool.id,
          label: tool.label,
          kind: tool.kind,
          provider,
          providerLabel: provider && providers[provider] ? providers[provider].label : null,
        };
      });
      json(res, 200, { tools, container: containerMode() });
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/state') {
      json(res, 200, statePayload());
      return;
    }

    if (req.method === 'GET' && url.pathname === '/api/search') {
      const query = (url.searchParams.get('q') || '').trim().toLowerCase();
      const root = resolveRoot();
      let projects = listAllProjects(root, 4, 250).map(projectSummary);
      if (query) {
        projects = projects.filter((project) => project.name.toLowerCase().includes(query) || project.path.toLowerCase().includes(query));
      }
      projects = projects.slice(0, 40);
      json(res, 200, { query, projects });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/favorite') {
      const body = await readBody(req);
      const project = projectFromPath(body.path);
      if (!project) {
        json(res, 400, { error: 'Unknown project' });
        return;
      }

      const state = getState();
      state.favorites = Array.isArray(state.favorites) ? state.favorites : [];
      const exists = state.favorites.includes(project.name);
      if (exists) {
        state.favorites = state.favorites.filter((name) => name !== project.name);
      } else {
        state.favorites.push(project.name);
      }
      saveState(state);

      const payload = statePayload();
      json(res, 200, {
        ok: true,
        favorites: payload.favorites,
        message: exists ? `Removed ${project.name} from Pinned` : `Pinned ${project.name}`,
      });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/gh') {
      const body = await readBody(req);
      const project = projectFromPath(body.path);
      if (!project) {
        json(res, 400, { error: 'Unknown project' });
        return;
      }
      if (containerMode()) {
        json(res, 400, { error: 'Opening GitHub is disabled in Docker mode.' });
        return;
      }

      const remoteUrl = openGitHub(project.path);
      if (!remoteUrl) {
        json(res, 404, { error: 'No Git remote found for ' + project.name });
        return;
      }
      json(res, 200, { ok: true, url: remoteUrl, message: `Opened ${remoteUrl}` });
      return;
    }

    if (req.method === 'POST' && url.pathname === '/api/launch') {
      const body = await readBody(req);
      if (containerMode()) {
        json(res, 400, {
          error:
            'Launching desktop tools is disabled in Docker mode. Run IntelliDev natively on Windows to open editors, terminals, and agents.',
        });
        return;
      }

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
    console.log(`IntelliDev web UI: http://localhost:${port}`);
  });

  if (process.env.DEVOPEN_AUTO_CLOSE === '1') {
    const timeoutMs = Number(process.env.DEVOPEN_AUTO_CLOSE_TIMEOUT_MS) || 20000;
    const watchdog = setInterval(() => {
      if (Date.now() - lastHeartbeat > timeoutMs) {
        clearInterval(watchdog);
        console.log('IntelliDev: no active browser session detected, stopping.');
        server.close(() => process.exit(0));
        if (server.closeAllConnections) server.closeAllConnections();
        setTimeout(() => process.exit(0), 1000);
      }
    }, 2500);
    watchdog.unref && watchdog.unref();
  }

  return server;
}

module.exports = { startServer };
