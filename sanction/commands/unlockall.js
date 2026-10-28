const { isBotOwner } = require('../utils/permissions');
const { data, saveOtherConfig } = require('../utils/state');

function ensureConfig(guildId) {
  if (!data.otherConfig[guildId]) data.otherConfig[guildId] = {};
  const cfg = data.otherConfig[guildId];
  if (!Array.isArray(cfg.lockAllChannels)) cfg.lockAllChannels = [];
  return cfg;
}

function isVoiceChannel(ch) {
  if (!ch) return false;
  if (typeof ch.isVoiceBased === 'function') return ch.isVoiceBased();
  return ch.type === 2 || ch.type === 13;
}

function getUnlockOverwrites(channel) {
  if (isVoiceChannel(channel)) {
  return { Connect: null };
  } return { SendMessages : null };
}

module.exports = {
  name: 'unlockall',
  async executePrefix(message) {
  if (!isBotOwner(message.author.id)) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false }); } const guild = message.guild; const cfg = ensureConfig(String(guild.id)); const everyoneId = guild.roles.everyone.id; const channelIds = Array.isArray(cfg.lockAllChannels) ? cfg.lockAllChannels : [];

  for (const channelId of channelIds) {
  const channel = guild.channels.cache.get(channelId);
  if (!channel || !channel.permissionOverwrites) continue;
  if (channel.type === 4) continue;
  if (channel.isThread && channel.isThread()) continue;

  try {
  await channel.permissionOverwrites.edit(everyoneId, getUnlockOverwrites(channel));
  } catch {
  }
  }

  cfg.lockAllChannels = [];
  saveOtherConfig();

  return message.reply({ content: 'Tous les salons du serveur ont \u00e9t\u00e9 d\u00e9verrouill\u00e9s', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};

