const Discord = require('discord.js');
const { 
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  ThumbnailBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MessageFlags
} = require('discord.js');

exports.help = {
  name: 'vc',
  aliases: [],
  type: 'wl',
  description: 'Afficher les stats du serveur',
};

exports.run = async (bot, message, args, config) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;

  if (message.deletable) message.delete().catch(() => {});

  const guild = message.guild;

  if (guild.members.cache.size < (guild.memberCount * 0.9)) {
    try {
      await guild.members.fetch({ withPresences: true });
    } catch (e) {
      console.log("Erreur de fetch (Rate limit probable), utilisation du cache actuel");
    }
  }

  const members = guild.members.cache;
  const totalMembers = guild.memberCount;
  
  const onlineMembers = members.filter(m => m.presence && m.presence.status !== 'offline').size;
  const voiceMembersList = members.filter(m => m.voice && m.voice.channelId !== null);
  
  const voiceMembers = voiceMembersList.size;
  const streamingMembers = voiceMembersList.filter(m => m.voice.streaming).size;
  const muteMembers = voiceMembersList.filter(m => 
    m.voice.selfMute || m.voice.serverMute || m.voice.selfDeaf || m.voice.serverDeaf
  ).size;

  const boostCount = guild.premiumSubscriptionCount || 0;

  const icon = guild.iconURL({ size: 1024, forceStatic: false }) || 'https://i.imgur.com/839VA94.png';

  const section = new SectionBuilder()
    .setThumbnailAccessory(
      new ThumbnailBuilder({ media: { url: icon } })
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# Statistiques de ${guild.name}`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
`> Membres : \`${totalMembers}\`
> En ligne : \`${onlineMembers}\`
> En vocal : \`${voiceMembers}\`
> En stream : \`${streamingMembers}\`
> Mute : \`${muteMembers}\`
> Boosts : \`${boostCount}\``
      )
    );

  const container = new ContainerBuilder()
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    )
    .addSectionComponents(section)
    .addSeparatorComponents(
      new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true)
    );

  await message.channel.send({
    flags: MessageFlags.IsComponentsV2,
    components: [container]
  });
};