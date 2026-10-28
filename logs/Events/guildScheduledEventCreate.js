const {
  getGuildScheduledEventAuditEntry,
  sendGuildScheduledEventLog,
} = require('../Utils/guildScheduledEventLogs');

module.exports = {
  name: 'guildScheduledEventCreate',
  async execute(guildScheduledEvent, bot) {
    if (!guildScheduledEvent?.guild) return;

    const auditEntry = await getGuildScheduledEventAuditEntry(
      guildScheduledEvent.guild,
      guildScheduledEvent.id,
      'create',
    );

    await sendGuildScheduledEventLog(bot, guildScheduledEvent.guild.id, 'create', {
      executor: auditEntry?.executor || guildScheduledEvent.creator,
      event: guildScheduledEvent,
    });
  },
};
