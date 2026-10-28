const Discord = require('discord.js');
const { sendThreadLog } = require('../Utils/threadLogs');

async function getThreadAuditEntry(guild, threadId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.ThreadDelete,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === threadId && isRecent;
  }) || null;
}

module.exports = {
  name: 'threadDelete',
  async execute(thread, bot) {
    if (!thread?.guild) return;

    const auditEntry = await getThreadAuditEntry(thread.guild, thread.id);
    await sendThreadLog(bot, thread.guild.id, 'delete', {
      executor: auditEntry?.executor,
      thread,
    });
  },
};
