const Discord = require('discord.js');
const {
  getMemberLogTarget,
  getRoleLogTarget,
} = require('../Utils/logsGuildConfig');
const { sendModLog } = require('../Utils/modLogs');

function cleanText(value) {
  return String(value || 'Aucun pseudo')
    .replace(/```/g, "'''")
    .trim() || 'Aucun pseudo';
}

function getServerName(member) {
  return member.nickname || member.user?.globalName || 'Aucun pseudo';
}

function formatUser(user) {
  return user?.id ? `<@${user.id}>` : 'Utilisateur inconnu';
}

function formatUserWithId(user) {
  return user?.id ? `${formatUser(user)} (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatRole(role) {
  const roleName = String(role.name || 'Rôle inconnu').replace(/`/g, "'");
  return `  - \`${roleName}\` (\`${role.id}\`)`;
}

function cutText(value, maxLength = 3500) {
  const text = String(value || '');
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength - 20)}\n...`;
}

async function getNicknameExecutor(guild, memberId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.MemberUpdate,
    limit: 6,
  }).catch(() => null);

  const entry = logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isNickChange = auditEntry.changes?.some?.((change) => change.key === 'nick');
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === memberId && isNickChange && isRecent;
  });

  return entry?.executor || null;
}

async function getTimeoutAuditEntry(guild, memberId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.MemberUpdate,
    limit: 8,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    const isTimeoutChange = auditEntry.changes?.some?.((change) => (
      change.key === 'communication_disabled_until'
    ));

    return targetId === memberId && isRecent && isTimeoutChange;
  }) || null;
}

async function getRoleExecutor(guild, memberId, action, roleIds) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.MemberRoleUpdate,
    limit: 8,
  }).catch(() => null);

  const entry = logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    const expectedKey = action === 'add' ? '$add' : '$remove';
    const hasRoleChange = auditEntry.changes?.some?.((change) => {
      if (change.key !== expectedKey) return false;

      const changedRoles = Array.isArray(change.new)
        ? change.new
        : Array.isArray(change.old)
          ? change.old
          : [];

      return changedRoles.some((role) => roleIds.includes(role.id));
    });

    return targetId === memberId && isRecent && hasRoleChange;
  });

  return entry?.executor || null;
}

function buildNameLog(executor, member, beforeName, afterName) {
  const timestamp = Math.floor(Date.now() / 1000);

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `🪪 ${formatUser(executor)} a changé le pseudo de ${member} !`,
      ),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `• Avant :\n\`\`\`\n${cleanText(beforeName)}\n\`\`\``,
      ),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `• Apres :\n\`\`\`\n${cleanText(afterName)}\n\`\`\``,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

function getRoleDiff(oldMember, newMember) {
  const oldRoles = oldMember?.roles?.cache || new Discord.Collection();
  const newRoles = newMember?.roles?.cache || new Discord.Collection();
  const guildId = newMember?.guild?.id || oldMember?.guild?.id;

  const added = newRoles
    .filter((role) => role.id !== guildId && !oldRoles.has(role.id))
    .sort((a, b) => b.position - a.position);
  const removed = oldRoles
    .filter((role) => role.id !== guildId && !newRoles.has(role.id))
    .sort((a, b) => b.position - a.position);

  return {
    added: [...added.values()],
    removed: [...removed.values()],
  };
}

function buildRoleLog(action, executor, member, roles) {
  const timestamp = Math.floor(Date.now() / 1000);
  const isAdd = action === 'add';
  const title = isAdd ? 'Ajout de rôle' : 'Retrait de rôle';
  const icon = isAdd ? '<:ajout:1382304476227960882>' : '<:ee:1434328162426294436>';
  const rolesText = roles.length ? roles.map(formatRole).join('\n') : '  - Aucun rôle';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        cutText(
          `${icon} **${title} !**\n\n`
          + `- Auteur : ${formatUserWithId(executor)}\n\n`
          + `- Cible : ${member} (\`${member.id}\`)\n\n`
          + `- Rôles :\n${rolesText}`,
        ),
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

async function sendNameLog(bot, guild, executor, member, beforeName, afterName) {
  const target = getMemberLogTarget(bot, guild.id, 'name');
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildNameLog(executor, member, beforeName, afterName)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log pseudo serveur : ${error?.message || error}`);
  });
}

async function sendRoleLog(bot, guild, action, executor, member, roles) {
  const target = getRoleLogTarget(bot, guild.id, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildRoleLog(action, executor, member, roles)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log rôle serveur : ${error?.message || error}`);
  });
}

async function sendTimeoutLog(bot, guild, oldMember, newMember) {
  const oldTimeout = oldMember?.communicationDisabledUntilTimestamp || 0;
  const newTimeout = newMember?.communicationDisabledUntilTimestamp || 0;
  if (oldTimeout === newTimeout) return;

  const isTimeoutAdded = newTimeout && newTimeout > Date.now();
  const isTimeoutRemoved = oldTimeout && (!newTimeout || newTimeout <= Date.now());
  const action = isTimeoutAdded ? 'to' : isTimeoutRemoved ? 'unto' : '';
  if (!action) return;

  const auditEntry = await getTimeoutAuditEntry(guild, newMember.id);
  if (!auditEntry) return;

  await sendModLog(bot, guild.id, action, {
    executor: auditEntry.executor,
    target: newMember.user,
    reason: auditEntry.reason || 'Aucune',
    timeText: action === 'to' ? `<t:${Math.floor(newTimeout / 1000)}:R>` : '',
  });
}

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, bot) {
    const guild = newMember?.guild || oldMember?.guild;
    if (!guild || !newMember) return;

    await sendTimeoutLog(bot, guild, oldMember, newMember);

    const { added, removed } = getRoleDiff(oldMember, newMember);

    if (added.length) {
      const executor = await getRoleExecutor(guild, newMember.id, 'add', added.map((role) => role.id));
      await sendRoleLog(bot, guild, 'add', executor, newMember, added);
    }

    if (removed.length) {
      const executor = await getRoleExecutor(guild, newMember.id, 'remove', removed.map((role) => role.id));
      await sendRoleLog(bot, guild, 'remove', executor, newMember, removed);
    }

    const beforeName = getServerName(oldMember);
    const afterName = getServerName(newMember);
    if (beforeName === afterName) return;
    const executor = await getNicknameExecutor(guild, newMember.id) || newMember.user;
    await sendNameLog(bot, guild, executor, newMember, beforeName, afterName);
  },
};
