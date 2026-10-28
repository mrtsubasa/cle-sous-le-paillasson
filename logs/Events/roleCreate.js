const Discord = require('discord.js');
const { sendServerRoleLog } = require('../Utils/serverRoleLogs');

async function getRoleAuditEntry(guild, roleId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.RoleCreate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === roleId && isRecent;
  }) || null;
}

module.exports = {
  name: 'roleCreate',
  async execute(role, bot) {
    if (!role?.guild || role.managed) return;

    const auditEntry = await getRoleAuditEntry(role.guild, role.id);
    await sendServerRoleLog(bot, role.guild.id, 'create', {
      executor: auditEntry?.executor,
      role,
    });
  },
};
