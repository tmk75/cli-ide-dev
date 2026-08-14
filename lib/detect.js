const fs = require('fs');
const { getTools } = require('./config');
const { expandEnv } = require('./util');

function pathExists(file) {
  if (fs.existsSync(file)) return true;
  try {
    fs.lstatSync(file);
    return true;
  } catch {
    return false;
  }
}

function detectTools() {
  return getTools()
    .map((tool) => {
      const candidates = (tool.detect || []).map(expandEnv);
      const exe = candidates.find(pathExists);
      return exe ? { ...tool, exe } : null;
    })
    .filter(Boolean);
}

module.exports = { detectTools };
