const { isBotOwner, isSystem, isOwnerMember, hasPermissionForCommand } = require('../utils/permissions');
const { noCard } = require('../utils/cards');
const { data } = require('../utils/state');
const otherCommand = require('../commands/other');
const limitsCommand = require('../commands/limits');
const gwCommand = require('../commands/gw');
const { recordMessage } = require('../utils/snipeStore');
const { getSanctionRuntimeConfigPath } = require('../utils/runtimeConfig');
const { readJsonConfig } = require('../../../Utils/tokenVault');

function getConfig() {
  return readJsonConfig(getSanctionRuntimeConfigPath(), { migrateToken: false }) || {};
}

module.exports = {
  name: 'messageCreate',
  async execute(message, client) {
  if (message.author.bot || !message.guild) return;

  recordMessage(message);
  if (limitsCommand.handleAwaiting(message)) return;
  if (otherCommand.handleAwaiting(message)) return;
  if (gwCommand.handleAwaiting(message)) return;
  const config = getConfig();
  const prefix = typeof config.prefix === 'string' ? config.prefix : '';
  if (!prefix || !message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  let commandName = (args.shift() || '').toLowerCase();
  if (!commandName) return;

  if (args[0] && args[0].toLowerCase() === 'all') {
  const allCommand = `${commandName}all`;
  if (client.commands.has(allCommand)) {
  commandName = allCommand;
  args.shift();
  }
  }

  const sanctionCommands = new Set(['warn', 'tempmute', 'to']);
  if (sanctionCommands.has(commandName)) {
  const guildId = String(message.guild.id);
  const allowedChannelId = data.allowedChannel[guildId];
  if (allowedChannelId) {
  const isBuyer = isBotOwner(message.author.id);
  const isSysMember = isSystem(guildId, message.author.id, message.member);
  const isOwner = isOwnerMember(guildId, message.author.id, message.member);
  if (!isBuyer && !isSysMember && !isOwner && String(allowedChannelId) != String(message.channelId)) {
  const warning = noCard(`Vous pouvez uniquement utiliser les commandes de sanction dans <#${allowedChannelId}>`);
  return message.reply({ ...warning, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  }
  }

  const command = client.commands.get(commandName);
  if (!command || !command.executePrefix) return;

  const guildId = String(message.guild.id);
  const isBuyerMember = isBotOwner(message.author.id);
  const isSysMember = isSystem(guildId, message.author.id, message.member);
  const isOwnerMemberFlag = isOwnerMember(guildId, message.author.id, message.member);
  if (!isBuyerMember && (isSysMember || isOwnerMemberFlag) && !hasPermissionForCommand(message.member, commandName)) {
  const textPermissionCommands = new Set(['ban', 'derank', 'hide', 'hideall', 'kick', 'lock', 'lockall', 'mute', 'renew', 'umuteall', 'unban', 'unbanall', 'unhide', 'unhideall', 'unlock', 'unlockall', 'untoall']);
  if (textPermissionCommands.has(commandName)) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } return message.reply({ ...noCard("Vous n'avez pas la permission d'utiliser cette commande"), allowedMentions : { parse: [] }, mentionRepliedUser: false });
  }

  try {
  await command.executePrefix(message, args, client);
  } catch (error) {
  console.error(`Prefix command error ${commandName}:`, error);
  }
  }
};




