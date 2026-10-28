const { data } = require('../utils/state');
const { hasPermissionForCommand, isSystem, isBotOwner } = require('../utils/permissions');

function getOtherConfig(guildId) {
  if (!data.otherConfig[guildId]) {
  data.otherConfig[guildId] = {
  banRoles: {},
  lockCategories: [],
  lockProtected: [],
  renewCategories: [],
  renewProtected: []
  };
  }
  return data.otherConfig[guildId];
}

module.exports = {
  name: 'renew',
  async executePrefix(message) {
  if (!hasPermissionForCommand(message.member, 'renew')) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guildId = String(message.guild.id);
  const cfg = getOtherConfig(guildId);
  const channel = message.channel;

  const isSysMember = isSystem(guildId, message.author.id, message.member);
  const isBuyer = isBotOwner(message.author.id);

  if (!isSysMember && !isBuyer) {
  if (cfg.renewProtected.includes(channel.id)) {
  return message.channel.send({ content: 'Ce salon est prot\u00e9g\u00e9, vous ne pouvez pas le renew', allowedMentions: { parse: [] } });
  }

  if (cfg.renewCategories.length > 0) {
  const parentId = channel.parentId || null;
  if (!parentId || !cfg.renewCategories.includes(parentId)) {
  return message.channel.send({ content: "Ce salon n'est pas dans une cat\u00e9gorie autoris\u00e9e", allowedMentions: { parse: [] } });
  }
  }
  }

  let cloned = null;
  try {
  cloned = await channel.clone({ reason: `Renew par ${message.author.tag}` });
  await cloned.setPosition(channel.position);
  } catch {
  return message.channel.send({ content: "Je n'ai pas la permission de renew ce salon", allowedMentions: { parse: [] } });
  } const notice = await cloned.send({ content : `${message.author} Le salon a bien \u00e9t\u00e9 renew`, allowedMentions: { users: [message.author.id] } });
  setTimeout(() => notice.delete().catch(() => {}), 10000);

  try {
  await channel.delete('Renew');
  } catch {
  }
  }
};



