const Discord = require('discord.js');
const { sendStageLog } = require('../Utils/stageLogs');

const recentStageUpdateLogs = new Map();

async function getStageAuditEntry(guild, stageInstanceId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.StageInstanceUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === stageInstanceId && isRecent;
  }) || null;
}

function hasUsefulChange(oldStageInstance, newStageInstance) {
  return oldStageInstance.topic !== newStageInstance.topic
    || oldStageInstance.privacyLevel !== newStageInstance.privacyLevel
    || oldStageInstance.guildScheduledEventId !== newStageInstance.guildScheduledEventId
    || oldStageInstance.channelId !== newStageInstance.channelId;
}

function isRecentlyLogged(stageInstanceId) {
  const now = Date.now();
  const lastLogAt = recentStageUpdateLogs.get(stageInstanceId) || 0;
  if (now - lastLogAt < 2500) return true;

  recentStageUpdateLogs.set(stageInstanceId, now);
  setTimeout(() => recentStageUpdateLogs.delete(stageInstanceId), 5000).unref?.();
  return false;
}

module.exports = {
  name: 'stageInstanceUpdate',
  async execute(oldStageInstance, newStageInstance, bot) {
    if (!newStageInstance?.guild || !hasUsefulChange(oldStageInstance, newStageInstance)) return;
    if (isRecentlyLogged(`${newStageInstance.guild.id}:${newStageInstance.id}`)) return;

    const auditEntry = await getStageAuditEntry(newStageInstance.guild, newStageInstance.id);
    await sendStageLog(bot, newStageInstance.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldStageInstance,
      stageInstance: newStageInstance,
    });
  },
};
