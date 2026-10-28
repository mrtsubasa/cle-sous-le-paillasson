const Discord = require('discord.js');

exports.help = {
  name: 'bringcc',
  aliases: [],
  type: 'sys',
  description: 'Déplace tous les membres d’un salon vocal ou conférence vers des salons vocaux aleatoire d’une catégorie',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  if (!args[0] || !args[1]) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Veuillez fournir un salon source et une catégorie cible !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const sourceChannel = message.guild.channels.cache.get(args[0]);
  const targetCategory = message.guild.channels.cache.get(args[1]);

  if (!sourceChannel || ![Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice].includes(sourceChannel.type)) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Salon source invalide !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  if (!targetCategory || targetCategory.type !== Discord.ChannelType.GuildCategory) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Catégorie cible invalide !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const members = Array.from(sourceChannel.members.values());
  if (members.length === 0) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Aucun membre à déplacer dans le salon source !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const targetVoiceChannels = message.guild.channels.cache
    .filter(
      c => c.parentId === targetCategory.id &&
      c.type === Discord.ChannelType.GuildVoice 
    )
    .map(c => c);

  if (targetVoiceChannels.length === 0) {
    const bite = new Discord.ContainerBuilder()
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
      .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('> Aucun salon vocal classique dans la catégorie cible !'))
      .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));
    return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [bite], allowedMentions: { parse: [] } });
  }

  const preMessage = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> Tout les ${members.length} membre présents dans <#${sourceChannel.id}> vont être déplacés vers des salons vocaux aleatoire dans <#${targetCategory.id}>`
      )
    )
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

  await message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [preMessage], allowedMentions: { parse: [] } });

  const start = Date.now();
  let movedCount = 0;
  const shuffledChannels = targetVoiceChannels.sort(() => Math.random() - 0.5);

  for (let i = 0; i < members.length; i++) {
    const member = members[i];
    const targetChannel = shuffledChannels[i % shuffledChannels.length];
    try {
      await member.voice.setChannel(targetChannel);
      movedCount++;
    } catch (err) {
      console.error(`Impossible de déplacer ${member.user.tag}:`, err);
    }
  }

  const end = Date.now();
  const timeInSec = ((end - start) / 1000).toFixed(2);

  const confirm = new Discord.ContainerBuilder()
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent(
      `> ${movedCount} membre déplacés avec succès vers des salons vocaux classiques dans <#${targetCategory.id}> (Temps réel ~ ${timeInSec} sec)`
    ))
    .addSeparatorComponents(new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true));

  return message.reply({ flags: Discord.MessageFlags.IsComponentsV2, components: [confirm], allowedMentions: { parse: [] } });
};