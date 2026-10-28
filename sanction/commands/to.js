const { SlashCommandBuilder } = require('discord.js');
const { data, saveWarns, saveTempTimeouts } = require('../utils/state');
const { isProtected, isOwnerMember, isSystem, hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');
const { checkCommandLimit, formatWaitTime } = require('../utils/rateLimit');
const { logAction } = require('../utils/logAction');
const { resolveMember } = require('../utils/resolvers');

function parseShortDuration(input, maxMinutes) {
  if (!input) return null;
  const match = String(input).trim().match(/^(\d+)([smh])$/i);
  if (!match) return null;

  const value = parseInt(match[1], 10);
  if (!value || Number.isNaN(value)) return null;

  const unit = match[2].toLowerCase();
  let minutes = value;
  if (unit === 's') minutes = value / 60;
  if (unit === 'h') minutes = value * 60;

  if (minutes <= 0) return null;
  if (maxMinutes && minutes > maxMinutes) return { error: 'max' };

  return {
  minutes,
  label: `${value}${unit}`
  };
}

function persistTimeout(guildId, memberId, entry) {
  const gid = String(guildId);
  const mid = String(memberId);
  if (!data.tempTimeouts[gid]) data.tempTimeouts[gid] = {};
  data.tempTimeouts[gid][mid] = entry;
  saveTempTimeouts();
}

module.exports = {
  name: 'to',
  slashData: new SlashCommandBuilder()
  .setName('to')
  .setDescription('Timeout un membre (max 3h)')
  .addUserOption((option) =>
  option
  .setName('membre')
  .setDescription('Le membre \u00e0 timeout')
  .setRequired(true)
  )
  .addIntegerOption((option) =>
  option
  .setName('duree')
  .setDescription('Dur\u00e9e en minutes (max 180)')
  .setRequired(true)
  )
  .addStringOption((option) =>
  option
  .setName('raison')
  .setDescription('Raison du timeout')
  .setRequired(true)
  ),

  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'to')) {
  return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const member = await resolveMember(message, args[0]);
  if (!member) {
  return message.reply({ ...noCard('Membre non trouv\u00e9'), allowedMentions: { parse: [] }, mentionRepliedUser: false }); } const parsedDuration = parseShortDuration(args[1], 180); if (!parsedDuration) { return message.reply({ ...noCard('Dur\u00e9e invalide, exemple : 10m, 30s, 1h'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  if (parsedDuration.error === 'max') {
  return message.reply({ ...noCard('La dur\u00e9e maximale est de **`3 heures`**'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const durationMinutes = parsedDuration.minutes;
  const durationLabel = parsedDuration.label;
  const reason = args.slice(2).join(' ').trim() || 'Aucune raison';

  const limit = checkCommandLimit(message.guild.id, message.author.id, 'to', message.member);
  if (!limit.allowed) {
  const remainingMs = limit.remaining || 0;
  return message.reply({ ...noCard(`Vous avez atteint la limite maximale, revenez ${formatWaitTime(remainingMs)}`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (member.id === message.author.id) {
  return message.reply({ ...noCard('Tu ne peux pas te timeout toi-m\u00eame'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id !== message.guild.ownerId) {
  return message.reply({ ...noCard('Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (isProtected(message.guild.id, member.id, member)) {
  if (!isOwnerMember(message.guild.id, message.author.id, message.member)) {
  return message.reply({ ...noCard("Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  if (isSystem(message.guild.id, member.id, member)) {
  return message.reply({ ...noCard('Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner'), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  }

  try {
  await member.timeout(durationMinutes * 60 * 1000, reason);
  const endTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  persistTimeout(message.guild.id, member.id, {
  duration: durationMinutes,
  endTime,
  reason,
  moderator: message.author.id
  });
  } catch {
  return message.reply({ ...noCard("Je n'ai pas la permission de timeout ce membre"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
  } await message.reply({ ...yesCard(`${member} a \u00e9t\u00e9 timeout **\`${durationLabel}\`** pour **\`${reason}\`**`), allowedMentions : { parse: [] }, mentionRepliedUser: false });

  try {
  await member.send({
  ...yesCard(`Tu as \u00e9t\u00e9 timeout sur **${message.guild.name}** **\`${durationLabel}\`** pour **\`${reason}\`**`)
  });
  } catch {
  }

  const guildId = String(message.guild.id);
  const userId = String(member.id);
  if (!data.warns[guildId]) data.warns[guildId] = {};
  if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];

  data.warns[guildId][userId].push({
  id: data.warns[guildId][userId].length + 1,
  moderator: String(message.author.id),
  reason: `Timeout : ${reason} (${durationLabel})`,
  date: new Date().toISOString()
  });
  saveWarns();

  await logAction(message.guild, 'Timeout', message.author, member, reason, `${durationLabel}`);
  },

  async executeSlash(interaction) {
  const member = interaction.options.getMember('membre');
  const durationMinutes = interaction.options.getInteger('duree', true);
  const reason = interaction.options.getString('raison', true);

  const limit = checkCommandLimit(interaction.guild.id, interaction.user.id, 'to', interaction.member);
  if (!limit.allowed) {
  const remainingMs = limit.remaining || 0;
  return interaction.reply({ ...noCard(`Vous avez atteint la limite maximale, revenez ${formatWaitTime(remainingMs)}`), ephemeral: true });
  }

  if (member.id === interaction.user.id) {
  return interaction.reply({ ...noCard('Tu ne peux pas te timeout toi-m\u00eame'), ephemeral: true });
  }

  if (member.roles.highest.position >= interaction.member.roles.highest.position && interaction.user.id !== interaction.guild.ownerId) {
  return interaction.reply({ ...noCard('Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien'), ephemeral: true });
  }

  if (isProtected(interaction.guild.id, member.id, member)) {
  if (!isOwnerMember(interaction.guild.id, interaction.user.id, interaction.member)) {
  return interaction.reply({ ...noCard("Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner"), ephemeral: true });
  }
  if (isSystem(interaction.guild.id, member.id, member)) {
  return interaction.reply({ ...noCard('Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner'), ephemeral: true });
  }
  }

  if (durationMinutes > 180) {
  return interaction.reply({ ...noCard('La dur\u00e9e maximale est de **`3 heures (180 minutes)`**'), ephemeral: true });
  }

  try {
  await member.timeout(durationMinutes * 60 * 1000, reason);
  const endTime = new Date(Date.now() + durationMinutes * 60 * 1000).toISOString();
  persistTimeout(interaction.guild.id, member.id, {
  duration: durationMinutes,
  endTime,
  reason,
  moderator: interaction.user.id
  });
  } catch {
  return interaction.reply({ ...noCard("Je n'ai pas la permission de timeout ce membre"), ephemeral: true });
  }

  await interaction.reply(yesCard(`${member} a \u00e9t\u00e9 timeout **\`${durationMinutes} minutes\`** pour **\`${reason}\`**`));

  try {
  await member.send({
  ...yesCard(`Tu as \u00e9t\u00e9 timeout sur **${interaction.guild.name}** **\`${durationMinutes} minutes\`** pour **\`${reason}\`**`)
  });
  } catch {
  }

  const guildId = String(interaction.guild.id);
  const userId = String(member.id);
  if (!data.warns[guildId]) data.warns[guildId] = {};
  if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];

  data.warns[guildId][userId].push({
  id: data.warns[guildId][userId].length + 1,
  moderator: String(interaction.user.id),
  reason: `Timeout : ${reason} (${durationMinutes}m)`,
  date: new Date().toISOString()
  });
  saveWarns();

  await logAction(interaction.guild, 'Timeout', interaction.user, member, reason, `${durationMinutes} minutes`);
  }
};





