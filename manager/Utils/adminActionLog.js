const Discord = require('discord.js');
const buildPanel = require('./buildPanel');
const { getLogChannelId } = require('./logChannels');

function getAdminLogChannelId(kind = 'adminActionLogs', fallbackKinds = []) {
  const normalizedKind = kind || 'adminActionLogs';
  return getLogChannelId(normalizedKind, [
    ...fallbackKinds,
    'adminActionLogs',
    'botActionLogs',
    'logs',
  ]);
}

async function resolveAdminLogChannel(bot, kind, fallbackKinds = []) {
  const channelId = getAdminLogChannelId(kind, fallbackKinds);
  if (!channelId) return null;

  return bot.channels.cache.get(channelId) || bot.channels.fetch(channelId).catch(() => null);
}

async function sendAdminActionLog(bot, kind, title, lines = [], fallbackKinds = []) {
  const channel = await resolveAdminLogChannel(bot, kind, fallbackKinds);
  if (!channel) return false;

  try {
    await channel.send({
      components: [buildPanel(title, lines)],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2,
    });
    return true;
  } catch (error) {
    console.log(`[ADMIN LOG] Impossible d'envoyer le log "${title}": ${error.message}`);
    return false;
  }
}

module.exports = {
  getAdminLogChannelId,
  sendAdminActionLog,
};
