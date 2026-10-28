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
  name: 'server-pic',
  aliases: ['guild-pic', 'server-icon'],
  type: 'everyone',
  description: 'Affiche la photo du serveur',
};

exports.run = async (bot, message, args) => {
  const guild = message.guild;

  if (!guild.icon) return message.reply("> Ce serveur n'a pas d'icône");

  const iconURL = guild.iconURL({ extension: 'png', size: 1024, forceStatic: false });

  const gallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(iconURL)
  );

  const panel = new ContainerBuilder()
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${guild.name}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  await message.reply({ flags: MessageFlags.IsComponentsV2, components: [panel] });
};