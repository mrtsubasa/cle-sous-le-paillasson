const Discord = require('discord.js');
const { getServerRoleLogTarget } = require('./logsGuildConfig');

const ROLE_LOG_META = {
  create: {
    icon: '✅',
    title: 'Création de rôle',
  },
  delete: {
    icon: '<:ee:1434328162426294436>',
    title: 'Suppression de rôle',
  },
  update: {
    icon: '📝',
    title: 'Modification de rôle',
  },
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function roleName(role) {
  return cleanInline(role?.name, 'Rôle inconnu');
}

function roleColor(role) {
  return role?.hexColor && role.hexColor !== '#000000' ? role.hexColor : 'Aucune';
}

function roleFlags(role) {
  const flags = [];
  if (role?.hoist) flags.push('Affiché séparément');
  if (role?.mentionable) flags.push('Mentionnable');
  if (role?.managed) flags.push('Managed');
  return flags.length ? flags.join(', ') : 'Aucun';
}

function formatPermissionName(name) {
  return name.replace(/([a-z0-9])([A-Z])/g, '$1 $2');
}

function getPermissionDiff(oldRole, newRole) {
  const flags = Discord.PermissionsBitField.Flags;
  const added = [];
  const removed = [];

  for (const [name, bit] of Object.entries(flags)) {
    const had = oldRole.permissions?.has(bit);
    const has = newRole.permissions?.has(bit);

    if (!had && has) added.push(formatPermissionName(name));
    if (had && !has) removed.push(formatPermissionName(name));
  }

  const lines = [];
  if (added.length) lines.push(`  - Permissions ajoutées : \`${added.slice(0, 12).join('`, `')}${added.length > 12 ? '`, `...' : ''}\``);
  if (removed.length) lines.push(`  - Permissions retirées : \`${removed.slice(0, 12).join('`, `')}${removed.length > 12 ? '`, `...' : ''}\``);

  return lines.length ? lines : ['  - Permissions : `Modifiées`'];
}

function formatRoleDetails(role) {
  return [
    `  - Nom : \`${roleName(role)}\``,
    `  - ID : \`${role?.id || 'inconnu'}\``,
    `  - Couleur : \`${roleColor(role)}\``,
    `  - Position : \`${role?.position ?? 'inconnue'}\``,
    `  - Options : \`${roleFlags(role)}\``,
  ].join('\n');
}

function getChanges(oldRole, newRole) {
  const changes = [];

  if (oldRole.name !== newRole.name) {
    changes.push(`  - Nom : \`${cleanInline(oldRole.name)}\` -> \`${cleanInline(newRole.name)}\``);
  }

  if (oldRole.hexColor !== newRole.hexColor) {
    changes.push(`  - Couleur : \`${roleColor(oldRole)}\` -> \`${roleColor(newRole)}\``);
  }

  if (oldRole.position !== newRole.position) {
    changes.push(`  - Position : \`${oldRole.position}\` -> \`${newRole.position}\``);
  }

  if (oldRole.hoist !== newRole.hoist) {
    changes.push(`  - Affiché séparément : \`${oldRole.hoist ? 'Oui' : 'Non'}\` -> \`${newRole.hoist ? 'Oui' : 'Non'}\``);
  }

  if (oldRole.mentionable !== newRole.mentionable) {
    changes.push(`  - Mentionnable : \`${oldRole.mentionable ? 'Oui' : 'Non'}\` -> \`${newRole.mentionable ? 'Oui' : 'Non'}\``);
  }

  if (oldRole.permissions?.bitfield !== newRole.permissions?.bitfield) {
    changes.push(...getPermissionDiff(oldRole, newRole));
  }

  return changes.length ? changes.join('\n') : '  - Aucun changement détecté';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildServerRoleLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = ROLE_LOG_META[action] || ROLE_LOG_META.update;
  const changes = action === 'update' ? `\n\n- Changements :\n${getChanges(data.oldRole, data.role)}` : '';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Rôle :\n${formatRoleDetails(data.role)}${changes}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendServerRoleLog(bot, sourceGuildId, action, data) {
  const target = getServerRoleLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildServerRoleLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log rôle serveur ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendServerRoleLog,
};
