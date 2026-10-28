const Discord = require('discord.js');
const { getMessageLogTarget } = require('../Utils/logsGuildConfig');
const {
  addFileComponents,
  createMessageAttachmentFiles,
} = require('../Utils/messageFileLogs');

function cleanBlock(value) {
  const text = String(value || '').replace(/```/g, "'''").trim();
  return text || 'Aucun contenu disponible';
}

function cutBlock(value, max = 1700) {
  const text = cleanBlock(value);
  return text.length > max ? `${text.slice(0, max - 20)}\n... contenu coupe` : text;
}

function uniq(values) {
  return [...new Set(values.filter(Boolean))];
}

function extractUrls(text) {
  return String(text || '').match(/https?:\/\/[^\s<>()]+/gi) || [];
}

function getMessageLinks(message) {
  const links = [];

  for (const attachment of message.attachments?.values?.() || []) {
    links.push(attachment.url, attachment.proxyURL);
  }

  for (const sticker of message.stickers?.values?.() || []) {
    links.push(sticker.url);
  }

  for (const embed of message.embeds || []) {
    links.push(
      embed.url,
      embed.image?.url,
      embed.thumbnail?.url,
      embed.video?.url,
      embed.author?.url,
      embed.provider?.url,
      embed.footer?.iconURL,
      embed.author?.iconURL,
    );
  }

  links.push(...extractUrls(message.content));

  return uniq(links);
}

function formatChannel(channel) {
  return channel?.name ? `\`${channel.name}\`` : '`salon inconnu`';
}

function getMessageContent(message) {
  const links = getMessageLinks(message);
  const content = message.content || '';
  const extraLinks = links.filter((link) => !content.includes(link));
  const parts = [content, ...extraLinks].filter(Boolean);
  return parts.join('\n') || (message.partial ? 'Message partiel, contenu indisponible.' : 'Aucun contenu texte.');
}

function buildEditLog(oldMessage, newMessage, files = []) {
  const timestamp = Math.floor(Date.now() / 1000);
  const author = newMessage.author?.id ? `<@${newMessage.author.id}>` : 'Utilisateur inconnu';
  const channel = formatChannel(newMessage.channel);
  const beforeText = getMessageContent(oldMessage);
  const afterText = getMessageContent(newMessage);

  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `<:edit:1382304491805605969> ${author} a modifié son message dans ${channel}\n\n- Avant :\n\`\`\`\n${cutBlock(beforeText)}\n\`\`\`\n- Après :\n\`\`\`\n${cutBlock(afterText)}\n\`\`\``,
      ),
    );

  if (files.length) {
    container
      .addSeparatorComponents(
        new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
      )
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent('- Fichier(s) :'),
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

module.exports = {
  name: 'messageUpdate',
  async execute(oldMessage, newMessage, bot) {
    if (!newMessage?.guild || !newMessage.channel || newMessage.author?.bot) return;
    if (oldMessage?.content === newMessage?.content && oldMessage?.attachments?.size === newMessage?.attachments?.size) return;

    const target = getMessageLogTarget(bot, newMessage.guild.id, 'edit');
    if (!target) return;

    const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
      || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
    if (!destinationGuild) return;

    const logChannel = destinationGuild.channels.cache.get(target.channelId)
      || await destinationGuild.channels.fetch(target.channelId).catch(() => null);
    if (!logChannel?.isTextBased?.()) return;

    const files = await createMessageAttachmentFiles([oldMessage, newMessage], {
      prefix: `message-edit-${newMessage.id || Date.now()}`,
    });

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildEditLog(oldMessage, newMessage, files)],
      files: files.map((file) => file.attachment),
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Erreur log message edit : ${error?.message || error}`);
    });
  },
};
