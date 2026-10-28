const { sendGuildUnavailableLog } = require('../Utils/guildLogs');

const recentUnavailableLogs = new Map();

module.exports = {
  name: 'guildUnavailable',
  async execute(guild, bot) {
    if (!guild?.id) return;

    const lastLogAt = recentUnavailableLogs.get(guild.id) || 0;
    if (Date.now() - lastLogAt < 30000) return;
    recentUnavailableLogs.set(guild.id, Date.now());

    await sendGuildUnavailableLog(bot, guild.id, guild);
  },
};
