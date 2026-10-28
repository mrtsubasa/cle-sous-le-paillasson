const fs = require('fs');
const path = require('path');
const { readJsonConfig, writeJsonConfig } = require('./tokenVault');

function getTemplateDir(botType) {
  return path.join(__dirname, '..', 'BotsFolders', botType || '');
}

function getRuntimeDir(storageId) {
  return path.join(__dirname, '..', 'BotRuntimes', storageId || '');
}

function getRuntimeConfigPath(storageId) {
  return path.join(getRuntimeDir(storageId), 'config.json');
}

function getTemplateConfigPath(botType) {
  return path.join(getTemplateDir(botType), 'config.json');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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

function sanitizeTemplateConfig(config = {}) {
  const next = { ...config };
  delete next.buyers;
  delete next.buyer;
  delete next.ownerId;
  delete next.botId;
  delete next.folder;
  delete next.time;
  delete next.starttime;
  delete next.expired;
  delete next.started;
  delete next.reminderSent;
  delete next.reminderSentAt;
  return next;
}

function removeIfExists(targetPath) {
  if (!targetPath) return;
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function normalizeRelativePath(relativePath) {
  return String(relativePath || '').split(path.sep).join('/');
}

function isRuntimeDataPath(relativePath) {
  const normalized = normalizeRelativePath(relativePath);
  if (!normalized) return false;

  if (normalized === 'config.json') return true;
  if (normalized === '.env') return true;
  if (normalized === 'botpresence.json') return true;
  if (normalized === 'Utils/DataBase' || normalized.startsWith('Utils/DataBase/')) return true;
  if (normalized === 'data' || normalized.startsWith('data/')) return true;

  return /\.(db|db-shm|db-wal|sqlite|sqlite3)$/i.test(path.basename(normalized));
}

function linkOrCopy(sourcePath, destinationPath, type) {
  ensureDir(path.dirname(destinationPath));
  removeIfExists(destinationPath);

  try {
    fs.symlinkSync(sourcePath, destinationPath, type);
    return;
  } catch {
    if (type === 'dir') {
      ensureDir(destinationPath);
      return;
    }
  }

  fs.copyFileSync(sourcePath, destinationPath);
}

function mirrorTemplateTree(sourceDir, destinationDir, options = {}, isRoot = true, relativeRoot = '') {
  const { preserveRootFiles = new Set(['config.json', '.env', 'botpresence.json']) } = options;

  if (!fs.existsSync(sourceDir)) {
    throw new Error(`Le dossier template '${sourceDir}' est introuvable`);
  }

  ensureDir(destinationDir);

  const effectivePreserveRootFiles = isRoot
    ? new Set(['config.json', '.env', ...preserveRootFiles])
    : new Set(preserveRootFiles);

  const sourceEntries = fs.readdirSync(sourceDir, { withFileTypes: true });
  const sourceNames = new Set(sourceEntries.map((entry) => entry.name));

  for (const entry of sourceEntries) {
    if (isRoot && effectivePreserveRootFiles.has(entry.name)) {
      continue;
    }

    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);
    const relativePath = normalizeRelativePath(path.join(relativeRoot, entry.name));

    if (isRuntimeDataPath(relativePath)) {
      continue;
    }

    if (entry.isDirectory()) {
      mirrorTemplateTree(
        sourcePath,
        destinationPath,
        { ...options, preserveRootFiles: effectivePreserveRootFiles },
        false,
        relativePath,
      );
    } else if (entry.isFile()) {
      linkOrCopy(sourcePath, destinationPath, 'file');
    }
  }

  for (const entry of fs.readdirSync(destinationDir, { withFileTypes: true })) {
    if (isRoot && effectivePreserveRootFiles.has(entry.name)) continue;
    if (sourceNames.has(entry.name)) continue;
    const relativePath = normalizeRelativePath(path.join(relativeRoot, entry.name));
    if (isRuntimeDataPath(relativePath)) continue;

    removeIfExists(path.join(destinationDir, entry.name));
  }
}

function prepareBotRuntime(storageId, botType, options = {}) {
  const templateDir = getTemplateDir(botType);
  const runtimeDir = getRuntimeDir(storageId);
  mirrorTemplateTree(templateDir, runtimeDir, options);
  return runtimeDir;
}

function loadTemplateConfig(botType, fallback = {}) {
  const templateConfigPath = getTemplateConfigPath(botType);
  const templateConfig = readJsonConfig(templateConfigPath, { migrateToken: false });
  return templateConfig ? { ...fallback, ...sanitizeTemplateConfig(templateConfig) } : { ...fallback };
}

function ensureRuntimeConfig(storageId, botType, patch = {}, options = {}) {
  const runtimeConfigPath = getRuntimeConfigPath(storageId);
  const current = readJsonConfig(runtimeConfigPath, { migrateToken: true });
  const template = loadTemplateConfig(botType, options.defaults || {});

  const next = {
    ...template,
    ...(current || {}),
    ...patch,
  };

  next.buyers = normalizeBuyerIds(next.buyers, next.buyer);
  next.buyer = [...next.buyers];

  if (botType === 'gestion') {
    const buyerId = String(next.ownerId || next.buyers[0] || next.sysId || '').trim();
    if (buyerId) {
      next.ownerId = buyerId;
      next.sysId = buyerId;
      next.buyers = [buyerId];
      next.buyer = [buyerId];
    }
  }

  writeJsonConfig(runtimeConfigPath, next);
  return next;
}

module.exports = {
  ensureRuntimeConfig,
  getTemplateDir,
  getTemplateConfigPath,
  getRuntimeDir,
  getRuntimeConfigPath,
  loadTemplateConfig,
  mirrorTemplateTree,
  prepareBotRuntime,
};
