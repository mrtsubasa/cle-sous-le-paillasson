const { AuditLogEvent } = require('discord.js');
const { isBlacklisted, isBuyer } = require('../Utils/blacklist');
const { isRoleBypass } = require('../Utils/bypass');

async function removeAddedRolesIfPossible(member, oldMember) {
  const addedRoles = member.roles.cache.filter(
    (role) => role.id !== member.guild.id && !oldMember.roles.cache.has(role.id),
  );

  if (!addedRoles.size) return false;

  if (isBuyer(member.id)) return false;

  const botHighestRolePosition = member.guild.members.me?.roles.highest.position ?? 0;
  const removableRoles = addedRoles.filter((role) => role.position < botHighestRolePosition);
  if (!removableRoles.size) return false;

  await member.roles.remove(removableRoles, 'Membre en BLR');
  return true;
}

async function isTrustedRoleUpdate(bot, member, addedRoles) {
  try {
    const logs = await member.guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 6,
    });

    for (const entry of logs.entries.values()) {
      const isTarget = entry.target?.id === member.id;
      const isRecent = Date.now() - entry.createdTimestamp < 5000;
      const added = entry.changes?.some((change) =>
        change.key === '$add'
        && Array.isArray(change.new)
        && change.new.some((role) => addedRoles.has(role.id)),
      );

      if (!isTarget || !isRecent || !added) continue;

      if (isBuyer(entry.executor?.id) || isRoleBypass(bot, member.guild.id, entry.executor?.id)) {
        return true;
      }
    }
  } catch (error) {
    console.error(`Erreur dans la lecture des audit logs BLR : ${error?.message || error}`);
  }

  return false;
}

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, bot) {
    if (!newMember?.guild) return;

    try {
      if (!isBlacklisted(bot, newMember.guild.id, newMember.id)) return;
      if (isBuyer(newMember.id)) return;

      const addedRoles = newMember.roles.cache.filter(
        (role) => role.id !== newMember.guild.id && !oldMember.roles.cache.has(role.id),
      );

      if (!addedRoles.size) return;
      if (await isTrustedRoleUpdate(bot, newMember, new Set(addedRoles.map((role) => role.id)))) return;

      await removeAddedRolesIfPossible(newMember, oldMember);
    } catch (error) {
      console.error(`Erreur dans l'événement guildMemberUpdate : ${error?.message || error}`);
    }
  },
};
