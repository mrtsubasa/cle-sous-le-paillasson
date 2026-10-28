const fs = require('fs');
const path = require('path');
const { decryptToken, encryptToken, readJsonConfig, writeJsonConfig } = require('./tokenVault');

function isMusicTemplate(botType) {
  if (!botType) return false;
  return fs.existsSync(path.join(__dirname, '..', 'BotsFolders', botType, '.env'));
}

function escapeEnvValue(value) {
  const stringValue = value === undefined || value === null ? '' : String(value);
  if (stringValue === '') return '';
  if (/[\s"#=]/.test(stringValue)) {
    return `"${stringValue.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
  }
  return stringValue;
}

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return [];
  return fs.readFileSync(filePath, 'utf8').split(/\r?\n/);
}

function parseEnvValue(rawValue) {
  const value = String(rawValue ?? '').trim();
  if (!value) return '';
  if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
    return value.slice(1, -1);
  }
  return value;
}

function inferDiscordIdFromToken(token) {
  const firstPart = String(token || '').trim().split('.')[0];
  if (!firstPart) return '';

  try {
    const decoded = Buffer.from(firstPart, 'base64').toString('utf8').trim();
    return /^\d{17,20}$/.test(decoded) ? decoded : '';
  } catch {
    return '';
  }
}

function normalizeBuyerIds(...groups) {
  const ids = new Set();

  for (const group of groups) {
    if (!Array.isArray(group)) continue;

    for (const buyerId of group) {
      if (buyerId) ids.add(String(buyerId));
    }
  }

  return [...ids];
}

function buildDefaultMusicConfig() {
  return {
    token: '',
    prefix: '!',
    buyers: [],
    buyer: [],
  };
}

function ensureMusicConfigFile(configPath, patch = {}) {
  const current = readJsonConfig(configPath, { migrateToken: true }) || buildDefaultMusicConfig();
  const next = {
    ...buildDefaultMusicConfig(),
    ...current,
    ...patch,
  };

  if (patch.token !== undefined) next.token = patch.token;
  if (patch.ownerId !== undefined) next.ownerId = patch.ownerId;
  if (patch.botId !== undefined) next.botId = patch.botId;
  if (patch.clientId !== undefined) next.clientId = patch.clientId;

  next.buyers = normalizeBuyerIds(next.buyers, next.buyer, patch.ownerId ? [patch.ownerId] : []);
  next.buyer = [...next.buyers];

  writeJsonConfig(configPath, next);
  return next;
}

function writeEnvFile(filePath, updates, templatePath = null) {
  const sourceLines = fs.existsSync(filePath)
    ? readEnvFile(filePath)
    : readEnvFile(templatePath || '');
  const removeKeys = new Set(updates.__removeKeys || []);
  const finalUpdates = { ...updates };
  delete finalUpdates.__removeKeys;

  const seen = new Set();
  const nextLines = sourceLines.map((line) => {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) return line;

    const key = match[2];
    if (removeKeys.has(key)) return null;
    if (!Object.prototype.hasOwnProperty.call(finalUpdates, key)) {
      return line;
    }

    seen.add(key);
    return `${match[1]}${key}${match[3]}${escapeEnvValue(finalUpdates[key])}`;
  }).filter((line) => line !== null);

  for (const [key, value] of Object.entries(finalUpdates)) {
    if (seen.has(key)) continue;
    nextLines.push(`${key}=${escapeEnvValue(value)}`);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${nextLines.join('\n')}\n`);
}

function readEnvMap(filePath) {
  const map = new Map();
  for (const line of readEnvFile(filePath)) {
    const match = line.match(/^(\s*)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match) continue;
    map.set(match[2], parseEnvValue(match[4]));
  }
  return map;
}

function syncMusicTokens(storageId, botType, tokens = []) {
  if (!isMusicTemplate(botType)) return false;

  const botDir = path.join(__dirname, '..', 'BotRuntimes', storageId || '');
  const envPath = path.join(botDir, '.env');
  const templateEnvPath = path.join(__dirname, '..', 'BotsFolders', botType, '.env');
  const existing = readEnvMap(envPath);
  const nextTokens = [
    ...tokens.map((token) => decryptToken(parseEnvValue(token))).filter(Boolean),
    ...[1, 2, 3]
      .map((index) => existing.get(`MUSIC_TOKEN_${index}`))
      .map((token) => decryptToken(token))
      .filter(Boolean),
  ];
  const uniqueTokens = [...new Set(nextTokens)];
  const encryptedTokens = uniqueTokens.map((token) => encryptToken(token));

  writeEnvFile(envPath, {
    MUSIC_TOKEN_1: encryptedTokens[0] || '',
    MUSIC_TOKEN_2: encryptedTokens[1] || '',
    MUSIC_TOKEN_3: encryptedTokens[2] || '',
    __removeKeys: ['MUSIC_TOKENS', 'BOT_TOKENS'],
  }, templateEnvPath);

  return true;
}

function syncMusicEnvFromConfig(storageId, botType, options = {}) {
  if (!isMusicTemplate(botType)) return false;

  const botDir = path.join(__dirname, '..', 'BotRuntimes', storageId || '');
  const configPath = path.join(botDir, 'config.json');
  const envPath = path.join(botDir, '.env');
  const templateEnvPath = path.join(__dirname, '..', 'BotsFolders', botType, '.env');
  const configFile = ensureMusicConfigFile(configPath, options);
  const token = decryptToken(options.token !== undefined ? options.token : (configFile.token || ''));
  const ownerId = options.ownerId !== undefined ? options.ownerId : (configFile.ownerId || configFile.buyers?.[0] || '');
  const clientId = options.clientId || options.botId || configFile.clientId || configFile.botId || inferDiscordIdFromToken(token);

  if (clientId && (!configFile.clientId || !configFile.botId)) {
    ensureMusicConfigFile(configPath, {
      clientId,
      botId: clientId,
    });
  }

  writeEnvFile(envPath, {
    CONTROL_TOKEN: encryptToken(token),
    BUYER_ID: ownerId || '',
    CLIENT_ID: clientId || '',
    __removeKeys: ['TOKEN'],
  }, templateEnvPath);

  return true;
}

module.exports = {
  isMusicTemplate,
  ensureMusicConfigFile,
  syncMusicTokens,
  syncMusicEnvFromConfig,
  writeEnvFile,
};
