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

function isAlreadyLocked(channel, everyoneId) {
  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  if (!overwrite) return false;

  if (isVoiceChannel(channel)) {
  return overwrite.deny.has('Connect');
  }

  return overwrite.deny.has('SendMessages');
}

function getLockOverwrites(channel) {
  if (isVoiceChannel(channel)) {
  return { Connect: false };
  } return { SendMessages : false };
}

module.exports = {
  name: 'lockall',
  async executePrefix(message) {
  if (!isBotOwner(message.author.id)) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guild = message.guild;
  const cfg = ensureConfig(String(guild.id));
  const everyoneId = guild.roles.everyone.id;
  const lockedIds = [];

  for (const channel of guild.channels.cache.values()) {
  if (!channel || !channel.permissionOverwrites) continue;
  if (channel.type === 4) continue;
  if (channel.isThread && channel.isThread()) continue;

  if (isAlreadyLocked(channel, everyoneId)) continue;

  try {
  await channel.permissionOverwrites.edit(everyoneId, getLockOverwrites(channel));
  lockedIds.push(channel.id);
  } catch {
  }
  }

  cfg.lockAllChannels = lockedIds;
  saveOtherConfig();

  return message.reply({ content: 'Tous les salons du serveur ont \u00e9t\u00e9 verrouill\u00e9s', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};

