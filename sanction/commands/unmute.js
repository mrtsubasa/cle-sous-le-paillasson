const { SlashCommandBuilder } = require('discord.js');
const { tempMutes, muteTimers, data, saveTempMutes } = require('../utils/state');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { logAction } = require('../utils/logAction');
const { hasPermissionForCommand } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');

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
  name: 'unmute',
  slashData: new SlashCommandBuilder()
  .setName('unmute')
  .setDescription('Unmute un membre')
  .addUserOption((option) =>
  option
  .setName('membre')
  .setDescription('Le membre \u00e0 qui retirer le mute')
  .setRequired(true)
  ),
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'unmute')) {
  return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const member = await resolveMember(message, args[0]);
  if (!member) {
  return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const mutedRole = getMutedRole(message.guild);
  if (!mutedRole) {
  return message.reply({ ...noCard("Le r\u00f4le mute n'est pas configur\u00e9"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  if (!member.roles.cache.has(mutedRole.id)) {
  return message.reply({ ...noCard("Le membre n'est pas mute"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } const key = `${message.guild.id} :${member.id}`;
  tempMutes.delete(key);
  const guildKey = String(message.guild.id);
  const userKey = String(member.id);
  if (data.tempMutes[guildKey] && data.tempMutes[guildKey][userKey]) {
  delete data.tempMutes[guildKey][userKey];
  if (!Object.keys(data.tempMutes[guildKey]).length) {
  delete data.tempMutes[guildKey];
  }
  saveTempMutes();
  }
  if (muteTimers.has(key)) {
  clearTimeout(muteTimers.get(key));
  muteTimers.delete(key);
  }

  await member.roles.remove(mutedRole, `Unmute par ${message.author.tag}`);
  await message.reply({ ...yesCard(`${member} a \u00e9t\u00e9 unmute`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  await logAction(message.guild, 'Unmute', message.author, member, 'Unmute manuel');
  },
  async executeSlash(interaction) {
  const member = interaction.options.getMember('membre');
  const mutedRole = getMutedRole(interaction.guild);
  if (!mutedRole) {
  return interaction.reply(noCard("Le r\u00f4le mute n'est pas configur\u00e9"));
  }
  if (!member.roles.cache.has(mutedRole.id)) {
  return interaction.reply(noCard("Le membre n'est pas mute"));
  } const key = `${interaction.guild.id} :${member.id}`;
  tempMutes.delete(key);
  const guildKey = String(interaction.guild.id);
  const userKey = String(member.id);
  if (data.tempMutes[guildKey] && data.tempMutes[guildKey][userKey]) {
  delete data.tempMutes[guildKey][userKey];
  if (!Object.keys(data.tempMutes[guildKey]).length) {
  delete data.tempMutes[guildKey];
  }
  saveTempMutes();
  }
  if (muteTimers.has(key)) {
  clearTimeout(muteTimers.get(key));
  muteTimers.delete(key);
  }

  await member.roles.remove(mutedRole, `Unmute par ${interaction.user.tag}`);
  await interaction.reply(yesCard(`${member} a \u00e9t\u00e9 unmute`));
  await logAction(interaction.guild, 'Unmute', interaction.user, member, 'Unmute manuel');
  }
};
