const Discord = require('discord.js');
const { sendAutoModerationLog } = require('../Utils/autoModerationLogs');

async function getAutoModerationAuditEntry(guild, ruleId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.AutoModerationRuleCreate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === ruleId && isRecent;
  }) || null;
}

module.exports = {
  name: 'autoModerationRuleCreate',
  async execute(rule, bot) {
    if (!rule?.guild) return;

    const auditEntry = await getAutoModerationAuditEntry(rule.guild, rule.id);
    await sendAutoModerationLog(bot, rule.guild.id, 'rule_create', {
      executor: auditEntry?.executor,
      rule,
    });
  },
};
