const Discord = require('discord.js');

exports.help = {
  name: 'unlock',
  aliases: [],
  type: 'owner',
  description: 'Déverrouille un salon vocal',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  let channel = null;

  if (message.mentions.channels.first()) {
    channel = message.mentions.channels.first();
  }

  else if (args[0]) {
    channel = message.guild.channels.cache.get(args[0]);
  }

  else {
    if (!message.member.voice.channel) {
      const error = new Discord.ContainerBuilder()
        .addSeparatorComponents(
          new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
        )
        .addTextDisplayComponents(
          new Discord.TextDisplayBuilder().setContent(
            '> Vous devez être connecté à un salon vocal pour utiliser cette commande'
          )
        )
        .addSeparatorComponents(
          new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
        );

      return message.reply({
        flags: Discord.MessageFlags.IsComponentsV2,
        components: [error],
        allowedMentions: { parse: [] },
      });
    }

    channel = message.member.voice.channel;
  }

  if (!channel || ![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(channel.type)) {
    const error = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Salon vocal invalide !')
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [error],
      allowedMentions: { parse: [] },
    });
  }

  const everyoneOverwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);

  if (!everyoneOverwrite || !everyoneOverwrite.deny.has(Discord.PermissionFlagsBits.Connect)) {
    const already = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Le salon vocal <#${channel.id}> est déjà unlock`
        )
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [already],
      allowedMentions: { parse: [] },
    });
  }

  try {
    await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
      Connect: null,
    });

    const confirm = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `> Le salon vocal <#${channel.id}> est maintenant unlock`
        )
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [confirm],
      allowedMentions: { parse: [] },
    });

  } catch (err) {
    console.error(err);

    const error = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          '> Impossible de unlock le salon'
        )
      )
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      );

    return message.reply({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [error],
      allowedMentions: { parse: [] },
    });
  }
};