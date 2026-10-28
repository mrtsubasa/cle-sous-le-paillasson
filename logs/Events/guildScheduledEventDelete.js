const {
  getGuildScheduledEventAuditEntry,
  sendGuildScheduledEventLog,
} = require('../Utils/guildScheduledEventLogs');

module.exports = {
  name: 'guildScheduledEventDelete',
  async execute(guildScheduledEvent, bot) {
    if (!guildScheduledEvent?.guild) return;

    const auditEntry = await getGuildScheduledEventAuditEntry(
      guildScheduledEvent.guild,
      guildScheduledEvent.id,
      'delete',
    );

    await sendGuildScheduledEventLog(bot, guildScheduledEvent.guild.id, 'delete', {
      executor: auditEntry?.executor,
      event: guildScheduledEvent,
    });
  },
};
