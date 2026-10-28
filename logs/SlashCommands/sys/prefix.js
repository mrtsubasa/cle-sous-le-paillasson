const Discord = require('discord.js');
const { getGuildPrefix } = require('../../Utils/bot');

module.exports = {
  name: 'prefix',
  description: 'Changer le prefix du bot pour ce serveur',
  dm_permission: false,
  perm: 'sys',

  run: async (bot, interaction, args) => {
    if (!bot.functions.checkPerm(bot, interaction, 'sys')) {
      return interaction.reply({
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          new Discord.ContainerBuilder()
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true))
            .addTextDisplayComponents(
              new Discord.TextDisplayBuilder().setContent('> Tu ne peux pas utiliser cette commande.'),
            )
            .addSeparatorComponents(new Discord.SeparatorBuilder().setDivider(true)),
        ],
      });
    }

    const currentPrefix = getGuildPrefix(bot, interaction.guild.id);
    const newPrefix = args.join(' ').trim();

    const buildPanel = (content) => {
      return new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# Prefix du serveur'))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(content))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    };

    if (!newPrefix) {
      return interaction.reply({
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          buildPanel(
            `> Prefix actuel : \`${currentPrefix}\`\n> Pour le changer : \`${currentPrefix}prefix <nouveau_prefix>\`\n> Exemple : \`${currentPrefix}prefix !\``,
          ),
        ],
      });
    }

    if (newPrefix.length > 10) {
      return interaction.reply({
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          buildPanel('> Le prefix est trop long. Utilise 10 caractères maximum'),
        ],
      });
    }

    if (/\s/.test(newPrefix)) {
      return interaction.reply({
        flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
        components: [
          buildPanel('> Le prefix ne doit pas contenir d espace'),
        ],
      });
    }

    await bot.db.prepare('UPDATE guilds SET prefix = ? WHERE id = ?')
      .run(newPrefix, interaction.guild.id);

    return interaction.reply({
      flags: Discord.MessageFlags.IsComponentsV2 | Discord.MessageFlags.Ephemeral,
      components: [
        buildPanel(`> Prefix mis à jour pour ce serveur\n> Nouveau prefix : \`${newPrefix}\``),
      ],
    });
  },
};
