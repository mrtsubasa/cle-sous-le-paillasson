const fs = require('node:fs');
const path = require('node:path');

function loadTokenVault() {
  try {
    return require(path.resolve(__dirname, '../../../Utils/tokenVault'));
  } catch {
    return { decryptToken: (value) => value };
  }
}

const { decryptToken } = loadTokenVault();

function loadConfig() {
  const configPath = path.join(process.cwd(), 'config.json');

  if (!fs.existsSync(configPath)) {
    throw new Error('config.json is missing. Copy config.example.json to config.json first.');
  }

  const raw = fs.readFileSync(configPath, 'utf8');
  const parsed = JSON.parse(raw);

  if (!parsed.token || typeof parsed.token !== 'string') {
    throw new Error('config.json: "token" must be a string.');
  }

  if (!parsed.sysId || typeof parsed.sysId !== 'string') {
    throw new Error('config.json: "sysId" must be a string.');
  }

  if (typeof parsed.prefix !== 'string' || parsed.prefix.length === 0) {
    throw new Error('config.json: "prefix" must be a non-empty string.');
  }

  const prefix = parsed.prefix;
  const quickLinks = normalizeQuickLinks(parsed.quickLinks);
  const buyers = normalizeBuyerIds(parsed.buyers);
  const sysId = String(parsed.sysId).trim();

  return {
    token: decryptToken(parsed.token),
    prefix,
    quickLinks,
    buyers,
    sysId
  };
}

module.exports = { loadConfig };

function normalizeBuyerIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map((id) => String(id || '').trim()).filter((id) => /^\d+$/.test(id)))];
}

function normalizeQuickLinks(value) {
  if (!Array.isArray(value)) return [];

  const links = [];
  for (const entry of value.slice(0, 5)) {
    if (!entry || typeof entry !== 'object') continue;

    const label = String(entry.label || '').trim();
    const type = String(entry.type || '').trim().toLowerCase();
    if (!label || (type !== 'url' && type !== 'channel')) continue;

    if (type === 'url') {
      const url = String(entry.url || '').trim();
      if (!/^https?:\/\//i.test(url)) continue;
      links.push({ label, type, url });
      continue;
    }

    const channelId = String(entry.channelId || '').trim();
    if (!/^\d+$/.test(channelId)) continue;
    links.push({ label, type, channelId });
  }

  return links;
}
