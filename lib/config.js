const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const CONFIG_PATH = path.join(ROOT, 'config.json');
const TOOLS_PATH = path.join(ROOT, 'tools.json');
const PROVIDERS_PATH = path.join(ROOT, 'providers.json');
const STATE_PATH = path.join(ROOT, 'state.json');

function loadEnvFile() {
  const envPath = path.join(ROOT, '.env');
  try {
    if (!fs.existsSync(envPath)) return;
    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
    for (const line of lines) {
      const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    }
  } catch {
    // Ignore a missing or unreadable .env file.
  }
}

loadEnvFile();

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function getConfig() {
  return readJson(CONFIG_PATH, {});
}

function saveConfig(config) {
  writeJson(CONFIG_PATH, config);
}

function getTools() {
  const data = readJson(TOOLS_PATH, { tools: [] });
  return Array.isArray(data.tools) ? data.tools : [];
}

function getProviders() {
  const data = readJson(PROVIDERS_PATH, { providers: {} });
  return data.providers || {};
}

function getState() {
  return readJson(STATE_PATH, { last: null, defaults: {}, favorites: [], telemetry: [] });
}

function saveState(state) {
  writeJson(STATE_PATH, state);
}

function recordTelemetry(project, toolId) {
  const state = getState();
  state.last = { project, tool: toolId, ts: new Date().toISOString() };
  state.telemetry = Array.isArray(state.telemetry) ? state.telemetry : [];
  state.telemetry.push({ project, tool: toolId, ts: new Date().toISOString() });
  if (state.telemetry.length > 500) state.telemetry = state.telemetry.slice(-500);
  saveState(state);
}

module.exports = {
  ROOT,
  getConfig,
  saveConfig,
  getTools,
  getProviders,
  getState,
  saveState,
  recordTelemetry,
};
