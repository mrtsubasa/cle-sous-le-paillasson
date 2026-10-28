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
  name: 'banner',
  aliases: ["b"],
  type: 'everyone',
  description: 'Affiche la bannière d’un utilisateur',
};

exports.run = async (bot, message, args) => {
  let target;


  if (message.mentions.users.first()) target = message.mentions.users.first();

  else if (args[0] && /^\d+$/.test(args[0])) {
    target = await bot.users.fetch(args[0]).catch(() => null);
    if (!target) return message.reply("> Aucun utilisateur trouvé avec cet ID");
  } 

  else target = message.author;

  try { target = await target.fetch(); } 
  catch { return message.reply("> Impossible de récupérer cet utilisateur"); }

  const bannerURL = target.bannerURL({ extension: 'png', size: 1024, forceStatic: false });
  if (!bannerURL) return message.reply("> Cet utilisateur n'a pas de bannière");

  const gallery = new MediaGalleryBuilder().addItems(
    new MediaGalleryItemBuilder().setURL(bannerURL)
  );

  const panel = new ContainerBuilder()
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`# ${target.username}`))
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true))
    .addMediaGalleryComponents(gallery)
    .addSeparatorComponents(new SeparatorBuilder().setSpacing(SeparatorSpacingSize.Small).setDivider(true));

  await message.reply({ flags: MessageFlags.IsComponentsV2, components: [panel] });
};