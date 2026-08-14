function expandEnv(value) {
  if (typeof value !== 'string') return value;
  return value.replace(/%([^%]+)%/g, (_, name) => {
    const v = process.env[name];
    return v === undefined ? `%${name}%` : v;
  });
}

function psQuote(value) {
  return "'" + String(value).replace(/'/g, "''") + "'";
}

function isCmdFile(file) {
  return /\.(cmd|bat)$/i.test(file);
}

module.exports = { expandEnv, psQuote, isCmdFile };
