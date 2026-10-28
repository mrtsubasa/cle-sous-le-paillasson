const { SlashCommandBuilder } = require('discord.js');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { data, saveTempTimeouts } = require('../utils/state');
const { logAction } = require('../utils/logAction');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

module.exports = {
  name: 'unto',
  slashData: new SlashCommandBuilder()
  .setName('unto')
  .setDescription("Retire le timeout d'un membre")
  .addUserOption((option) =>
  option
  .setName('membre')
  .setDescription('Le membre \u00e0 qui retirer le timeout')
  .setRequired(true)
  ),
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'unto')) {
  return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const member = await resolveMember(message, args[0]);
  if (!member) {
  return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (!member.isCommunicationDisabled()) {
  return message.reply({ ...noCard("Le membre n'est pas timeout"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guildKey = String(message.guild.id);
  const userKey = String(member.id);
  if (data.tempTimeouts[guildKey] && data.tempTimeouts[guildKey][userKey]) {
  delete data.tempTimeouts[guildKey][userKey];
  if (!Object.keys(data.tempTimeouts[guildKey]).length) {
  delete data.tempTimeouts[guildKey];
  }
  saveTempTimeouts();
  }

  try {
  await member.timeout(null, `Timeout retir\u00e9 par ${message.author.tag}`);
  } catch {
  return message.reply({ ...noCard("Je n'ai pas la permission de retirer le timeout"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } await message.reply({ ...yesCard(`${member} n'est plus timeout`), allowedMentions : { parse: [] }, mentionRepliedUser: false });
  await logAction(message.guild, 'Timeout retir\u00e9', message.author, member, 'Timeout retir\u00e9 manuellement');
  },
  async executeSlash(interaction) {
  const member = interaction.options.getMember('membre');
  if (!member.isCommunicationDisabled()) {
  return interaction.reply(noCard("Le membre n'est pas timeout"));
  }

  const guildKey = String(interaction.guild.id);
  const userKey = String(member.id);
  if (data.tempTimeouts[guildKey] && data.tempTimeouts[guildKey][userKey]) {
  delete data.tempTimeouts[guildKey][userKey];
  if (!Object.keys(data.tempTimeouts[guildKey]).length) {
  delete data.tempTimeouts[guildKey];
  }
  saveTempTimeouts();
  }

  try {
  await member.timeout(null, `Timeout retir\u00e9 par ${interaction.user.tag}`);
  } catch {
  return interaction.reply(noCard("Je n'ai pas la permission de retirer le timeout"));
  }

  await interaction.reply(yesCard(`${member} n'est plus timeout`));
  await logAction(interaction.guild, 'Timeout retir\u00e9', interaction.user, member, 'Timeout retir\u00e9 manuellement');
  }
};
