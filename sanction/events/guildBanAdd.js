const { AuditLogEvent } = require('discord.js');
const { data, saveBanLogs } = require('../utils/state');

function ensureGuildLogs(guildId) {
  if (!data.banLogs[guildId] || typeof data.banLogs[guildId] !== 'object') {
    data.banLogs[guildId] = {};
  }
  return data.banLogs[guildId];
}

async function resolveBanExecutor(guild, targetUserId) {
  const logs = await guild.fetchAuditLogs({
    type: AuditLogEvent.MemberBanAdd,
    limit: 10
  }).catch(() => null);

  if (!logs) return null;

  const now = Date.now();
  return logs.entries.find((entry) => {
    if (!entry || !entry.executor || !entry.target) return false;
    if (String(entry.target.id) !== String(targetUserId)) return false;
    return Math.abs(now - entry.createdTimestamp) <= 120000;
  }) || null;
}

module.exports = {
  name: 'guildBanAdd',
  async execute(ban) {
    if (!ban || !ban.guild || !ban.user) return;

    const guild = ban.guild;
    const guildId = String(guild.id);
    const userId = String(ban.user.id);
    const guildLogs = ensureGuildLogs(guildId);
    const existing = guildLogs[userId];

    if (existing && existing.moderator && existing.reason && existing.reason !== 'aucune raison') {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const entry = await resolveBanExecutor(guild, userId);

    const moderatorId = entry && entry.executor ? String(entry.executor.id) : (existing && existing.moderator ? String(existing.moderator) : 'unknown');
    const moderatorTag = entry && entry.executor
      ? (entry.executor.tag || entry.executor.username || null)
      : (existing && existing.moderatorTag ? String(existing.moderatorTag) : null);

    guildLogs[userId] = {
      moderator: moderatorId,
      moderatorTag,
      reason: ban.reason || (existing && existing.reason ? existing.reason : 'aucune raison'),
      date: new Date().toISOString()
    };

    saveBanLogs();
  }
};
