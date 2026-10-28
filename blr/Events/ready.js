const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');
const config = loadRuntimeConfig();
const { buildPresencePayload, readBotPresence, saveBotPresence } = require('../Utils/botPresence');

module.exports = {
  name: 'clientReady',
  once: true,
  async execute(bot) {
    const commands = Array.isArray(bot.arrayOfSlashCommands) ? bot.arrayOfSlashCommands : [];
    const commandData = commands.map((command) =>
      typeof command?.toJSON === 'function' ? command.toJSON() : command
    );

    await bot.application.commands.set([]).catch(() => {});

    const targetGuildIds = [...new Set([
      config.guildId,
      ...bot.guilds.cache.map((guild) => guild.id),
    ].filter(Boolean))];

    await Promise.allSettled(
      targetGuildIds.map(async (guildId) => {
        const guild = bot.guilds.cache.get(guildId) || await bot.guilds.fetch(guildId).catch(() => null);
        if (!guild) return;
        await guild.commands.set(commandData);
      })
    );

    const presence = readBotPresence() || {
      status: 'dnd',
      activityType: 4,
      activityName: 'discord.gg/zix',
      activityUrl: '',
      activityEmoji: '',
    };

    try {
      await bot.user.setPresence(buildPresencePayload(presence));
      saveBotPresence(presence);
    } catch (error) {
      console.error('Erreur presence ready:', error);
    }
  },
};
