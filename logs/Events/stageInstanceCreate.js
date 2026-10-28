const Discord = require('discord.js');
const { sendStageLog } = require('../Utils/stageLogs');

async function getStageAuditEntry(guild, stageInstanceId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.StageInstanceCreate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === stageInstanceId && isRecent;
  }) || null;
}

module.exports = {
  name: 'stageInstanceCreate',
  async execute(stageInstance, bot) {
    if (!stageInstance?.guild) return;

    const auditEntry = await getStageAuditEntry(stageInstance.guild, stageInstance.id);
    await sendStageLog(bot, stageInstance.guild.id, 'create', {
      executor: auditEntry?.executor,
      stageInstance,
    });
  },
};
