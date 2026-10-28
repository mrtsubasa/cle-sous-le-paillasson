const Discord = require('discord.js');
const { getTypingLogTarget } = require('./logsGuildConfig');

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatChannel(channel) {
  return channel?.id ? `<#${channel.id}> (\`${cleanInline(channel.name, 'Salon inconnu')}\`)` : 'Salon inconnu';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildTypingLog(typing) {
  const timestamp = Math.floor(Date.now() / 1000);
  const startedAt = typing.startedTimestamp
    ? `<t:${Math.floor(typing.startedTimestamp / 1000)}:f>`
    : `<t:${timestamp}:f>`;

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `⌨️ **Utilisateur en train d'écrire !**\n\n`
        + `- Utilisateur :\n  - ${formatUserWithId(typing.user)}\n\n`
        + `- Salon :\n  - ${formatChannel(typing.channel)}\n\n`
        + `- Début : ${startedAt}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendTypingLog(bot, sourceGuildId, typing) {
  const target = getTypingLogTarget(bot, sourceGuildId, 'start');
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildTypingLog(typing)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log typingStart : ${error?.message || error}`);
  });
}

module.exports = {
  sendTypingLog,
};
