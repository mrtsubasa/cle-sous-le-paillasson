const { data } = require('../utils/state');
const { hasPermissionForCommand, isSystem, isBotOwner } = require('../utils/permissions');

function getOtherConfig(guildId) {
  if (!data.otherConfig[guildId]) {
  data.otherConfig[guildId] = {
  banRoles: {},
  lockCategories: [],
  lockChannels: [],
  lockProtected: [],
  renewCategories: [],
  renewProtected: []
  };
  }
  return data.otherConfig[guildId];
}

function resolveCategory(guild, raw) {
  const id = String(raw || '').replace(/\D/g, '');
  if (!id) return null;
  const ch = guild.channels.cache.get(id);
  if (!ch) return null;
  if (ch.type !== 4) return null;
  return ch;
}

function isVoiceChannel(ch) {
  if (!ch) return false;
  if (typeof ch.isVoiceBased === 'function') return ch.isVoiceBased();
  return ch.type === 2 || ch.type === 13;
}

function getLockOverwrites(ch, guild) {
  if (isVoiceChannel(ch)) {
  return { Connect: false };
  } return { SendMessages : false };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  name: 'lock',
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'lock')) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guildId = String(message.guild.id);
  const cfg = getOtherConfig(guildId);

  const isSysMember = isSystem(guildId, message.author.id, message.member);
  const isBuyer = isBotOwner(message.author.id);

  const category = resolveCategory(message.guild, args && args[0]);
  if (category) {
  if (!isSysMember && !isBuyer) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const targets = message.guild.channels.cache
  .filter((ch) => ch.parentId === category.id && ch.type !== 4);

  for (const ch of targets.values()) {
  try {
  await ch.permissionOverwrites.edit(message.guild.roles.everyone, getLockOverwrites(ch, message.guild));
  } catch {
  }
  await sleep(200);
  }

  return message.channel.send({
  content: `Tous les salons de la cat\u00e9gorie <#${category.id}> ont \u00e9t\u00e9 lock`,
  allowedMentions: { parse: [] }
  });
  }

  const channel = message.channel;

  if (!isSysMember && !isBuyer) {
  if (cfg.lockProtected.includes(channel.id)) {
  return message.channel.send({ content: 'Ce salon est prot\u00e9g\u00e9, vous ne pouvez pas le lock', allowedMentions: { parse: [] } });
  }

  const hasCategoryRules = cfg.lockCategories.length > 0;
  const hasChannelRules = cfg.lockChannels.length > 0;

  if (hasCategoryRules || hasChannelRules) {
  const parentId = channel.parentId || null;
  const allowedByCategory = parentId && cfg.lockCategories.includes(parentId);
  const allowedByChannel = cfg.lockChannels.includes(channel.id);
  if (!allowedByCategory && !allowedByChannel) {
  return message.channel.send({ content: "Ce salon n'est pas autoris\u00e9 pour le lock", allowedMentions: { parse: [] } });
  }
  }
  }

  try {
  await channel.permissionOverwrites.edit(message.guild.roles.everyone, getLockOverwrites(channel, message.guild));
  } catch {
  return message.channel.send({ content: "Je n'ai pas la permission de verrouiller ce salon", allowedMentions: { parse: [] } });
  }

  if (isVoiceChannel(channel)) {
  return message.channel.send({ content: `Les membres n'ont plus la permission de se connecter dans <#${channel.id}>`, allowedMentions: { parse: [] } });
  } return message.channel.send({ content : `Les membres n'ont plus la permission de parler dans <#${channel.id}>`, allowedMentions: { parse: [] } });
  }
};


