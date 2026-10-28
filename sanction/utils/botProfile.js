const fs = require('fs');
const path = require('path');
const { ActivityType } = require('discord.js');

function getProfileFile() {
  const storageId = String(process.env.BOT_STORAGE_ID || '').trim();
  if (storageId) {
    return path.resolve(__dirname, '../../../BotRuntimes', storageId, 'botpresence.json');
  }

  const cwd = path.resolve(process.cwd());
  if (cwd.split(path.sep).includes('BotRuntimes')) {
    return path.join(cwd, 'botpresence.json');
  }

  throw new Error('Runtime sanction introuvable pour botpresence.json');
}

const DEFAULT_PROFILE = {
  status: 'idle',
  activityType: ActivityType.Custom,
  activityName: 'zzzzz',
  activityUrl: '',
  activityEmoji: ''
};

function normalizeStatus(value) {
  const raw = String(value || '').trim().toLowerCase();
  return ['online', 'idle', 'dnd', 'invisible'].includes(raw) ? raw : DEFAULT_PROFILE.status;
}

function normalizeActivityType(value) {
  const raw = String(value || '').trim().toLowerCase();
  const aliasMap = {
    playing: ActivityType.Playing,
    stream: ActivityType.Streaming,
    streaming: ActivityType.Streaming,
    listen: ActivityType.Listening,
    listening: ActivityType.Listening,
    watch: ActivityType.Watching,
    watching: ActivityType.Watching,
    custom: ActivityType.Custom,
    status: ActivityType.Custom,
    competing: ActivityType.Competing,
  };

  if (Object.prototype.hasOwnProperty.call(aliasMap, raw)) {
    return aliasMap[raw];
  }

  const parsed = Number.parseInt(raw, 10);
  return Number.isInteger(parsed) ? parsed : DEFAULT_PROFILE.activityType;
}

function normalizeProfile(raw) {
  const input = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
  return {
    status: normalizeStatus(input.status),
    activityType: normalizeActivityType(input.activityType),
    activityName: typeof input.activityName === 'string' ? input.activityName.trim() : '',
    activityUrl: typeof input.activityUrl === 'string' ? input.activityUrl.trim() : '',
    activityEmoji: typeof input.activityEmoji === 'string' ? input.activityEmoji.trim() : '',
  };
}

function readProfile() {
  try {
    const profileFile = getProfileFile();
    if (!fs.existsSync(profileFile)) {
      return { ...DEFAULT_PROFILE };
    }

    const raw = fs.readFileSync(profileFile, 'utf8');
    if (!raw.trim()) return { ...DEFAULT_PROFILE };
    return { ...DEFAULT_PROFILE, ...normalizeProfile(JSON.parse(raw)) };
  } catch {
    return { ...DEFAULT_PROFILE };
  }
}

function saveProfile(profile) {
  const next = normalizeProfile(profile);
  const profileFile = getProfileFile();
  fs.mkdirSync(path.dirname(profileFile), { recursive: true });
  fs.writeFileSync(profileFile, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

function normalizeStreamingUrl(value) {
  const url = String(value || '').trim();
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `https://${url}`;
}

function buildPresencePayload(profile) {
  const state = normalizeProfile(profile);
  const payload = {
    status: state.status === 'invisible' ? 'invisible' : state.status,
    activities: []
  };

  if (!state.activityName) {
    return payload;
  }

  const activity = {
    type: state.activityType,
    name: state.activityType === ActivityType.Custom ? 'Custom Status' : state.activityName
  };

  if (state.activityType === ActivityType.Custom) {
    activity.state = `${state.activityEmoji ? `${state.activityEmoji} ` : ''}${state.activityName}`.trim();
  }

  if (state.activityType === ActivityType.Streaming && state.activityUrl) {
    activity.url = state.activityUrl;
  }

  payload.activities = [activity];
  return payload;
}

function readCurrentPresence(clientUser) {
  const presence = clientUser?.presence;
  const activity = presence?.activities?.[0] ?? null;

  if (!presence && !activity) {
    return readProfile();
  }

  return normalizeProfile({
    status: presence?.status || DEFAULT_PROFILE.status,
    activityType: activity?.type ?? DEFAULT_PROFILE.activityType,
    activityName: activity?.type === ActivityType.Custom
      ? (activity?.state || activity?.name || '')
      : (activity?.name || ''),
    activityUrl: activity?.url || '',
    activityEmoji: activity?.type === ActivityType.Custom ? (activity?.emoji?.name || '') : '',
  });
}

function formatActivity(profile) {
  const state = normalizeProfile(profile);
  if (!state.activityName) return '> Aucune activite definie';

  const typeLabel = {
    [ActivityType.Playing]: 'Playing',
    [ActivityType.Streaming]: 'Streaming',
    [ActivityType.Listening]: 'Listening',
    [ActivityType.Watching]: 'Watching',
    [ActivityType.Custom]: 'Custom',
    [ActivityType.Competing]: 'Competing',
  }[state.activityType] || `Type ${state.activityType}`;

  const urlPart = state.activityType === ActivityType.Streaming && state.activityUrl
    ? `\n> URL: ${state.activityUrl}`
    : '';

  const emojiPart = state.activityType === ActivityType.Custom && state.activityEmoji
    ? `${state.activityEmoji} `
    : '';

  return `> **Type :** ${typeLabel}\n> **Texte :** ${emojiPart}${state.activityName}${urlPart}`;
}

function formatStatus(profile) {
  const state = normalizeProfile(profile);
  if (state.status === 'invisible') return 'offline (invisible)';
  return state.status || DEFAULT_PROFILE.status;
}

module.exports = {
  DEFAULT_PROFILE,
  getProfileFile,
  readProfile,
  saveProfile,
  readCurrentPresence,
  buildPresencePayload,
  formatActivity,
  formatStatus,
  normalizeProfile,
  normalizeActivityType,
  normalizeStreamingUrl,
};
