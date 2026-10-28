const fs = require("fs");
const path = require("path");
const { ActivityType } = require("discord.js");

const PROFILE_DIR = path.resolve(__dirname, "..", "botprofiles");
const ASSET_DIR = path.join(PROFILE_DIR, "assets");
const profileStateCache = new Map();

function getRuntimeRoot() {
  return process.cwd();
}

function isRuntimeRoot(rootPath) {
  return normalizePath(rootPath).includes("/BotRuntimes/");
}

function normalizePath(filePath) {
  return String(filePath || "").split(path.sep).join("/");
}

function normalizeStatus(status) {
  return ["online", "idle", "dnd", "invisible"].includes(status) ? status : "idle";
}

function normalizeActivityType(type) {
  return Number.isInteger(type) && type >= 0 && type <= 5 ? type : ActivityType.Custom;
}

function sanitizeKey(key) {
  return String(key || "default").replace(/[^a-zA-Z0-9._-]/g, "_");
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function getProfileStatePath(targetKey) {
  if (targetKey === "control" && isRuntimeRoot(getRuntimeRoot())) {
    return path.join(getRuntimeRoot(), "botpresence.json");
  }

  return path.join(PROFILE_DIR, `${sanitizeKey(targetKey)}.json`);
}

function getProfileAssetPath(targetKey, kind) {
  return path.join(ASSET_DIR, sanitizeKey(targetKey), `${kind}.png`);
}

function readProfileState(targetKey) {
  if (profileStateCache.has(targetKey)) {
    return profileStateCache.get(targetKey);
  }

  try {
    const filePath = getProfileStatePath(targetKey);
    if (!fs.existsSync(filePath)) return null;

    const raw = fs.readFileSync(filePath, "utf8");
    const saved = JSON.parse(raw);

    return {
      username: typeof saved.username === "string" ? saved.username : "",
      status: normalizeStatus(saved.status),
      activityType: normalizeActivityType(saved.activityType),
      activityName: typeof saved.activityName === "string" ? saved.activityName : "",
      activityUrl: typeof saved.activityUrl === "string" ? saved.activityUrl : "",
      activityEmoji: typeof saved.activityEmoji === "string" ? saved.activityEmoji : "",
    };
  } catch (error) {
    console.error("Erreur lecture bot profile:", error);
    return null;
  }
}

function cacheProfileState(targetKey, state) {
  if (!state) {
    profileStateCache.delete(targetKey);
    return null;
  }

  const payload = {
    username: typeof state.username === "string" ? state.username : "",
    status: normalizeStatus(state.status),
    activityType: normalizeActivityType(state.activityType),
    activityName: typeof state.activityName === "string" ? state.activityName : "",
    activityUrl: typeof state.activityUrl === "string" ? state.activityUrl : "",
    activityEmoji: typeof state.activityEmoji === "string" ? state.activityEmoji : "",
  };

  profileStateCache.set(targetKey, payload);
  return payload;
}

function saveProfileState(targetKey, state) {
  ensureDir(PROFILE_DIR);
  const payload = cacheProfileState(targetKey, state);

  fs.writeFileSync(getProfileStatePath(targetKey), JSON.stringify(payload, null, 2), "utf8");
  return payload;
}

function saveProfileAsset(targetKey, kind, buffer) {
  ensureDir(path.join(ASSET_DIR, sanitizeKey(targetKey)));
  const assetPath = getProfileAssetPath(targetKey, kind);
  fs.writeFileSync(assetPath, buffer);
  return assetPath;
}

function readProfileAsset(targetKey, kind) {
  try {
    const assetPath = getProfileAssetPath(targetKey, kind);
    if (!fs.existsSync(assetPath)) return null;
    return fs.readFileSync(assetPath);
  } catch (error) {
    console.error("Erreur lecture asset bot profile:", error);
    return null;
  }
}

function buildPresencePayload(state) {
  const status = normalizeStatus(state?.status);
  const activityType = normalizeActivityType(state?.activityType);
  const activityName = typeof state?.activityName === "string" ? state.activityName.trim() : "";
  const activityUrl = typeof state?.activityUrl === "string" ? state.activityUrl.trim() : "";
  const activityEmoji = typeof state?.activityEmoji === "string" ? state.activityEmoji.trim() : "";

  return {
    status,
    activities: activityName
      ? [{
          name: activityType === ActivityType.Custom ? "Custom Status" : activityName,
          type: activityType,
          ...(activityType === ActivityType.Custom
            ? { state: `${activityEmoji ? `${activityEmoji} ` : ""}${activityName}`.trim() }
            : {}),
          ...(activityType === ActivityType.Streaming && activityUrl ? { url: activityUrl } : {}),
        }]
      : [],
  };
}

async function applySavedProfile(client, targetKey) {
  if (!client?.user) return null;

  const state = readProfileState(targetKey);
  if (!state) return null;

  if (state.username && client.user.username !== state.username) {
    await client.user.setUsername(state.username).catch(() => null);
  }

  client.user.setPresence(buildPresencePayload(state));

  const avatar = readProfileAsset(targetKey, "avatar");
  if (avatar) {
    await client.user.setAvatar(avatar).catch(() => null);
  }

  const banner = readProfileAsset(targetKey, "banner");
  if (banner) {
    await client.user.setBanner(banner).catch(() => null);
  }

  return state;
}

function getProfileState(targetKey) {
  return readProfileState(targetKey);
}

module.exports = {
  applySavedProfile,
  buildPresencePayload,
  cacheProfileState,
  getProfileAssetPath,
  getProfileStatePath,
  getProfileState,
  normalizeActivityType,
  normalizeStatus,
  readProfileAsset,
  readProfileState,
  saveProfileAsset,
  saveProfileState,
};
