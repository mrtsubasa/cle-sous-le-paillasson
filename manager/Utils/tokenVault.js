const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const TOKEN_PREFIX = 'enc:v1:';
const DEFAULT_KEY_PATH = path.join(__dirname, '.token-secret');
const TOKEN_ALGO = 'aes-256-gcm';

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

function isRuntimeConfigPath(filePath) {
  const normalized = String(filePath || '').split(path.sep).join('/');
  return normalized.includes('/BotRuntimes/');
}

function getKeyPath() {
  return process.env.TOKEN_VAULT_KEY_PATH || DEFAULT_KEY_PATH;
}

function getKeyBuffer() {
  const envKey = String(process.env.TOKEN_VAULT_KEY || '').trim();
  if (envKey) {
    const normalized = envKey.replace(/^base64:/i, '');
    const keyBuffer = Buffer.from(normalized, 'base64');
    if (keyBuffer.length === 32) return keyBuffer;
    return crypto.createHash('sha256').update(envKey).digest();
  }

  const keyPath = getKeyPath();
  if (!fs.existsSync(keyPath)) {
    fs.mkdirSync(path.dirname(keyPath), { recursive: true });
    fs.writeFileSync(keyPath, crypto.randomBytes(32).toString('base64'));
  }

  const rawKey = fs.readFileSync(keyPath, 'utf8').trim();
  const keyBuffer = Buffer.from(rawKey, 'base64');
  if (keyBuffer.length === 32) return keyBuffer;

  return crypto.createHash('sha256').update(rawKey).digest();
}

function isEncryptedToken(value) {
  return typeof value === 'string' && value.startsWith(TOKEN_PREFIX);
}

function encryptToken(value) {
  if (value === null || value === undefined || value === '') return value;
  if (isEncryptedToken(value)) return value;

  const key = getKeyBuffer();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(TOKEN_ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    'enc',
    'v1',
    iv.toString('base64'),
    authTag.toString('base64'),
    encrypted.toString('base64'),
  ].join(':');
}

function decryptToken(value) {
  if (!isEncryptedToken(value)) return value;

  const parts = String(value).split(':');
  if (parts.length !== 5) return value;

  const [, , ivB64, tagB64, payloadB64] = parts;

  try {
    const key = getKeyBuffer();
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const payload = Buffer.from(payloadB64, 'base64');
    const decipher = crypto.createDecipheriv(TOKEN_ALGO, key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(payload), decipher.final()]).toString('utf8');
  } catch {
    return value;
  }
}

function readJsonConfig(filePath, { migrateToken = true } = {}) {
  if (!fs.existsSync(filePath)) return null;

  let data;
  try {
    data = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }

  const originalToken = data.token;
  const tokenWasEncrypted = isEncryptedToken(originalToken);
  const allowWriteBack = isRuntimeConfigPath(filePath);

  if (typeof data.token === 'string' && data.token) {
    if (tokenWasEncrypted) {
      data.token = decryptToken(data.token);
    } else if (migrateToken) {
      data.token = encryptToken(data.token);
      if (allowWriteBack) {
        writeJsonConfig(filePath, data, { encryptToken: false });
      }
      data.token = decryptToken(data.token);
    }
  }

  if (allowWriteBack && (Array.isArray(data.buyers) || Array.isArray(data.buyer))) {
    const normalizedBuyers = normalizeBuyerIds(data.buyers, data.buyer);
    const shouldWriteBack = JSON.stringify(data.buyers || []) !== JSON.stringify(normalizedBuyers)
      || JSON.stringify(data.buyer || []) !== JSON.stringify(normalizedBuyers);

    if (shouldWriteBack) {
      data.buyers = normalizedBuyers;
      data.buyer = [...normalizedBuyers];
      writeJsonConfig(filePath, data, { encryptToken: tokenWasEncrypted });
    } else {
      data.buyers = normalizedBuyers;
      data.buyer = [...normalizedBuyers];
    }
  }

  return data;
}

function writeJsonConfig(filePath, data, { encryptToken: shouldEncryptToken = true } = {}) {
  const next = { ...data };
  const runtimeConfigPath = isRuntimeConfigPath(filePath);

  if (runtimeConfigPath && fs.existsSync(filePath)) {
    try {
      if (fs.lstatSync(filePath).isSymbolicLink()) {
        fs.unlinkSync(filePath);
      }
    } catch {
      // If the existing file cannot be inspected, continue with the write.
    }
  }

  if (shouldEncryptToken && typeof next.token === 'string' && next.token) {
    next.token = encryptToken(next.token);
  }

  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(next, null, 2));
  return next;
}

module.exports = {
  decryptToken,
  encryptToken,
  isEncryptedToken,
  readJsonConfig,
  writeJsonConfig,
};
