const Discord = require('discord.js');
const {
  ContainerBuilder,
  SectionBuilder,
  TextDisplayBuilder,
  SeparatorBuilder,
  SeparatorSpacingSize,
  ThumbnailBuilder,
  MessageFlags
} = Discord;

exports.help = {
  name: 'emoji',
  aliases: ['e'],
  type: 'wl',
  description: 'Crée plusieurs emojis sur le serveur',
};

exports.run = async (bot, message, args) => {
  if (!bot.functions.checkPerm(bot, message, 'wl')) return;
  const guild = message.guild;
  if (!guild) return message.reply("> Commande utilisable uniquement en serveur");

  if (!message.member.permissions.has(Discord.PermissionsBitField.Flags.ManageEmojisAndStickers)) {
    return message.reply("> Vous n'avez pas la permission de gérer les emojis !");
  }

  if (!args.length) return message.reply("> Veuillez fournir au moins un emoji");

  const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

  const createEmojiWithRetry = async (emojiName, emojiURL) => {
    const maxAttempts = 2;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        return await guild.emojis.create({
          name: emojiName,
          attachment: emojiURL
        });
      } catch (err) {
        const retryAfter = Number(err?.retry_after || err?.data?.retry_after || 0);
        const shouldRetry = err?.status === 429 || err?.code === 429 || retryAfter > 0;

        if (!shouldRetry || attempt === maxAttempts) {
          throw err;
        }

        await sleep(Math.ceil(retryAfter * 1000) || 1500);
      }
    }

    return null;
  };

  const container = new ContainerBuilder();
  container.addTextDisplayComponents(
    new TextDisplayBuilder().setContent(`# Création des emojis`)
  );

  for (const input of args) {
    const match = input.match(/<a?:(\w+):(\d+)>/);
    if (!match) {
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`> Ignoré : ${input} n'est pas un emoji valide`)
      );
      continue;
    }

    const emojiName = match[1];
    const emojiId = match[2];
    const animated = input.startsWith('<a:');
    const emojiURL = `https://cdn.discordapp.com/emojis/${emojiId}.${animated ? 'gif' : 'png'}`;

    try {
      const createdEmoji = await createEmojiWithRetry(emojiName, emojiURL);

      const section = new SectionBuilder()
        .setThumbnailAccessory(
          new ThumbnailBuilder({
            media: { url: createdEmoji.imageURL({ size: 128, extension: animated ? 'gif' : 'png' }) }
          })
        )
        .addTextDisplayComponents(
          new TextDisplayBuilder().setContent(
            `> Nom : **${createdEmoji.name}**\n` +
            `> ID : \`${createdEmoji.id}\`\n` +
            `> Emoji : <:${createdEmoji.name}:${createdEmoji.id}>`
          )
        );

      container.addSectionComponents(section);
      container.addSeparatorComponents(
        new SeparatorBuilder()
          .setSpacing(SeparatorSpacingSize.Small)
          .setDivider(true)
      );
      await sleep(1200);

    } catch (err) {
      console.error(err);
      if (err?.code === 30008) {
        container.addTextDisplayComponents(
          new TextDisplayBuilder().setContent(`> Limite d'emojis atteinte sur le serveur, arrêt de la création.`)
        );
        break;
      }
      container.addTextDisplayComponents(
        new TextDisplayBuilder().setContent(`> Impossible de créer l'emoji : ${emojiName}`)
      );
      await sleep(1200);
    }
  }

  await message.reply({
    flags: MessageFlags.IsComponentsV2,
    components: [container],
  });
};
