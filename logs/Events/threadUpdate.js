const Discord = require('discord.js');
const { sendThreadLog } = require('../Utils/threadLogs');

const recentThreadUpdateLogs = new Map();

async function getThreadAuditEntry(guild, threadId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.ThreadUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === threadId && isRecent;
  }) || null;
}

function hasUsefulChange(oldThread, newThread) {
  return oldThread.name !== newThread.name
    || oldThread.archived !== newThread.archived
    || oldThread.locked !== newThread.locked
    || oldThread.autoArchiveDuration !== newThread.autoArchiveDuration
    || oldThread.rateLimitPerUser !== newThread.rateLimitPerUser
    || oldThread.parentId !== newThread.parentId;
}

function isRecentlyLogged(threadId) {
  const now = Date.now();
  const lastLogAt = recentThreadUpdateLogs.get(threadId) || 0;
  if (now - lastLogAt < 2500) return true;

  recentThreadUpdateLogs.set(threadId, now);
  setTimeout(() => recentThreadUpdateLogs.delete(threadId), 5000).unref?.();
  return false;
}

module.exports = {
  name: 'threadUpdate',
  async execute(oldThread, newThread, bot) {
    if (!newThread?.guild || !hasUsefulChange(oldThread, newThread)) return;
    if (isRecentlyLogged(`${newThread.guild.id}:${newThread.id}`)) return;

    const auditEntry = await getThreadAuditEntry(newThread.guild, newThread.id);
    await sendThreadLog(bot, newThread.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldThread,
      newThread,
    });
  },
};
