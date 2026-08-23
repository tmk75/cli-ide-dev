const fs = require('fs');
const path = require('path');
const { getConfig } = require('./config');

function createProject(name, opts = {}) {
  const cfg = getConfig();
  const root =
    process.env.DEVOPEN_ROOT ||
    cfg.developmentRoot ||
    process.cwd();

  const clean = String(name || '')
    .trim()
    .replace(/[. ]+$/, '');

  if (
    !clean ||
    /[<>:"/\\|?*\x00-\x1F]/.test(clean) ||
    clean === '.' ||
    clean === '..' ||
    /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(clean)
  ) {
    throw new Error('Invalid project name.');
  }

  const target = path.join(root, clean);
  if (fs.existsSync(target)) {
    throw new Error('Project already exists: ' + target);
  }

  try {
    fs.mkdirSync(target, { recursive: true });
  } catch (error) {
    throw new Error('Could not create project folder: ' + error.message);
  }

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
