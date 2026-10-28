const { hasPermissionForCommand } = require('../utils/permissions');
const { logAction } = require('../utils/logAction');

function normalizeInput(args) {
  return Array.isArray(args) ? args.join(' ').trim() : '';
}

function parseIdLike(input) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  const mention = raw.match(/^<@!?(\d{16,21})>$/);
  if (mention) return mention[1];

  const id = raw.match(/^(\d{16,21})$/);
  if (id) return id[1];

  return null;
}

function memberMatches(member, target) {
  const username = String(member && member.user && member.user.username ? member.user.username : '').toLowerCase();
  const tag = String(member && member.user && member.user.tag ? member.user.tag : '').toLowerCase();
  const display = String(member && member.displayName ? member.displayName : '').toLowerCase();
  return username === target || tag === target || display === target;
}

async function resolveUnbanTarget(guild, input) {
  const raw = String(input || '').trim();
  if (!raw) return { status: 'not_found', user: null };

  const idLike = parseIdLike(raw);
  if (idLike) {
    const ban = await guild.bans.fetch(idLike).catch(() => null);
    if (ban && ban.user) return { status: 'banned', user: ban.user };

    const existing = await guild.client.users.fetch(idLike).catch(() => null);
    if (existing) return { status: 'exists_not_banned', user: existing };
    return { status: 'not_found', user: null };
  }

  const target = raw.toLowerCase();
  const bans = await guild.bans.fetch().catch(() => null);
  if (bans && bans.size) {
    const banned = bans.find((entry) => entry && entry.user && (
      String(entry.user.username || '').toLowerCase() === target
      || String(entry.user.tag || '').toLowerCase() === target
    ));
    if (banned && banned.user) return { status: 'banned', user: banned.user };
  }

  const fromCache = guild.members.cache.find((member) => memberMatches(member, target));
  if (fromCache && fromCache.user) return { status: 'exists_not_banned', user: fromCache.user };

  const searched = await guild.members.search({ query: raw, limit: 25 }).catch(() => null);
  if (searched && searched.size) {
    const exact = searched.find((member) => memberMatches(member, target));
    if (exact && exact.user) return { status: 'exists_not_banned', user: exact.user };
  }

  return { status: 'not_found', user: null };
}

module.exports = {
  name: 'unban',
  async executePrefix(message, args) {
    if (!hasPermissionForCommand(message.member, 'unban')) {
      return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const rawInput = normalizeInput(args);
    const target = await resolveUnbanTarget(message.guild, rawInput);

    if (target.status === 'not_found' || !target.user) {
      return message.reply({ content: 'Utilisateur introuvable', allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    const username = target.user.username ? target.user.username : target.user.id;

    if (target.status === 'exists_not_banned') {
      return message.reply({ content: `${username} n'est pas banni du serveur`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    try {
      await message.guild.members.unban(target.user.id);
    } catch {
      return message.reply({ content: `${username} n'est pas banni du serveur`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }

    await logAction(message.guild, 'Unban', message.author, target.user, 'Unban manuel');

    return message.reply({ content: `${username} a \u00e9t\u00e9 unban`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
  }
};


