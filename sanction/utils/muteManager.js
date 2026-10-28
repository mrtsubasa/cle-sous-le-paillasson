const { tempMutes, muteTimers, data, saveTempMutes } = require('./state');
const { logAction } = require('./logAction');

function persistTempMute(guildId, memberId, entry) {
  const gid = String(guildId);
  const mid = String(memberId);
  if (!data.tempMutes[gid]) data.tempMutes[gid] = {};
  data.tempMutes[gid][mid] = entry;
  saveTempMutes();
}

function removePersistedMute(guildId, memberId) {
  const gid = String(guildId);
  const mid = String(memberId);
  if (data.tempMutes[gid] && data.tempMutes[gid][mid]) {
  delete data.tempMutes[gid][mid];
  if (!Object.keys(data.tempMutes[gid]).length) {
  delete data.tempMutes[gid];
  }
  saveTempMutes();
  }
}

function getMuteKey(guildId, memberId) {
  return `${guildId}:${memberId}`;
}

async function removeMute(client, guildId, memberId) {
  const key = getMuteKey(guildId, memberId);
  const entry = tempMutes.get(key);
  if (!entry) return;

  const guild = client.guilds.cache.get(String(guildId));
  if (!guild) return;

  const member = await guild.members.fetch(String(memberId)).catch(() => null);
  if (!member) return;

  const mutedRole = guild.roles.cache.find((role) => role.name === 'Muted');
  if (!mutedRole) return;

  if (member.roles.cache.has(mutedRole.id)) {
  await member.roles.remove(mutedRole, 'Fin du mute').catch(() => null);
  await logAction(guild, 'Unmute automatique', null, member, 'Fin du mute');
  }

  tempMutes.delete(key);
  removePersistedMute(guildId, memberId);
  const timer = muteTimers.get(key);
  if (timer) {
  clearTimeout(timer);
  muteTimers.delete(key);
  }
}

function scheduleUnmuteMs(client, guildId, memberId, remainingMs) {
  const key = getMuteKey(guildId, memberId);
  const existing = muteTimers.get(key);
  if (existing) {
  clearTimeout(existing);
  muteTimers.delete(key);
  }
  const timeout = setTimeout(() => {
  removeMute(client, guildId, memberId);
  }, remainingMs);
  muteTimers.set(key, timeout);
}

function restoreTempMutes(client) {
  const now = Date.now();
  const entries = data.tempMutes || {};
  for (const [guildId, members] of Object.entries(entries)) {
  for (const [memberId, entry] of Object.entries(members || {})) {
  if (!entry || !entry.endTime) {
  removePersistedMute(guildId, memberId);
  continue;
  }
  const endTime = new Date(entry.endTime).getTime();
  const remainingMs = endTime - now;
  if (remainingMs <= 0) {
  removePersistedMute(guildId, memberId);
  continue;
  }
  tempMutes.set(getMuteKey(guildId, memberId), entry);
  scheduleUnmuteMs(client, guildId, memberId, remainingMs);
  }
  }
}

function scheduleUnmute(client, guildId, memberId, durationMinutes) {
  const key = getMuteKey(guildId, memberId);
  const existing = muteTimers.get(key);
  if (existing) {
  clearTimeout(existing);
  muteTimers.delete(key);
  }
  const timeout = setTimeout(() => {
  removeMute(client, guildId, memberId);
  }, durationMinutes * 60 * 1000);

  muteTimers.set(key, timeout);
}

module.exports = {
  getMuteKey,
  scheduleUnmute,
  scheduleUnmuteMs,
  restoreTempMutes,
  removeMute
};
