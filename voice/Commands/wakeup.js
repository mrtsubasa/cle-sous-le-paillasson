const Discord = require('discord.js');

exports.help = {
  name: 'wakeup',
  aliases: [],
  type: 'owner',
  description: 'Déplace un membre aléatoirement plusieurs fois puis le remet dans son salon d’origine, s’arrête si le membre quitte le vocal',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'owner')) return;

  const memberArg = args[0];
  const iterations = parseInt(args[1]) || 5;

  if (!memberArg || !iterations) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Usage : `wakeup <membre> <nombre de déplacements>`'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const member = message.mentions.members.first() || message.guild.members.cache.get(memberArg);
  if (!member || !member.voice.channel) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Membre invalide ou pas en vocal !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const originalChannel = member.voice.channel;

  const allVoiceChannels = message.guild.channels.cache
    .filter(c => c.type === Discord.ChannelType.GuildVoice)
    .map(c => c);

  if (allVoiceChannels.length === 0) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Aucun salon vocal disponible dans le serveur !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const preMessage = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(
      `> ${member.user.tag} sera déplacé ${iterations} fois aléatoirement dans tous les salons vocaux du serveur puis remis dans <#${originalChannel.id}>`
    ))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

  await message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [preMessage], allowedMentions: { parse: [] } });

  const wait = ms => new Promise(res => setTimeout(res, ms));
  const start = Date.now();
  let movedCount = 0;

  for (let i = 0; i < iterations; i++) {
    if (!member.voice.channel) {
      const stopMessage = new Discord.ContainerBuilder()
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
        .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(
          `> ${member.user.tag} a quitté le salon vocal Wakeup interrompu après ${movedCount} déplacements`
        ))
        .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
      return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [stopMessage], allowedMentions: { parse: [] } });
    }

    const randomChannel = allVoiceChannels[Math.floor(Math.random() * allVoiceChannels.length)];
    if (member.voice.channelId === randomChannel.id) continue;
    try {
      await member.voice.setChannel(randomChannel);
      movedCount++;
    } catch (err) {
      console.error(`Impossible de déplacer ${member.user.tag}:`, err);
    }
    await wait(750);
  }

  if (member.voice.channel) {
    try {
      await member.voice.setChannel(originalChannel);
    } catch (err) {
      console.error(`Impossible de remettre ${member.user.tag} dans son salon d'origine:`, err);
    }
  }


  const confirm = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(
      `> ${member.user.tag} a été déplacé ${movedCount} fois aléatoirement puis remis dans <#${originalChannel.id}>`
    ))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

  return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [confirm], allowedMentions: { parse: [] } });
};