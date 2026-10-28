const Discord = require('discord.js');
const { getEmojiLogTarget } = require('./logsGuildConfig');

const EMOJI_LOG_META = {
  create: {
    title: 'Emoji créé',
  },
  delete: {
    title: 'Emoji supprimé',
  },
  update: {
    title: 'Emoji modifié',
  },
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (${user.id})` : 'Utilisateur inconnu (inconnu)';
}

function emojiImageUrl(emoji) {
  if (!emoji?.id) return null;
  if (typeof emoji.imageURL === 'function') {
    return emoji.imageURL({
      extension: emoji.animated ? 'gif' : 'png',
      size: 256,
    });
  }

  return `https://cdn.discordapp.com/emojis/${emoji.id}.${emoji.animated ? 'gif' : 'png'}?size=256&quality=lossless`;
}

function emojiPreview(emoji) {
  if (!emoji?.id) return 'Emoji inconnu';
  return emoji.animated ? `<a:${emoji.name}:${emoji.id}>` : `<:${emoji.name}:${emoji.id}>`;
}

function buildChanges(data) {
  if (data.oldEmoji?.name !== data.emoji?.name) {
    return `\n\n- Changements :\n  - Avant : \`${cleanInline(data.oldEmoji?.name)}\`\n  - Après : \`${cleanInline(data.emoji?.name)}\``;
  }

  return '\n\n- Changements :\n  - Aucun changement détecté';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildEmojiLog(action, data) {
  const meta = EMOJI_LOG_META[action] || EMOJI_LOG_META.update;
  const imageUrl = emojiImageUrl(data.emoji);
  const timestamp = Math.floor(Date.now() / 1000);
  const changes = action === 'update' ? buildChanges(data) : '';
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `**${meta.title} !**`,
      ),
    );

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new Discord.MediaGalleryBuilder().addItems(
        new Discord.MediaGalleryItemBuilder().setURL(imageUrl),
      ),
    );
  }

  return container
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Emoji :\n`
        + `  - Nom : \`${cleanInline(data.emoji?.name, 'Emoji inconnu')}\`\n`
        + `  - ID : \`${data.emoji?.id || 'inconnu'}\`\n`
        + `  - Animé : \`${data.emoji?.animated ? 'Oui' : 'Non'}\`\n`
        + `  - Aperçu : ${emojiPreview(data.emoji)}${changes}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendEmojiLog(bot, sourceGuildId, action, data) {
  const target = getEmojiLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildEmojiLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log emoji ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendEmojiLog,
};
