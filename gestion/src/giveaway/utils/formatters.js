const { ActivityType } = require('discord.js');
const { GIVEAWAY_MODE_LABELS } = require('../config/constants');

function formatUserList(userIds) {
  return userIds.length ? userIds.map((userId) => `<@${userId}>`).join(', ') : 'Aucun';
}

function formatRoleList(roleIds) {
  return roleIds.length ? roleIds.map((roleId) => `<@&${roleId}>`).join(', ') : 'Aucun';
}

function formatRequiredCustomStatus(value) {
  return value?.trim() ? value.trim() : 'Aucun';
}

function formatGiveawayMode(mode) {
  return GIVEAWAY_MODE_LABELS[mode] ?? GIVEAWAY_MODE_LABELS.BUTTON;
}

function getMemberCustomStatus(member) {
  const activity = member?.presence?.activities?.find(
    (entry) => entry.type === ActivityType.Custom && typeof entry.state === 'string' && entry.state.trim().length,
  );

  return activity?.state?.trim() ?? null;
}

function normalizeText(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function normalizeStatusText(value) {
  return value.trim().toLowerCase().replace(/\s+/g, ' ');
}

function uniqueIds(values) {
  return [...new Set(values.filter(Boolean))];
}

module.exports = {
  formatGiveawayMode,
  formatRequiredCustomStatus,
  formatRoleList,
  formatUserList,
  getMemberCustomStatus,
  normalizeText,
  normalizeStatusText,
  uniqueIds,
};
