const fs = require('fs');
const path = require('path');
const { getInstanceStatus } = require('./managerApi');
const { readJsonConfig } = require('./tokenVault');

function getDefaultFallbackPaths(storageId, options = {}) {
  const fallbackPaths = [];

  if (storageId) {
    fallbackPaths.push(path.join(__dirname, '..', 'BotRuntimes', storageId, 'config.json'));
  }

  if (options.fallbackConfigPath) {
    fallbackPaths.push(options.fallbackConfigPath);
  }

  return fallbackPaths;
}

async function readFallbackConfig(storageId, options = {}) {
  const fallbackPaths = getDefaultFallbackPaths(storageId, options);

  for (const configPath of fallbackPaths) {
    try {
      if (configPath && fs.existsSync(configPath)) {
        const config = readJsonConfig(configPath, { migrateToken: true });
        if (config) return config;
      }
    } catch {
    }
  }

  return null;
}

async function readEnvFallbackConfig(storageId, options = {}) {
  const shouldUseEnvFallback =
    Boolean(options.allowEnvFallback)
    || storageId === 'music'
    || String(storageId || '').endsWith('_music');

  if (!shouldUseEnvFallback) {
    return null;
  }

  const token = process.env.CONTROL_TOKEN || process.env.TOKEN || null;
  if (!token) {
    return null;
  }

  return {
    token,
    controlToken: token,
    fromEnv: true,
    storageId,
  };
}

async function loadManagedBotConfig(storageId, options = {}) {
  if (!storageId) {
    throw new Error('Le storageId du bot est obligatoire.');
  }

  try {
    const response = await getInstanceStatus(storageId);
    const config = response?.data?.config || response?.config || null;
    if (config) return config;
  } catch {}

  const fallbackConfig = await readFallbackConfig(storageId, options);
  if (fallbackConfig) return fallbackConfig;

  const envFallback = await readEnvFallbackConfig(storageId, options);
  if (envFallback) return envFallback;

  throw new Error(`Impossible de charger la configuration du bot ${storageId}.`);
}

async function loginManagedBot(client, storageId, options = {}) {
  const config = await loadManagedBotConfig(storageId, options);

  if (!config?.token) {
    throw new Error(`Le token du bot ${storageId} est introuvable ou invalide.`);
  }

  await client.login(config.token);
  return config;
}

module.exports = {
  loadManagedBotConfig,
  loginManagedBot,
};
