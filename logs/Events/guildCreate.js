const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');
const config = loadRuntimeConfig();

module.exports = {
  name: 'guildCreate',
  once: false,
  async execute(guild, bot) {
    const commands = Array.isArray(bot.arrayOfSlashCommands) ? bot.arrayOfSlashCommands : [];
    const commandData = commands.map((command) =>
      typeof command?.toJSON === 'function' ? command.toJSON() : command
    );

    if (config.guildId && String(config.guildId) !== String(guild.id)) {
      return;
    }

    await guild.commands.set(commandData).catch((error) => {
      console.log(`[LOGS] Impossible d'enregistrer les slash commands sur ${guild.id}: ${error.message}`);
    });
  },
};
