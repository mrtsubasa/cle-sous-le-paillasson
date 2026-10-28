const { AuditLogEvent } = require('discord.js');

async function guildEntryLogCreate(guild, targetId, roleId, delayMs = 5000) {
  try {
    const logs = await guild.fetchAuditLogs({
      type: AuditLogEvent.MemberRoleUpdate,
      limit: 6,
    });

    for (const entry of logs.entries.values()) {
      const isTarget = entry.target?.id === targetId;
      const isRecent = Date.now() - entry.createdTimestamp < delayMs;
      const hasRole = entry.changes?.some((change) =>
        change.key === '$add'
        && Array.isArray(change.new)
        && change.new.some((role) => role.id === roleId),
      );

      if (isTarget && isRecent && hasRole) {
        return entry;
      }
    }

    return null;
  } catch (error) {
    console.error(`Erreur guildEntryLogCreate : ${error?.message || error}`);
    return null;
  }
}

module.exports = guildEntryLogCreate;
