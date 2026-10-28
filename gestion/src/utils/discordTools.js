const { MediaGalleryBuilder, MediaGalleryItemBuilder, PermissionFlagsBits } = require('discord.js');

function extractSnowflake(input) {
  const match = String(input || '').match(/\d{15,20}/);
  return match ? match[0] : '';
}

function normalizeSearchText(value) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

async function resolveMember(guild, input) {
  const raw = String(input || '').trim();
  if (!guild || !raw) return null;

  const targetId = extractSnowflake(raw);
  if (targetId) {
    return guild.members.fetch(targetId).catch(() => guild.members.cache.get(targetId) || null);
  }

  const normalized = normalizeSearchText(raw);
  if (!normalized) return null;

  const cached = guild.members.cache.find((member) => {
    const username = normalizeSearchText(member.user?.username);
    const globalName = normalizeSearchText(member.user?.globalName);
    const displayName = normalizeSearchText(member.displayName);
    const tag = normalizeSearchText(member.user?.tag);
    return [username, globalName, displayName, tag].includes(normalized);
  });

  if (cached) return cached;

  const fetched = await guild.members.fetch({ query: raw, limit: 10 }).catch(() => null);
  if (!fetched) return null;

  return (
    fetched.find((member) => {
      const username = normalizeSearchText(member.user?.username);
      const globalName = normalizeSearchText(member.user?.globalName);
      const displayName = normalizeSearchText(member.displayName);
      const tag = normalizeSearchText(member.user?.tag);
      return [username, globalName, displayName, tag].includes(normalized);
    }) || null
  );
}

function resolveRole(guild, input) {
  const raw = String(input || '').trim();
  if (!guild || !raw) return null;

  const roleId = extractSnowflake(raw);
  if (roleId) {
    return guild.roles.cache.get(roleId) || null;
  }

  const normalized = normalizeSearchText(raw);
  return (
    guild.roles.cache.find((role) => normalizeSearchText(role.name) === normalized) ||
    guild.roles.cache.find((role) => normalizeSearchText(role.name).includes(normalized)) ||
    null
  );
}

function canActorManageMember(actorMember, targetMember) {
  if (!actorMember || !targetMember) return false;
  if (String(actorMember.id) === String(actorMember.guild.ownerId)) return true;
  if (String(targetMember.id) === String(actorMember.guild.ownerId)) return false;
  return actorMember.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

function canActorManageRole(actorMember, role) {
  if (!actorMember || !role) return false;
  if (String(actorMember.id) === String(actorMember.guild.ownerId)) return true;
  return actorMember.roles.highest.comparePositionTo(role) > 0;
}

function canBotManageMember(guild, targetMember) {
  const me = guild?.members?.me;
  if (!me || !targetMember) return false;
  if (String(targetMember.id) === String(guild.ownerId)) return false;
  return me.roles.highest.comparePositionTo(targetMember.roles.highest) > 0;
}

function canBotManageRole(guild, role) {
  const me = guild?.members?.me;
  if (!me || !role) return false;
  return me.roles.highest.comparePositionTo(role) > 0;
}

function parseDurationToMs(input) {
  const raw = String(input || '').trim().toLowerCase();
  if (!raw) return null;

  const match = raw.match(/^(\d+)(s|m|h)?$/);
  if (!match) return null;

  const value = Number.parseInt(match[1], 10);
  if (!Number.isInteger(value) || value <= 0) return null;

  const unit = match[2] || 'm';
  if (unit === 's') return value * 1000;
  if (unit === 'm') return value * 60 * 1000;
  if (unit === 'h') return value * 60 * 60 * 1000;
  return null;
}

function formatDuration(ms) {
  const totalSeconds = Math.max(0, Math.floor(Number(ms || 0) / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (hours) parts.push(`${hours}h`);
  if (minutes) parts.push(`${minutes}m`);
  if (seconds && !hours) parts.push(`${seconds}s`);
  return parts.length ? parts.join(' ') : '0s';
}

function splitLines(lines, maxLines = 25, maxChars = 3500) {
  const safeLines = Array.isArray(lines) ? lines.filter(Boolean) : [];
  if (!safeLines.length) return [];

  const chunks = [];
  let current = [];
  let currentLength = 0;

  for (const line of safeLines) {
    const nextLength = currentLength + line.length + 1;
    if (current.length >= maxLines || nextLength > maxChars) {
      chunks.push(current);
      current = [];
      currentLength = 0;
    }
    current.push(line);
    currentLength += line.length + 1;
  }

  if (current.length) chunks.push(current);
  return chunks;
}

function createImageComponent(url) {
  if (!url) return null;
  return new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(url));
}

function hasAdministrator(member) {
  return member?.permissions?.has(PermissionFlagsBits.Administrator) === true;
}

module.exports = {
  extractSnowflake,
  normalizeSearchText,
  resolveMember,
  resolveRole,
  canActorManageMember,
  canActorManageRole,
  canBotManageMember,
  canBotManageRole,
  parseDurationToMs,
  formatDuration,
  splitLines,
  createImageComponent,
  hasAdministrator
};
