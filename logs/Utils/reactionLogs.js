const Discord = require('discord.js');
const { getReactionLogTarget } = require('./logsGuildConfig');

const REACTION_LOG_META = {
  add: { icon: '✅', title: 'Réaction ajoutée' },
  remove: { icon: '<:ee:1434328162426294436>', title: 'Réaction retirée' },
  remove_all: { icon: '🧹', title: 'Toutes les réactions retirées' },
  remove_emoji: { icon: '🧹', title: 'Réactions d’un emoji retirées' },
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function truncate(value, max = 450) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatChannel(channel) {
  return channel?.id ? `<#${channel.id}> (\`${cleanInline(channel.name, 'Salon inconnu')}\`)` : 'Salon inconnu';
}

function formatEmoji(emoji) {
  if (!emoji) return '`Emoji inconnu`';
  if (emoji.id) {
    const animated = emoji.animated ? 'a' : '';
    return `<${animated}:${emoji.name}:${emoji.id}> \`${cleanInline(emoji.name, 'emoji')}\` (\`${emoji.id}\`)`;
  }
  return `${emoji.name || emoji} (\`unicode\`)`;
}

function messageLink(message) {
  return message?.url || (message?.guildId && message?.channelId && message?.id
    ? `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`
    : null);
}

function messageContent(message) {
  const content = message?.content || '';
  if (content) return truncate(content);
  if (message?.partial) return 'Message partiel, contenu indisponible.';
  return 'Aucun contenu texte.';
}

function reactionCount(reaction) {
  return reaction?.count ?? (reaction?.me ? 1 : 'inconnu');
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildReactionLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = REACTION_LOG_META[action] || REACTION_LOG_META.add;
  const message = data.message || data.reaction?.message;
  const link = messageLink(message);

  const userLine = action === 'remove_all' || action === 'remove_emoji'
    ? ''
    : `- Utilisateur :\n  - ${formatUserWithId(data.user)}\n\n`;

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + userLine
        + `- Emoji :\n  - ${formatEmoji(data.emoji || data.reaction?.emoji)}\n\n`
        + `- Message :\n`
        + `  - ID : \`${message?.id || 'inconnu'}\`\n`
        + `  - Salon : ${formatChannel(message?.channel)}\n`
        + `  - Lien : ${link ? `[ouvrir le message](${link})` : '`indisponible`'}\n`
        + `  - Réactions : \`${data.count ?? reactionCount(data.reaction)}\`\n`
        + `  - Contenu :\n\`\`\`\n${messageContent(message)}\n\`\`\``,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendReactionLog(bot, sourceGuildId, action, data) {
  const target = getReactionLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildReactionLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log reaction ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendReactionLog,
};
