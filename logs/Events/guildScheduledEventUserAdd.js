const { sendGuildScheduledEventLog } = require('../Utils/guildScheduledEventLogs');

module.exports = {
  name: 'guildScheduledEventUserAdd',
  async execute(guildScheduledEvent, user, bot) {
    if (!guildScheduledEvent?.guild) return;

    await sendGuildScheduledEventLog(bot, guildScheduledEvent.guild.id, 'user_add', {
      executor: user,
      user,
      event: guildScheduledEvent,
    });
  },
};
