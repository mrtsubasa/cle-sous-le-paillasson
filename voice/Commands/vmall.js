const Discord = require('discord.js');

exports.help = {
  name: 'vmall',
  aliases: [],
  type: 'sys',
  description: 'Déplace tous les membres d’un salon vocal vers un autre',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  if (!args[0] || !args[1]) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Veuillez indiquer le salon source et le salon cible !')
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

  const sourceChannel =
    message.guild.channels.cache.get(args[0]) ||
    message.mentions.channels.first();
  const targetChannel =
    message.guild.channels.cache.get(args[1]) ||
    message.mentions.channels[1]; 

  if (!sourceChannel || sourceChannel.type !== Discord.ChannelType.GuildVoice) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Salon source invalide !')
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

  if (!targetChannel || targetChannel.type !== Discord.ChannelType.GuildVoice) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Salon cible invalide !')
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

  const members = sourceChannel.members;

  if (members.size === 0) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Aucun membre à déplacer dans ce salon !')
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

  let movedCount = 0;
  for (const [id, member] of members) {
    try {
      await member.voice.setChannel(targetChannel);
      movedCount++;
    } catch (err) {
      console.error(`Impossible de déplacer ${member.user.tag}:`, err);
    }
  }

  const bite = new Discord.ContainerBuilder()
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ${movedCount} membre ont été déplacés de <#${sourceChannel.id}> vers <#${targetChannel.id}>`
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
};