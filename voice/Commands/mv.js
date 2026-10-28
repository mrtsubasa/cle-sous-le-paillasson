const Discord = require('discord.js');

exports.help = {
  name: 'mv',
  aliases: ['move'],
  type: 'owner',
  description: 'Déplace un membre dans ton salon vocal',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  if (!args[0]) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Veuillez mentionner un membre ou fournir son ID !')
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

  const member =
    message.mentions.members.first() ||
    message.guild.members.cache.get(args[0]);

  if (!member) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Membre introuvable dans ce serveur !')
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

  const authorVoiceChannel = message.member.voice.channel;
  if (!authorVoiceChannel) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Vous devez être dans un salon vocal pour utiliser cette commande !')
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

  if (!member.voice.channel) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Le membre n\'est pas dans un salon vocal !')
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
    await member.voice.setChannel(authorVoiceChannel);

    const safeMention = `<@${member.id}>`;
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> ${safeMention} a été déplacé dans <#${authorVoiceChannel.id}>`
        )
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [bite],
      allowedMentions: { parse: [] } 
    });
  } catch (err) {
    console.error(err);
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Impossible de déplacer ce membre')
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