const Discord = require('discord.js');
const { getStickerLogTarget } = require('./logsGuildConfig');

const STICKER_LOG_META = {
  create: {
    title: 'Sticker créé',
  },
  delete: {
    title: 'Sticker supprimé',
  },
  update: {
    title: 'Sticker modifié',
  },
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (${user.id})` : 'Utilisateur inconnu (inconnu)';
}

function stickerImageUrl(sticker) {
  if (!sticker?.id) return null;
  if (sticker.format === Discord.StickerFormatType.Lottie || sticker.formatType === Discord.StickerFormatType.Lottie) {
    return null;
  }

  if (sticker.url) return sticker.url;
  return `https://media.discordapp.net/stickers/${sticker.id}.png?size=320`;
}

function stickerFormat(sticker) {
  const format = sticker?.formatType || sticker?.format;
  if (Discord.StickerFormatType[format]) return Discord.StickerFormatType[format];
  if (typeof format === 'string') return format;
  return 'inconnu';
}

function buildChanges(data) {
  const changes = [];
  const oldTags = cleanInline(data.oldSticker?.tags);
  const newTags = cleanInline(data.sticker?.tags);
  const oldDescription = cleanInline(data.oldSticker?.description);
  const newDescription = cleanInline(data.sticker?.description);

  if (data.oldSticker?.name !== data.sticker?.name) {
    changes.push(`  - Nom : \`${cleanInline(data.oldSticker?.name)}\` -> \`${cleanInline(data.sticker?.name)}\``);
  }

  if (oldDescription !== newDescription) {
    changes.push(`  - Description : \`${oldDescription}\` -> \`${newDescription}\``);
  }

  if (oldTags !== newTags) {
    changes.push(`  - Tags : \`${oldTags}\` -> \`${newTags}\``);
  }

  if (!changes.length) {
    return '\n\n- Changements :\n  - Aucun changement détecté';
  }

  return `\n\n- Changements :\n${changes.join('\n')}`;
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildStickerLog(action, data) {
  const meta = STICKER_LOG_META[action] || STICKER_LOG_META.update;
  const imageUrl = stickerImageUrl(data.sticker);
  const timestamp = Math.floor(Date.now() / 1000);
  const changes = action === 'update' ? buildChanges(data) : '';
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`**${meta.title} !**`),
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
        + `- Sticker :\n`
        + `  - Nom : \`${cleanInline(data.sticker?.name, 'Sticker inconnu')}\`\n`
        + `  - ID : \`${data.sticker?.id || 'inconnu'}\`\n`
        + `  - Description : \`${cleanInline(data.sticker?.description)}\`\n`
        + `  - Tags : \`${cleanInline(data.sticker?.tags)}\`\n`
        + `  - Format : \`${cleanInline(stickerFormat(data.sticker))}\`${changes}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendStickerLog(bot, sourceGuildId, action, data) {
  const target = getStickerLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildStickerLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log sticker ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendStickerLog,
};
