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
  name: 'uhq',
  aliases: [],
  type: 'sys',
  description: 'Afficher les stats du serveur',
};

exports.run = async (bot, message, args, config) => {
  if (!bot.functions.checkPerm(bot, message, 'sys')) return;

  const guild = message.guild;
  const members = guild.members.cache;

  const totalMembers = guild.memberCount.toLocaleString();
  const onlineMembers = members.filter(m => m.presence && m.presence.status !== 'offline').size.toLocaleString();
  const voiceMembers = members.filter(m => m.voice.channel).size.toLocaleString();
  const boostCount = guild.premiumSubscriptionCount.toLocaleString();

  const icon = guild.iconURL({ size: 64, dynamic: true }) || 'https://cdn.discordapp.com/attachments/1474430939210846300/1480585175413952604/433c3b9f406a8b57d9394de398405a5b.png?ex=69b035e5&is=69aee465&hm=a06ba5370192e572745f4763cc0a7bcf9e728ffbd1eb23a8fe73639041fd9cc4&';

  const section = new SectionBuilder()
    .setThumbnailAccessory(
      new ThumbnailBuilder({ media: { url: icon } })
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(`# __Statistiques de ${guild.name} 🏆__`)
    )
    .addTextDisplayComponents(
      new TextDisplayBuilder().setContent(
`> Membres : \`${totalMembers}\`
> En ligne : \`${onlineMembers}\`
> En vocal : \`${voiceMembers}\`
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