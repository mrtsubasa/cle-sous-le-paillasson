const Discord = require('discord.js');
const guildEntryLogCreate = require('../Utils/guildEntryLogCreate');
const { getConfiguredLogChannelId } = require('../Utils/logChannels');
const {
  getRoleLimit,
  getRoleLimitRecord,
  isRoleLimitBypassed,
} = require('../Utils/roleLimit');

function parseList(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function buildLimitLog(executor, target, role) {
  const unixTimestamp = Math.floor(Date.now() / 1000);
  const thumb = new Discord.ThumbnailBuilder({
    media: { url: executor.displayAvatarURL({ size: 64 }) },
  });

  const section = new Discord.SectionBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `> ↳ Auteur : \`${executor.tag}\` (\`${executor.id}\`)\n`
        + `> ↳ Utilisateur : \`${target.tag}\` (\`${target.id}\`)\n`
        + `> ↳ Rôle : \`${role.name}\`\n`
        + `> ↳ Date : <t:${unixTimestamp}:F>\n`
        + '> ↳ Action : Retrait du rôle (limite dépassée)',
      ),
    )
    .setThumbnailAccessory(thumb);

  return new Discord.ContainerBuilder()
    .setAccentColor(0x2b2d31)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(new Discord.TextDisplayBuilder().setContent('# __Limite dépassée__'))
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addSectionComponents(section)
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    );
}

function countRoleMembersOutsideBaseline(role, baselineMemberIds) {
  let count = 0;

  for (const memberId of role.members.keys()) {
    if (!baselineMemberIds.has(memberId)) count++;
  }

  return count;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

module.exports = {
  name: 'guildMemberUpdate',
  async execute(oldMember, newMember, bot) {
    if (!newMember?.guild) return;

    try {
      const addedRoles = newMember.roles.cache.filter((role) => !oldMember.roles.cache.has(role.id));
      if (!addedRoles.size) return;

      for (const role of addedRoles.values()) {
        const limit = getRoleLimit(bot, newMember.guild.id, role.id);
        if (limit === null) continue;

        const roleLimitRecord = getRoleLimitRecord(bot, newMember.guild.id, role.id);
        const baselineMemberIds = new Set(parseList(roleLimitRecord?.baseline_member_ids));
        const currentRoleCount = countRoleMembersOutsideBaseline(role, baselineMemberIds);

        if (currentRoleCount <= limit) continue;

        const botHighestRolePosition = newMember.guild.members.me?.roles.highest.position ?? 0;
        if (role.position >= botHighestRolePosition) continue;

        const roleLogPromise = guildEntryLogCreate(newMember.guild, newMember.id, role.id);
        const roleLog = await Promise.race([
          roleLogPromise,
          wait(2000),
        ]);

        if (!roleLog || !roleLog.executor?.id) {
          await newMember.roles.remove(role, `Limite de ${limit} membres pour le rôle dépassée`);
          continue;
        }

        const executor = roleLog.executor;
        if (isRoleLimitBypassed(bot, newMember.guild.id, executor.id)) {
          console.log(`Ajout du rôle ${role.name} par ${executor.username} ignoré (bypass)`);
          continue;
        }

        await newMember.roles.remove(role, `Limite de ${limit} membres pour le rôle dépassée`);

        const logChannelId = getConfiguredLogChannelId(bot, newMember.guild.id, 'role_limit_overflow_logs');
        const logChannel = logChannelId ? newMember.guild.channels.cache.get(logChannelId) : null;
        if (logChannel?.isTextBased?.()) {
          const container = buildLimitLog(executor, newMember.user, role);
          await logChannel.send({
            components: [container],
            flags: Discord.MessageFlags.IsComponentsV2,
            allowedMentions: { parse: [] },
          });
        }

        console.log(`Rôle retiré de ${newMember.user.username} (limite dépassée) : ${role.name}`);
      }
    } catch (error) {
      console.error(`Erreur dans l'événement guildMemberUpdate : ${error?.message || error}`);
    }
  },
};
