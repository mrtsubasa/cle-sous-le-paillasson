const Discord = require('discord.js');
const {
  ContainerBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  MediaGalleryBuilder,
  MediaGalleryItemBuilder,
  MessageFlags
} = Discord;

exports.help = {
  name: 'server-banner',
  aliases: ['guild-banner'],
  type: 'everyone',
  description: 'Affiche la bannière du serveur',
};

exports.run = async (bot, message, args) => {
  const guild = message.guild;

  if (!guild.banner) return message.reply("> Ce serveur n'a pas de bannière");

  const bannerURL = guild.bannerURL({ extension: 'png', size: 1024, forceStatic: false });

  const gallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(bannerURL)
  );

  const panel = new ContainerBuilder()
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${guild.name}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  await message.reply({ flags: MessageFlags.IsComponentsV2, components: [panel] });
};