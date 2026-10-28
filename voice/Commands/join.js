const Discord = require('discord.js');

exports.help = {
  name: 'join',
  aliases: [],
  type: 'wl',
  description: 'Te déplace dans le salon vocal d’un utilisateur',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  if (!args[0]) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Veuillez mentionner un utilisateur ou mettre son ID !')
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { parse: [] }
    });
  }

  const member = message.mentions.members.first() || message.guild.members.cache.get(args[0]);

  if (!member || !member.voice.channel) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> L’utilisateur n’est pas en vocal ou introuvable !')
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { parse: [] }
    });
  }

  try {
    await message.member.voice.setChannel(member.voice.channel);

    const safeMention = `<@${member.id}>`;
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Vous avez rejoint le salon vocal de ${safeMention} dans <#${member.voice.channel.id}>`
        )
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { users: [], roles: [], parse: [] }
    });
  } catch (err) {
    console.error(err);
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Impossible de rejoindre le salon vocal de cet utilisateur !')
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { parse: [] }
    });
  }
};