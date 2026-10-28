const { hasPermissionForCommand } = require('../utils/permissions');
const { data, saveTempTimeouts } = require('../utils/state');

module.exports = {
  name: 'untoall',
  async executePrefix(message) {
  if (!hasPermissionForCommand(message.member, 'untoall')) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guildKey = String(message.guild.id);
  const stored = data.tempTimeouts[guildKey] || {};
  const memberIds = Object.keys(stored);

  if (!memberIds.length) {
  return message.reply({ content: "Aucun membre n'est timeout", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  let count = 0;
  for (const memberId of memberIds) {
  const member = await message.guild.members.fetch(memberId).catch(() => null);
  if (!member || !member.isCommunicationDisabled()) continue;
  try {
  await member.timeout(null);
  count += 1;
  } catch {
  }
  }

  if (count == 0) {
  return message.reply({ content: "Aucun membre n'est timeout", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  delete data.tempTimeouts[guildKey];
  saveTempTimeouts();

  return message.reply({ content: `${count} membres ont \u00e9t\u00e9 retir\u00e9s du timeout`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};

