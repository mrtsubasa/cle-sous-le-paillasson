const Discord = require('discord.js');
const { getMessageLogTarget } = require('../Utils/logsGuildConfig');
const {
  addFileComponents,
  createMessageAttachmentFiles,
} = require('../Utils/messageFileLogs');

function cleanBlock(value) {
  const text = String(value || '').replace(/```/g, "'''").trim();
  return text || 'Aucun contenu';
}

function cut(value, max = 180) {
  const text = cleanBlock(value);
  return text.length > max ? `${text.slice(0, max - 10)}...` : text;
}

function formatUser(user) {
  return user?.id ? `<@${user.id}>` : 'Utilisateur inconnu';
}

function formatChannel(channel) {
  return channel?.name ? `\`${channel.name}\`` : '`salon inconnu`';
}

function extractUrls(text) {
  return String(text || '').match(/https?:\/\/[^\s<>()]+/gi) || [];
}

function getLinks(message) {
  const links = [];

  for (const attachment of message.attachments?.values?.() || []) {
    links.push(attachment.url);
  }

  for (const sticker of message.stickers?.values?.() || []) {
    links.push(sticker.url);
  }

  for (const embed of message.embeds || []) {
    links.push(embed.url, embed.image?.url, embed.thumbnail?.url, embed.video?.url);
  }

  links.push(...extractUrls(message.content));
  return [...new Set(links.filter(Boolean))];
}

async function getBulkDeleteExecutor(guild, channelId, count) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.MessageBulkDelete,
    limit: 6,
  }).catch(() => null);

  const entry = logs?.entries?.find((auditEntry) => {
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    const sameChannel = !channelId || auditEntry.extra?.channel?.id === channelId || auditEntry.extra?.channelId === channelId;
    const sameCount = !count || !auditEntry.extra?.count || Math.abs(Number(auditEntry.extra.count) - count) <= 2;
    return isRecent && sameChannel && sameCount;
  });

  return entry?.executor || null;
}

function messageLine(message, index) {
  const author = formatUser(message.author);
  const content = message.content || '';
  const links = getLinks(message).filter((link) => !content.includes(link));
  const text = [content, ...links].filter(Boolean).join(' | ') || (message.partial ? 'Message partiel' : 'Aucun contenu');
  return `${index + 1}. ${author} : ${cut(text)}`;
}

function buildBulkDeleteLog(messages, executor, files = []) {
  const timestamp = Math.floor(Date.now() / 1000);
  const list = [...messages.values()];
  const first = list[0];
  const channel = formatChannel(first?.channel);
  const shown = list.slice(0, 10).map(messageLine).join('\n');
  const more = list.length > 10 ? `\n... +${list.length - 10} messages` : '';

  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `<:ee:1434328162426294436> **Suppression multiple de messages !**\n\n`
        + `- Auteur : ${formatUser(executor)}\n`
        + `- Salon : ${channel}\n`
        + `- Messages supprimés : \`${list.length}\`\n\n`
        + `- Aperçu :\n\`\`\`\n${cut(`${shown}${more}`, 1800)}\n\`\`\``,
      ),
    );

  if (files.length) {
    container
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('- Fichier(s) récupéré(s) :'),
      );
    addFileComponents(container, files);
  }

  return container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

module.exports = {
  name: 'messageDeleteBulk',
  async execute(messages, bot) {
    const first = messages?.first?.() || [...(messages?.values?.() || [])][0];
    if (!first?.guild || !first.channel) return;

    const target = getMessageLogTarget(bot, first.guild.id, 'bulk_delete');
    if (!target) return;

    const logChannel = await getLogChannel(bot, target);
    if (!logChannel) return;

    const executor = await getBulkDeleteExecutor(first.guild, first.channel.id, messages.size);

    const files = await createMessageAttachmentFiles([...messages.values()], {
      prefix: `message-bulk-delete-${first.id || Date.now()}`,
      limit: 8,
    });

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildBulkDeleteLog(messages, executor, files)],
      files: files.map((file) => file.attachment),
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Erreur log message bulk delete : ${error?.message || error}`);
    });
  },
};
