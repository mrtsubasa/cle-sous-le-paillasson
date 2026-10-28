const fs = require('node:fs');
const path = require('node:path');

function createJsonStore() {
  const dataDir = path.join(process.cwd(), 'data');
  const customsPath = path.join(dataDir, 'customs.json');

  ensureDirectory(dataDir);
  ensureJsonFile(customsPath, { guilds: {} });

  function read() {
    try {
      const raw = fs.readFileSync(customsPath, 'utf8').replace(/^\uFEFF/, '');
      if (!raw.trim()) return { guilds: {} };
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== 'object') return { guilds: {} };
      if (!parsed.guilds || typeof parsed.guilds !== 'object') parsed.guilds = {};
      return parsed;
    } catch (error) {
      console.error('[STORE_READ_ERROR]', error);
      return { guilds: {} };
    }
  }

  function write(payload) {
    const tempPath = `${customsPath}.tmp`;
    const content = JSON.stringify(payload, null, 2);
    fs.writeFileSync(tempPath, content, 'utf8');
    fs.renameSync(tempPath, customsPath);
  }

  return { read, write, paths: { dataDir, customsPath } };
}

function ensureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function ensureJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(fallback, null, 2), 'utf8');
  }
}

module.exports = { createJsonStore };
