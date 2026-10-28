const Discord = require('discord.js');

exports.help = {
  name: 'vocinfo',
  aliases: [],
  type: 'wl',
  description: 'Permet de voir les informations d’un salon vocal',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  let voiceChannel;
  if (args[0]) {
    voiceChannel =
      message.guild.channels.cache.get(args[0]) ||
      message.mentions.channels.first();
  } else {
    voiceChannel = message.member.voice.channel;
  }

  if (!voiceChannel || voiceChannel.type !== Discord.ChannelType.GuildVoice) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('> Veuillez spécifier un salon vocal valide !')
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

  const members = voiceChannel.members;

  const totalMembers = members.size;
  const onlineMembers = members.filter(m => m.presence && m.presence.status !== 'offline').size;
  const voiceMembers = members.filter(m => m.voice.channel).size;
  const streamingMembers = members.filter(m => m.voice.channel && m.voice.streaming).size;
  const muteMembers = members.filter(m => m.voice.serverMute || m.voice.selfMute).size;
  const videoMembers = members.filter(m => m.voice.video).size;
  const deafMembers = members.filter(m => m.voice.selfDeaf || m.voice.serverDeaf).size;

  const bite = new Discord.ContainerBuilder()
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    )
        .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
`# Statistiques de \`${voiceChannel.name}\``
      )
    )
        .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true)
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
`> Membres en vocal : **${voiceMembers}**
> Membres en vidéo : **${videoMembers}**
> Membres mute : **${muteMembers}**
> Membres en stream : **${streamingMembers}**
> Membres sourds : **${deafMembers}**`
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