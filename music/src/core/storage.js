const fs = require("fs/promises");
const path = require("path");

function getDataDir() {
  const storageId = String(process.env.BOT_STORAGE_ID || "").trim();
  if (storageId) {
    return path.resolve(__dirname, "../../../../BotRuntimes", storageId, "data");
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes("BotRuntimes")) {
    return path.join(cwd, "data");
  }

  return path.join(__dirname, "..", "data");
}

const dataDir = getDataDir();
const panelStorePath = path.join(dataDir, "panels.json");

async function ensureDataDir() {
  await fs.mkdir(dataDir, { recursive: true });
}

async function readJson(filePath, fallback) {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    return JSON.parse(raw);
  } catch (error) {
    if (error.code === "ENOENT") return fallback;
    throw error;
  }
}

async function writeJson(filePath, value) {
  await ensureDataDir();
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function loadPanelStore() {
  return readJson(panelStorePath, {});
}

async function savePanelStore(store) {
  await writeJson(panelStorePath, store);
}

module.exports = {
  loadPanelStore,
  savePanelStore,
  panelStorePath,
};
