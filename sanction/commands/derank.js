const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

module.exports = {
  name: 'derank',
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'derank')) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const member = await resolveMember(message, args[0]);
  if (!member) {
  return message.reply({ content: 'Membre non trouv\u00e9', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const actor = message.member;
  if (member.roles.highest.position >= actor.roles.highest.position && message.author.id != message.guild.ownerId) {
  return message.reply({ content: 'Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const rolesToRemove = member.roles.cache
  .filter((role) => role.id != message.guild.id)
  .filter((role) => role.position < actor.roles.highest.position || message.author.id == message.guild.ownerId)
  .map((role) => role.id);

  try {
  await member.roles.remove(rolesToRemove, `Derank par ${message.author.tag}`);
  } catch {
  return message.reply({ content: "Je n'ai pas la permission de derank ce membre", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } return message.reply({ content : `${member} a \u00e9t\u00e9 derank`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};
