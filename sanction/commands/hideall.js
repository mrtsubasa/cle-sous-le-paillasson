const { isBotOwner } = require('../utils/permissions');
const { data, saveOtherConfig } = require('../utils/state');

function ensureConfig(guildId) {
  if (!data.otherConfig[guildId]) data.otherConfig[guildId] = {};
  const cfg = data.otherConfig[guildId];
  if (!Array.isArray(cfg.hideAllChannels)) cfg.hideAllChannels = [];
  return cfg;
}

module.exports = {
  name: 'hideall',
  async executePrefix(message) {
  if (!isBotOwner(message.author.id)) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guild = message.guild;
  const cfg = ensureConfig(String(guild.id));
  const everyoneId = guild.roles.everyone.id;
  const hiddenIds = [];

  for (const channel of guild.channels.cache.values()) {
  if (!channel || !channel.permissionOverwrites) continue;
  if (channel.isThread && channel.isThread()) continue;

  const overwrite = channel.permissionOverwrites.cache.get(everyoneId);
  const alreadyHidden = overwrite && overwrite.deny.has('ViewChannel');
  if (alreadyHidden) continue;

  try {
  await channel.permissionOverwrites.edit(everyoneId, {
  ViewChannel: false
  });
  hiddenIds.push(channel.id);
  } catch {
  }
  }

  cfg.hideAllChannels = hiddenIds;
  saveOtherConfig();

  return message.reply({ content: 'Tous les salons du serveur ont \u00e9t\u00e9 masqu\u00e9s', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};

