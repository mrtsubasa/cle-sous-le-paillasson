const { sendGuildScheduledEventLog } = require('../Utils/guildScheduledEventLogs');

module.exports = {
  name: 'guildScheduledEventUserRemove',
  async execute(guildScheduledEvent, user, bot) {
    if (!guildScheduledEvent?.guild) return;

    await sendGuildScheduledEventLog(bot, guildScheduledEvent.guild.id, 'user_remove', {
      executor: user,
      user,
      event: guildScheduledEvent,
    });
  },
};
