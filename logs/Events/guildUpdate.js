const Discord = require('discord.js');
const { sendGuildUpdateLog } = require('../Utils/guildLogs');

const recentGuildUpdates = new Map();

async function getGuildAuditEntry(guild) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.GuildUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 12000;
    return targetId === guild.id && isRecent;
  }) || null;
}

module.exports = {
  name: 'guildUpdate',
  async execute(oldGuild, newGuild, bot) {
    if (!newGuild?.id) return;

    const lastLogAt = recentGuildUpdates.get(newGuild.id) || 0;
    if (Date.now() - lastLogAt < 2000) return;
    recentGuildUpdates.set(newGuild.id, Date.now());

    const auditEntry = await getGuildAuditEntry(newGuild);
    await sendGuildUpdateLog(bot, newGuild.id, {
      executor: auditEntry?.executor,
      oldGuild,
      guild: newGuild,
    });
  },
};
