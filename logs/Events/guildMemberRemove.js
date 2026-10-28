const Discord = require('discord.js');
const { getMemberLogTarget } = require('../Utils/logsGuildConfig');
const { sendModLog } = require('../Utils/modLogs');

function cleanRoleName(name) {
  return String(name || 'Role inconnu').replace(/`/g, "'");
}

function getOldRoles(member) {
  return member.roles.cache
    .filter((role) => role.id !== member.guild.id)
    .sort((a, b) => b.position - a.position)
    .map((role) => `- ${cleanRoleName(role.name)} (${role.id})`);
}

function formatOldRoles(oldRoles) {
  return oldRoles
    .slice(0, 25)
    .map((roleLine) => `${roleLine}\n__________`)
    .join('\n');
}

function buildLeaveLog(member) {
  const timestamp = Math.floor(Date.now() / 1000);
  const oldRoles = getOldRoles(member);
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `<:voiceleave:1510334126618837184> ${member} a quitté le serveur !`,
      ),
    );

  if (oldRoles.length > 0) {
    const rolesText = formatOldRoles(oldRoles);
    const moreText = oldRoles.length > 25 ? `\n- [+${oldRoles.length - 25}]` : '';

    container
      .addTextDisplayComponents(
        new Discord.TextDisplayBuilder().setContent(
          `• Ancien Rôles :\n\`\`\`\n${rolesText}${moreText}\n\`\`\``,
        ),
      );
  }

  return container
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function getKickAuditEntry(guild, memberId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.MemberKick,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === memberId && isRecent;
  }) || null;
}

module.exports = {
  name: 'guildMemberRemove',
  async execute(member, bot) {
    if (!member?.guild) return;

    const kickEntry = await getKickAuditEntry(member.guild, member.id);
    if (kickEntry) {
      await sendModLog(bot, member.guild.id, 'kick', {
        executor: kickEntry.executor,
        target: member.user,
        reason: kickEntry.reason || 'Aucune',
      });
    }

    const target = getMemberLogTarget(bot, member.guild.id, 'leave');
    if (!target) return;

    const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
      || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
    if (!destinationGuild) return;

    const logChannel = destinationGuild.channels.cache.get(target.channelId)
      || await destinationGuild.channels.fetch(target.channelId).catch(() => null);
    if (!logChannel?.isTextBased?.()) return;

    await logChannel.send({
      flags: Discord.MessageFlags.IsComponentsV2,
      components: [buildLeaveLog(member)],
      allowedMentions: { parse: [] },
    }).catch((error) => {
      console.error(`Erreur log leave serveur : ${error?.message || error}`);
    });
  },
};
