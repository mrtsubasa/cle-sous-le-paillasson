const fs = require('fs');
const path = require('path');

function readJsonConfigSafe(configPath) {
  try {
    if (!fs.existsSync(configPath)) return {};
    return JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch {
    return {};
  }
}

function getRuntimeConfigPath() {
  return path.join(process.cwd(), 'config.json');
}

function loadRuntimeConfig() {
  return readJsonConfigSafe(getRuntimeConfigPath());
}

function getRuntimeDatabasePath() {
  return path.join(process.cwd(), 'Utils', 'DataBase', 'database.db');
}

module.exports = {
  getRuntimeConfigPath,
  getRuntimeDatabasePath,
  loadRuntimeConfig,
  readJsonConfigSafe,
};
