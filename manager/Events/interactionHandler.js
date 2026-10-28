const Discord = require('discord.js');

module.exports = {
  name: 'interactionCreate',
  async execute(interaction, bot) {
    if (interaction.type === Discord.InteractionType.ApplicationCommandAutocomplete) {
      const commandfile = bot.slashcommand.get(interaction.commandName);
      if (!commandfile?.autocomplete) {
        await interaction.respond([]);
        return;
      }

      try {
        await commandfile.autocomplete(interaction, bot);
      } catch (error) {
        console.error(`Une erreur non-capturée est survenue pendant l'autocomplete: ${error?.stack || error}`);
        if (!interaction.responded) {
          await interaction.respond([]);
        }
      }
      return;
    }

    if (interaction.type === Discord.InteractionType.ApplicationCommand) {
      const commandfile = bot.slashcommand.get(interaction.commandName);
      if (!commandfile) return;

      try {
        interaction.author = interaction.user;
        await commandfile.run(bot, interaction, interaction.options);
      } catch (error) {
        if (error?.code === 10062) {
          console.log(`[INTERACTION] Réponse trop tardive pour /${interaction.commandName}`);
          return;
        }

        console.error(`Une erreur non-capturée est survenue: ${error?.stack || error}`);
      }
    }
  },
};
