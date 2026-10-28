const fs = require('fs');
const path = require('path');

const dataDir = path.join(__dirname, '..', 'data'); function loadJson(fileName) { const filePath = path.join(dataDir, fileName); if (!fs.existsSync(filePath)) { return {}; } try { const raw = fs.readFileSync(filePath, 'utf8'); return raw ? JSON.parse(raw) : {};
  } catch (error) {
  console.error(`Failed to load ${fileName}:`, error);
  return {};
  }
}

function saveJson(fileName, data) {
  const filePath = path.join(dataDir, fileName);
  fs.writeFileSync(filePath, JSON.stringify(data, null, 4));
}

module.exports = {
  loadJson,
  saveJson
};
