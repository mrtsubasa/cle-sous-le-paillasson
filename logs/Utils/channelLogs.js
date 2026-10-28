const Discord = require('discord.js');
const { getChannelLogTarget } = require('./logsGuildConfig');

const CHANNEL_LOG_META = {
  create: {
    icon: '✅',
    title: 'Salon créé',
  },
  delete: {
    icon: '<:ee:1434328162426294436>',
    title: 'Salon supprimé',
  },
  update: {
    icon: '📝',
    title: 'Salon modifié',
  },
};

const CHANNEL_TYPE_NAMES = {
  [Discord.ChannelType.GuildText]: 'Textuel',
  [Discord.ChannelType.GuildVoice]: 'Vocal',
  [Discord.ChannelType.GuildCategory]: 'Catégorie',
  [Discord.ChannelType.GuildAnnouncement]: 'Annonce',
  [Discord.ChannelType.AnnouncementThread]: 'Thread annonce',
  [Discord.ChannelType.PublicThread]: 'Thread public',
  [Discord.ChannelType.PrivateThread]: 'Thread privé',
  [Discord.ChannelType.GuildStageVoice]: 'Stage',
  [Discord.ChannelType.GuildForum]: 'Forum',
  [Discord.ChannelType.GuildMedia]: 'Média',
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function channelName(channel) {
  return cleanInline(channel?.name, 'Salon inconnu');
}

function channelType(channel) {
  return CHANNEL_TYPE_NAMES[channel?.type] || `Type ${channel?.type ?? 'inconnu'}`;
}

function channelParent(channel) {
  return channel?.parent?.name || channel?.parentId || 'Aucune';
}

function channelInfo(channel, allowMention = true) {
  const mention = allowMention && channel?.id && channel?.type !== Discord.ChannelType.GuildCategory
    ? `  - Mention : <#${channel.id}>\n`
    : '';

  return mention
    + `  - Nom : \`${channelName(channel)}\`\n`
    + `  - ID : \`${channel?.id || 'inconnu'}\`\n`
    + `  - Type : \`${channelType(channel)}\`\n`
    + `  - Catégorie : \`${cleanInline(channelParent(channel))}\`\n`
    + `  - Position : \`${channel?.position ?? 'inconnue'}\``;
}

function slowmode(channel) {
  return Number(channel?.rateLimitPerUser || 0);
}

function nsfw(channel) {
  return Boolean(channel?.nsfw);
}

function topic(channel) {
  return cleanInline(channel?.topic, 'Aucun');
}

function getChanges(oldChannel, newChannel) {
  const changes = [];

  if (oldChannel.name !== newChannel.name) {
    changes.push(`  - Nom : \`${channelName(oldChannel)}\` -> \`${channelName(newChannel)}\``);
  }

  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push(`  - Catégorie : \`${cleanInline(channelParent(oldChannel))}\` -> \`${cleanInline(channelParent(newChannel))}\``);
  }

  if (topic(oldChannel) !== topic(newChannel)) {
    changes.push(`  - Sujet : \`${topic(oldChannel)}\` -> \`${topic(newChannel)}\``);
  }

  if (slowmode(oldChannel) !== slowmode(newChannel)) {
    changes.push(`  - Slowmode : \`${slowmode(oldChannel)}s\` -> \`${slowmode(newChannel)}s\``);
  }

  if (nsfw(oldChannel) !== nsfw(newChannel)) {
    changes.push(`  - NSFW : \`${nsfw(oldChannel) ? 'Oui' : 'Non'}\` -> \`${nsfw(newChannel) ? 'Oui' : 'Non'}\``);
  }

  if (oldChannel.bitrate !== newChannel.bitrate) {
    changes.push(`  - Bitrate : \`${oldChannel.bitrate || 'Aucun'}\` -> \`${newChannel.bitrate || 'Aucun'}\``);
  }

  if (oldChannel.userLimit !== newChannel.userLimit) {
    changes.push(`  - Limite vocal : \`${oldChannel.userLimit || 'Aucune'}\` -> \`${newChannel.userLimit || 'Aucune'}\``);
  }

  return changes.length ? changes.join('\n') : '  - Aucun changement détecté';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildChannelLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = CHANNEL_LOG_META[action] || CHANNEL_LOG_META.update;
  const allowMention = action !== 'delete';
  const changes = action === 'update' ? `\n\n- Changements :\n${getChanges(data.oldChannel, data.channel)}` : '';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Salon :\n${channelInfo(data.channel, allowMention)}${changes}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendChannelLog(bot, sourceGuildId, action, data) {
  const target = getChannelLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildChannelLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log salon ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendChannelLog,
};
