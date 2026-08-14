const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');

function createProject(name, opts = {}) {
  const cfg = getConfig();
  const root =
    process.env.DEVOPEN_ROOT ||
    cfg.developmentRoot ||
    process.cwd();

  if (!name || /[<>:"/\\|?*\x00-\x1F]/.test(name) || name === '.' || name === '..') {
    throw new Error('Invalid project name.');
  }

  const target = path.join(root, name);
  if (fs.existsSync(target)) {
    throw new Error('Project already exists: ' + target);
  }

  fs.mkdirSync(target, { recursive: true });

  if (opts.compliance) {
    const marker = {
      enabled: true,
      frameworks: ['CSL', 'DSL', 'PIPL'],
      askedAtUtc: new Date().toISOString(),
    };
    fs.writeFileSync(
      path.join(target, '.compliance-framework.json'),
      JSON.stringify(marker, null, 2) + '\n',
      'utf8',
    );
  }

  return target;
}

module.exports = { createProject };
