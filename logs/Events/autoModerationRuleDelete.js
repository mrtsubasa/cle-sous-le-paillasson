const Discord = require('discord.js');
const { sendAutoModerationLog } = require('../Utils/autoModerationLogs');

async function getAutoModerationAuditEntry(guild, ruleId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.AutoModerationRuleDelete,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === ruleId && isRecent;
  }) || null;
}

module.exports = {
  name: 'autoModerationRuleDelete',
  async execute(rule, bot) {
    if (!rule?.guild) return;

    const auditEntry = await getAutoModerationAuditEntry(rule.guild, rule.id);
    await sendAutoModerationLog(bot, rule.guild.id, 'rule_delete', {
      executor: auditEntry?.executor,
      rule,
    });
  },
};
