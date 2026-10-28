const fs = require('node:fs');
const path = require('node:path');
const { ActivityType } = require('discord.js');

function getPresencePath() {
  const storageId = String(process.env.BOT_STORAGE_ID || '').trim();
  if (storageId) {
    return path.resolve(__dirname, '..', '..', '..', '..', 'BotRuntimes', storageId, 'botpresence.json');
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes('BotRuntimes')) {
    return path.join(cwd, 'botpresence.json');
  }

  throw new Error('Le runtime du bot gestion est introuvable.');
}
const DEFAULT_BOT_PRESENCE = Object.freeze({
  status: 'dnd',
  activityType: ActivityType.Custom,
  activityName: 'discord.gg/zix',
  activityUrl: '',
  activityEmoji: '',
});

function readBotPresence() {
  const presencePath = getPresencePath();
  if (!fs.existsSync(presencePath)) return null;

  try {
    const parsed = JSON.parse(fs.readFileSync(presencePath, 'utf8'));
    return parsed && typeof parsed === 'object' ? normalizePresence(parsed) : null;
  } catch {
    return null;
  }
}

function saveBotPresence(state) {
  const normalized = normalizePresence(state);
  const presencePath = getPresencePath();
  fs.mkdirSync(path.dirname(presencePath), { recursive: true });
  fs.writeFileSync(presencePath, JSON.stringify(normalized, null, 2));
  return normalized;
}

function normalizePresence(state = {}) {
  const activityType = Number(state.activityType);
  return {
    status: ['online', 'idle', 'dnd', 'invisible'].includes(state.status) ? state.status : 'idle',
    activityType: Number.isInteger(activityType) && activityType >= 0 && activityType <= 5
      ? activityType
      : ActivityType.Custom,
    activityName: String(state.activityName || '').trim(),
    activityUrl: String(state.activityUrl || '').trim(),
    activityEmoji: String(state.activityEmoji || '').trim(),
  };
}

function buildPresencePayload(state) {
  const presence = normalizePresence(state);
  const activities = [];

  if (presence.activityName) {
    const customState = `${presence.activityEmoji ? `${presence.activityEmoji} ` : ''}${presence.activityName}`.trim();
    activities.push({
      type: presence.activityType,
      name: presence.activityType === ActivityType.Custom ? 'Custom Status' : presence.activityName,
      ...(presence.activityType === ActivityType.Custom ? { state: customState } : {}),
      ...(presence.activityType === ActivityType.Streaming && presence.activityUrl
        ? { url: presence.activityUrl }
        : {}),
    });
  }

  return { status: presence.status, activities };
}

async function applyBotPresence(client, state, { persist = true } = {}) {
  if (!client?.user) throw new Error('Le bot Discord n est pas connecte.');
  const presence = normalizePresence(state);
  client.user.setPresence(buildPresencePayload(presence));
  if (persist) saveBotPresence(presence);
  return presence;
}

async function applySavedBotPresence(client) {
  const presence = readBotPresence();
  if (!presence || !client?.user) return false;
  await applyBotPresence(client, presence, { persist: false });
  return true;
}

async function applyDefaultBotPresence(client) {
  return applyBotPresence(client, DEFAULT_BOT_PRESENCE);
}

module.exports = {
  applyBotPresence,
  applyDefaultBotPresence,
  applySavedBotPresence,
  buildPresencePayload,
  readBotPresence,
  saveBotPresence,
};
