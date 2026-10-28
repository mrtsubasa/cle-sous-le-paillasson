const { data } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');

function getMutedRole(guild) {
  const guildId = String(guild.id);
  const roleId = data.mutedRole[guildId];
  if (roleId) {
  const role = guild.roles.cache.get(roleId);
  if (role) return role;
  }
  return guild.roles.cache.find((role) => role.name === 'Muted');
}

module.exports = {
  name: 'unmuteall',
  async executePrefix(message) {
  if (!hasPermissionForCommand(message.member, 'unmuteall')) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const mutedRole = getMutedRole(message.guild);
  if (!mutedRole) {
  return message.reply({ content: "Le r\u00f4le mute n'est pas configur\u00e9", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  let members;
  try {
  members = await message.guild.members.fetch();
  } catch {
  return message.reply({ content: "Impossible de r\u00e9cup\u00e9rer les membres", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  let count = 0;
  for (const member of members.values()) {
  if (!member.roles.cache.has(mutedRole.id)) continue;
  try {
  await member.roles.remove(mutedRole);
  count += 1;
  } catch {
  }
  }

  if (count == 0) {
  return message.reply({ content: "Aucun membre n'est mute", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } return message.reply({ content : `**${count}** membres ont \u00e9t\u00e9 unmute`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};

