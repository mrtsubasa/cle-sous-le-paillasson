const Discord = require('discord.js');
const { sendAutoModerationLog } = require('../Utils/autoModerationLogs');

const recentAutoModerationRuleUpdateLogs = new Map();

async function getAutoModerationAuditEntry(guild, ruleId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.AutoModerationRuleUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === ruleId && isRecent;
  }) || null;
}

function hasUsefulChange(oldRule, newRule) {
  if (!oldRule) return true;
  return oldRule.name !== newRule.name
    || oldRule.enabled !== newRule.enabled
    || oldRule.eventType !== newRule.eventType
    || oldRule.actions?.length !== newRule.actions?.length
    || oldRule.exemptRoles?.size !== newRule.exemptRoles?.size
    || oldRule.exemptChannels?.size !== newRule.exemptChannels?.size
    || JSON.stringify(oldRule.triggerMetadata || {}) !== JSON.stringify(newRule.triggerMetadata || {});
}

function isRecentlyLogged(ruleId) {
  const now = Date.now();
  const lastLogAt = recentAutoModerationRuleUpdateLogs.get(ruleId) || 0;
  if (now - lastLogAt < 2500) return true;

  recentAutoModerationRuleUpdateLogs.set(ruleId, now);
  setTimeout(() => recentAutoModerationRuleUpdateLogs.delete(ruleId), 5000).unref?.();
  return false;
}

module.exports = {
  name: 'autoModerationRuleUpdate',
  async execute(oldRule, newRule, bot) {
    if (!newRule?.guild || !hasUsefulChange(oldRule, newRule)) return;
    if (isRecentlyLogged(`${newRule.guild.id}:${newRule.id}`)) return;

    const auditEntry = await getAutoModerationAuditEntry(newRule.guild, newRule.id);
    await sendAutoModerationLog(bot, newRule.guild.id, 'rule_update', {
      executor: auditEntry?.executor,
      oldRule,
      newRule,
    });
  },
};
