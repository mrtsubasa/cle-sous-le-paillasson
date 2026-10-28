const Discord = require('discord.js');
const { getGuildPrefix } = require('../Utils/bot.js');

exports.help = {
  name: 'prefix',
  aliases: ["pref"],
  type: 'sys',
  description: 'Changer le prefix du bot pour ce serveur',
};

exports.run = async (bot, message, args) => {
  if (!message.guild) return;
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const currentPrefix = getGuildPrefix(bot, message.guild.id);
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
    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [
        buildPanel(
          `> Prefix actuel : \`${currentPrefix}\`\n> Pour le changer : \`${currentPrefix}prefix <nouveau_prefix>\`\n> Exemple : \`${currentPrefix}prefix !\``,
        ),
      ],
    });
  }

  if (newPrefix.length > 10) {
    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [
        buildPanel('> Le prefix est trop long. Utilise 10 caractères maximum'),
      ],
    });
  }

  if (/\s/.test(newPrefix)) {
    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [
        buildPanel('> Le prefix ne doit pas contenir d espace'),
      ],
    });
  }

  await bot.db.prepare('UPDATE guilds SET prefix = ? WHERE id = ?')
    .run(newPrefix, message.guild.id);

  return message.reply({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [
      buildPanel(`> Prefix mis à jour pour ce serveur\n> Nouveau prefix : \`${newPrefix}\``),
    ],
  });
};
