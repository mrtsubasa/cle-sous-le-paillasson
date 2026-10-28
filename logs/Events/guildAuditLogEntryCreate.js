const Discord = require('discord.js');
const { sendIntegrationLog } = require('../Utils/integrationLogs');

const INTEGRATION_ACTIONS = {
  [Discord.AuditLogEvent.IntegrationCreate]: 'create',
  [Discord.AuditLogEvent.IntegrationDelete]: 'delete',
  [Discord.AuditLogEvent.IntegrationUpdate]: 'update',
};

module.exports = {
  name: 'guildAuditLogEntryCreate',
  async execute(auditEntry, guild, bot) {
    const action = INTEGRATION_ACTIONS[auditEntry?.action];
    if (!action || !guild?.id) return;

    await sendIntegrationLog(bot, guild.id, action, {
      executor: auditEntry.executor,
      integration: auditEntry.target,
      auditEntry,
    });
  },
};
