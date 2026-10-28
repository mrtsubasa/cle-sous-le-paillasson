const Discord = require('discord.js');
const { sendModLog } = require('../Utils/modLogs');

async function getUnbanAuditEntry(guild, userId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.MemberBanRemove,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === userId && isRecent;
  }) || null;
}

module.exports = {
  name: 'guildBanRemove',
  async execute(ban, bot) {
    if (!ban?.guild || !ban.user) return;

    const auditEntry = await getUnbanAuditEntry(ban.guild, ban.user.id);
    await sendModLog(bot, ban.guild.id, 'unban', {
      executor: auditEntry?.executor,
      target: ban.user,
      reason: auditEntry?.reason || 'Aucune',
    });
  },
};
