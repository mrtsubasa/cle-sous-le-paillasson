const Discord = require('discord.js');

module.exports = {
  name: 'help',
  description: 'Permet de voir la liste des commandes',
  dm_permission: true,
  perm: 'everyone',

  run: async (bot, interaction, args, config) => {
    const uniqueCommands = new Set();

    bot.slashCommands.forEach((cmd) => {
      const type = cmd.perm || 'everyone';

      if (bot.functions.checkPerm(bot, interaction, type)) {
        uniqueCommands.add(`> \`/${cmd.name}\` : ${cmd.description || 'Aucune description'}`);
      }
    });

    const commandsList = Array.from(uniqueCommands);

    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder()
          .setSpacing(Discord.SeparatorSpacingSize.Small)
          .setDivider(true),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `# Page d'aide\n> Permet de voir la liste des commandes en fonction de vos permissions sur le bot`,
        ),
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder()
          .setSpacing(Discord.SeparatorSpacingSize.Small)
          .setDivider(true),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `# Commandes disponibles\n${commandsList.join('\n') || 'Aucune commande disponible'}`,
        ),
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder()
          .setSpacing(Discord.SeparatorSpacingSize.Small)
          .setDivider(true),
      );

    await interaction.reply({
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [bite],
    });
  },
};
