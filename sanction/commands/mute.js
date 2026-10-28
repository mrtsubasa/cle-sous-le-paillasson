const { data, saveWarns } = require('../utils/state');
const { hasPermissionForCommand, isProtected, isOwnerMember, isSystem } = require('../utils/permissions');
const { resolveMember } = require('../utils/resolvers');
const { checkTieredCommandLimit, formatWaitTime } = require('../utils/rateLimit');
const { logAction } = require('../utils/logAction');

const MAX_MS = 27 * 24 * 60 * 60 * 1000;

const MUTE_LIMITS = {
  default: { limit: 3, windowMs: 60 * 60 * 1000 },
  owner: { limit: 5, windowMs: 30 * 60 * 1000 },
  sys: { limit: 10, windowMs: 30 * 60 * 1000 }
};

module.exports = {
  name: 'mute',
  async executePrefix(message, args) {
  if (!hasPermissionForCommand(message.member, 'mute')) {
  return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const limit = checkTieredCommandLimit(message.guild.id, message.author.id, 'mute', MUTE_LIMITS, message.member);
  if (!limit.allowed) {
  const remainingMs = limit.remaining || 0;
  return message.reply({ content: `Vous avez atteint la limite maximale, revenez ${formatWaitTime(remainingMs)}`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const member = await resolveMember(message, args[0]);
  if (!member) {
  return message.reply({ content: 'Membre non trouv\u00e9', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (member.id == message.author.id) {
  return message.reply({ content: "Tu ne peux pas te mute toi-m\u00eame", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (member.roles.highest.position >= message.member.roles.highest.position && message.author.id != message.guild.ownerId) {
  return message.reply({ content: 'Ce membre a un r\u00f4le \u00e9gal ou sup\u00e9rieur au tien', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  if (isProtected(message.guild.id, member.id, member)) {
  if (!isOwnerMember(message.guild.id, message.author.id, message.member)) {
  return message.reply({ content: "Ce membre est prot\u00e9g\u00e9 et vous n'avez pas le droit de le sanctionner", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  if (isSystem(message.guild.id, member.id, member)) {
  return message.reply({ content: 'Ce membre est un syst\u00e8me. M\u00eame les owners ne peuvent pas le sanctionner', allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
  }

  try {
  await member.timeout(MAX_MS, `Mute par ${message.author.tag}`);
  } catch {
  return message.reply({ content: "Je n'ai pas la permission de mute ce membre", allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }

  const guildId = String(message.guild.id);
  const userId = String(member.id);
  if (!data.warns[guildId]) data.warns[guildId] = {};
  if (!data.warns[guildId][userId]) data.warns[guildId][userId] = [];

  data.warns[guildId][userId].push({
  id: data.warns[guildId][userId].length + 1,
  moderator: String(message.author.id),
  reason: 'Mute : Mute manuel',
  date: new Date().toISOString()
  });
  saveWarns();

  await logAction(message.guild, 'Mute', message.author, member, 'Mute manuel');

  return message.reply({ content : `${member} a \u00e9t\u00e9 mute`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};


