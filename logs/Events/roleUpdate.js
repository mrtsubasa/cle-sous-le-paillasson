const Discord = require('discord.js');
const { sendServerRoleLog } = require('../Utils/serverRoleLogs');

const recentRoleUpdateLogs = new Map();

async function getRoleAuditEntry(guild, roleId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.RoleUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === roleId && isRecent;
  }) || null;
}

function hasUsefulChange(oldRole, newRole) {
  return oldRole.name !== newRole.name
    || oldRole.hexColor !== newRole.hexColor
    || oldRole.position !== newRole.position
    || oldRole.hoist !== newRole.hoist
    || oldRole.mentionable !== newRole.mentionable
    || oldRole.permissions?.bitfield !== newRole.permissions?.bitfield;
}

function isPositionOnlyChange(oldRole, newRole) {
  return oldRole.position !== newRole.position
    && oldRole.name === newRole.name
    && oldRole.hexColor === newRole.hexColor
    && oldRole.hoist === newRole.hoist
    && oldRole.mentionable === newRole.mentionable
    && oldRole.permissions?.bitfield === newRole.permissions?.bitfield;
}

function isRecentlyLogged(roleId) {
  const now = Date.now();
  const lastLogAt = recentRoleUpdateLogs.get(roleId) || 0;
  if (now - lastLogAt < 3000) return true;

  recentRoleUpdateLogs.set(roleId, now);
  setTimeout(() => recentRoleUpdateLogs.delete(roleId), 5000).unref?.();
  return false;
}

module.exports = {
  name: 'roleUpdate',
  async execute(oldRole, newRole, bot) {
    if (!newRole?.guild || newRole.managed || !hasUsefulChange(oldRole, newRole)) return;

    const auditEntry = await getRoleAuditEntry(newRole.guild, newRole.id);
    if (isPositionOnlyChange(oldRole, newRole) && !auditEntry) return;
    if (isRecentlyLogged(`${newRole.guild.id}:${newRole.id}`)) return;

    await sendServerRoleLog(bot, newRole.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldRole,
      role: newRole,
    });
  },
};
