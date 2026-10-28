const { data } = require('../utils/state');
const { hasPermissionForCommand, isSystem, isBotOwner } = require('../utils/permissions');

function getOtherConfig(guildId) {
  if (!data.otherConfig[guildId]) {
    data.otherConfig[guildId] = {
      banRoles: {},
      hideCategories: [],
      hideChannels: [],
      hideProtected: []
    };
  }

  const cfg = data.otherConfig[guildId];
  if (!Array.isArray(cfg.hideCategories)) cfg.hideCategories = [];
  if (!Array.isArray(cfg.hideChannels)) cfg.hideChannels = [];
  if (!Array.isArray(cfg.hideProtected)) cfg.hideProtected = [];
  return cfg;
}

function resolveCategory(guild, raw) {
  const id = String(raw || '').replace(/\D/g, '');
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  if (!ch) return null;
  if (ch.type !== 4) return null;
  return ch;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  name: 'unhide',
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'unhide')) {
  return message.channel.send({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guildId = String(message.guild.id);
  const cfg = getOtherConfig(guildId);
  const isSysMember = isSystem(guildId, message.author.id, message.member);
  const isBuyer = isBotOwner(message.author.id);

  const category = resolveCategory(message.guild, args && args[0]);
  if (category) {
  if (!isSysMember && !isBuyer) {
  return message.channel.send({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const everyoneId = message.guild.roles.everyone.id;
  const targets = message.guild.channels.cache
  .filter((ch) => ch.parentId === category.id && ch.type !== 4);

  for (const ch of targets.values()) {
  try {
  await ch.permissionOverwrites.edit(everyoneId, { ViewChannel: null });
  } catch {
  }
  await sleep(200);
  }

  return message.channel.send({
  content: `Les membres ont maintenant acc\u00e8s \u00e0 tous les salons de la cat\u00e9gorie <#${category.id}>`,
  allowedMentions: { parse: [] },
  mentionRepliedUser: false
  });
  }

  const channel = message.channel;
  const everyoneId = message.guild.roles.everyone.id;

  if (!isSysMember && !isBuyer) {
  const hasCategoryRules = cfg.hideCategories.length > 0;
  const hasChannelRules = cfg.hideChannels.length > 0;

  if (hasCategoryRules || hasChannelRules) {
  const parentId = channel.parentId || null;
  const allowedByCategory = parentId && cfg.hideCategories.includes(parentId);
  const allowedByChannel = cfg.hideChannels.includes(channel.id);
  if (!allowedByCategory && !allowedByChannel) {
  return message.channel.send({ content: "Ce salon n'est pas autoris\u00e9 pour le hide", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  }
  }

  try {
  await channel.permissionOverwrites.edit(everyoneId, { ViewChannel: null });
  } catch {
  return message.channel.send({ content: "Je n'ai pas la permission de rendre ce salon public", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } return message.channel.send({ content : `Les membres ont maintenant acc\u00e8s au salon <#${channel.id}>`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};


