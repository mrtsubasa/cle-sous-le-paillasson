const {
  getGuildScheduledEventAuditEntry,
  sendGuildScheduledEventLog,
} = require('../Utils/guildScheduledEventLogs');

const recentScheduledEventUpdates = new Map();

module.exports = {
  name: 'guildScheduledEventUpdate',
  async execute(oldGuildScheduledEvent, newGuildScheduledEvent, bot) {
    if (!newGuildScheduledEvent?.guild) return;

    const lastLogAt = recentScheduledEventUpdates.get(newGuildScheduledEvent.id) || 0;
    if (Date.now() - lastLogAt < 1500) return;
    recentScheduledEventUpdates.set(newGuildScheduledEvent.id, Date.now());

    const auditEntry = await getGuildScheduledEventAuditEntry(
      newGuildScheduledEvent.guild,
      newGuildScheduledEvent.id,
      'update',
    );

    await sendGuildScheduledEventLog(bot, newGuildScheduledEvent.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldEvent: oldGuildScheduledEvent,
      event: newGuildScheduledEvent,
    });
  },
};
