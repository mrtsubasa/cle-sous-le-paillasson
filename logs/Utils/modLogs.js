const Discord = require('discord.js');
const { getModLogTarget } = require('./logsGuildConfig');

const MOD_LOG_META = {
  to: {
    icon: '🔨',
    title: "TO d'un utilisateur",
  },
  unto: {
    icon: '🔓',
    title: "UNTO d'un utilisateur",
  },
  kick: {
    icon: '🧑‍⚖️',
    title: "Expulsion d'un utilisateur",
  },
  ban: {
    icon: '🔨',
    title: "Bannissement d'un utilisateur",
  },
  unban: {
    icon: '✅',
    title: "Débannissement d'un utilisateur",
  },
};

function cleanInline(value, fallback = 'Aucune') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildModLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = MOD_LOG_META[action] || MOD_LOG_META.to;
  const reason = cleanInline(data.reason);
  const timeLine = data.timeText ? `\n\n> Temps : ${data.timeText}` : '';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Cible :\n  - ${formatUserWithId(data.target)}\n\n`
        + `> Raison : \`${reason}\`${timeLine}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendModLog(bot, sourceGuildId, action, data) {
  const target = getModLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildModLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log modération ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendModLog,
};
