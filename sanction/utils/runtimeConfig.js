const fs = require('fs');
const path = require('path');

function getSanctionRuntimeConfigPath() {
  const botType = path.basename(path.dirname(__dirname));
  const rootDir = path.join(__dirname, '..', '..', '..');
  const runtimeDir = path.join(rootDir, 'BotRuntimes');
  const storageId = process.env.BOT_STORAGE_ID || null;

  if (storageId) {
    const runtimeConfigPath = path.join(runtimeDir, storageId, 'config.json');
    if (fs.existsSync(runtimeConfigPath)) {
      return runtimeConfigPath;
    }
  }

  if (fs.existsSync(runtimeDir)) {
    const matches = fs.readdirSync(runtimeDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && String(entry.name).endsWith(`_${botType}`))
      .map((entry) => path.join(runtimeDir, entry.name, 'config.json'))
      .filter((configPath) => fs.existsSync(configPath));

    if (matches.length > 0) {
      matches.sort((a, b) => a.localeCompare(b));
      return matches[0];
    }
  }

  return path.join(__dirname, '..', 'config.json');
}

module.exports = {
  getSanctionRuntimeConfigPath,
};
