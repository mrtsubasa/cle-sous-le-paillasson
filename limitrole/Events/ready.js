const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');
const config = loadRuntimeConfig();
const { buildPresencePayload, readBotPresence } = require('../Utils/botPresence');

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

    const presence = readBotPresence(bot);

    try {
      if (presence) {
        await bot.user.setPresence(buildPresencePayload(presence));
      } else {
        await bot.user.setPresence({ activities: [{ name: 'discord.gg/zix', type: 4 }], status: 'dnd' });
      }
    } catch (error) {
      console.error('Erreur presence ready:', error);
    }
  },
};
