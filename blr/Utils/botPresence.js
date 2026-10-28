const fs = require('fs');
const path = require('path');
const { ActivityType } = require('discord.js');

function getPresenceFile() {
  const storageId = String(process.env.BOT_STORAGE_ID || '').trim();
  if (storageId) {
    return path.resolve(__dirname, '../../../BotRuntimes', storageId, 'botpresence.json');
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes('BotRuntimes')) {
    return path.join(cwd, 'botpresence.json');
  }

  throw new Error('Runtime BLR introuvable pour botpresence.json');
}

function normalizeStatus(status) {
  return ['online', 'idle', 'dnd', 'invisible'].includes(status) ? status : 'idle';
}

function normalizeActivityType(type) {
  return Number.isInteger(type) && type >= 0 && type <= 5 ? type : ActivityType.Custom;
}

function readBotPresence() {
  try {
    const presenceFile = getPresenceFile();
    if (!fs.existsSync(presenceFile)) return null;
    const raw = fs.readFileSync(presenceFile, 'utf8');
    const saved = JSON.parse(raw);

    return {
      status: normalizeStatus(saved.status),
      activityType: normalizeActivityType(saved.activityType),
      activityName: typeof saved.activityName === 'string' ? saved.activityName : '',
      activityUrl: typeof saved.activityUrl === 'string' ? saved.activityUrl : '',
      activityEmoji: typeof saved.activityEmoji === 'string' ? saved.activityEmoji : '',
    };
  } catch (error) {
    console.error('Erreur lecture presence sauvegardee:', error);
    return null;
  }
}

function saveBotPresence(state) {
  const payload = {
    status: normalizeStatus(state?.status),
    activityType: normalizeActivityType(state?.activityType),
    activityName: typeof state?.activityName === 'string' ? state.activityName : '',
    activityUrl: typeof state?.activityUrl === 'string' ? state.activityUrl : '',
    activityEmoji: typeof state?.activityEmoji === 'string' ? state.activityEmoji : '',
  };

  const presenceFile = getPresenceFile();
  fs.mkdirSync(path.dirname(presenceFile), { recursive: true });
  fs.writeFileSync(presenceFile, JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

function buildPresencePayload(state) {
  const status = normalizeStatus(state?.status);
  const activityType = normalizeActivityType(state?.activityType);
  const activityName = typeof state?.activityName === 'string' ? state.activityName.trim() : '';
  const activityUrl = typeof state?.activityUrl === 'string' ? state.activityUrl.trim() : '';
  const activityEmoji = typeof state?.activityEmoji === 'string' ? state.activityEmoji.trim() : '';

  return {
    status,
    activities: activityName
      ? [{
          name: activityType === ActivityType.Custom ? 'Custom Status' : activityName,
          type: activityType,
          ...(activityType === ActivityType.Custom
            ? { state: `${activityEmoji ? `${activityEmoji} ` : ''}${activityName}`.trim() }
            : {}),
          ...(activityType === ActivityType.Streaming && activityUrl ? { url: activityUrl } : {}),
        }]
      : [],
  };
}

module.exports = {
  buildPresencePayload,
  getPresenceFile,
  readBotPresence,
  saveBotPresence,
};
