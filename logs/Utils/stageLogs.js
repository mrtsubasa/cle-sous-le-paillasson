const Discord = require('discord.js');
const { getStageLogTarget } = require('./logsGuildConfig');

const STAGE_LOG_META = {
  create: {
    icon: '✅',
    title: 'Stage créé',
  },
  delete: {
    icon: '<:ee:1434328162426294436>',
    title: 'Stage supprimé',
  },
  update: {
    icon: '📝',
    title: 'Stage modifié',
  },
};

const PRIVACY_LEVELS = {
  [Discord.StageInstancePrivacyLevel?.Public]: 'Public',
  [Discord.StageInstancePrivacyLevel?.GuildOnly]: 'Serveur uniquement',
};

const STAGE_MODERATOR_PERMISSIONS = [
  Discord.PermissionFlagsBits.ManageChannels,
  Discord.PermissionFlagsBits.MuteMembers,
  Discord.PermissionFlagsBits.MoveMembers,
];

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatChannel(stageInstance) {
  const channelId = stageInstance?.channelId || stageInstance?.id;
  const channel = stageInstance?.guild?.channels?.cache?.get(stageInstance?.channelId) || stageInstance;
  if (channel?.name) return `<#${channel.id}> (\`${cleanInline(channel.name)}\`)`;
  return channelId ? `<#${channelId}>` : 'Salon inconnu';
}

function formatPrivacy(stageInstance) {
  return PRIVACY_LEVELS[stageInstance?.privacyLevel] || `Niveau ${stageInstance?.privacyLevel ?? 'inconnu'}`;
}

function formatScheduledEvent(stageInstance) {
  return stageInstance?.guildScheduledEventId
    ? `\`${stageInstance.guildScheduledEventId}\``
    : '`Aucun`';
}

function formatParent(channel) {
  return cleanInline(channel?.parent?.name || channel?.parentId, 'Aucune');
}

function hasStageModeratorPermission(overwrite) {
  return STAGE_MODERATOR_PERMISSIONS.some((permission) => overwrite?.allow?.has?.(permission));
}

function formatStageModerators(channel) {
  const roleLines = [];
  const userLines = [];

  for (const overwrite of channel?.permissionOverwrites?.cache?.values?.() || []) {
    if (!hasStageModeratorPermission(overwrite)) continue;
    if (overwrite.id === channel.guild?.id) continue;

    if (overwrite.type === Discord.OverwriteType.Role) {
      const role = channel.guild?.roles?.cache?.get(overwrite.id);
      roleLines.push(`    - \`${cleanInline(role?.name, 'Rôle inconnu')}\` (\`${overwrite.id}\`)`);
      continue;
    }

    if (overwrite.type === Discord.OverwriteType.Member) {
      const member = channel.guild?.members?.cache?.get(overwrite.id);
      const user = member?.user || channel.client?.users?.cache?.get(overwrite.id);
      userLines.push(`    - ${user?.id ? `<@${user.id}>` : 'Utilisateur inconnu'} (\`${overwrite.id}\`)`);
    }
  }

  return `  - Rôles modérateurs :\n${roleLines.length ? roleLines.join('\n') : '    - `Aucun`'}\n`
    + `  - Utilisateurs modérateurs :\n${userLines.length ? userLines.join('\n') : '    - `Aucun`'}`;
}

function stageInstanceInfo(stageInstance) {
  return `  - Sujet : \`${cleanInline(stageInstance?.topic, 'Aucun sujet')}\`\n`
    + `  - ID : \`${stageInstance?.id || 'inconnu'}\`\n`
    + `  - Salon : ${formatChannel(stageInstance)}\n`
    + `  - Confidentialité : \`${formatPrivacy(stageInstance)}\`\n`
    + `  - Évènement lié : ${formatScheduledEvent(stageInstance)}`;
}

function stageChannelInfo(channel) {
  return `  - Nom : \`${cleanInline(channel?.name, 'Salon inconnu')}\`\n`
    + `  - ID : \`${channel?.id || 'inconnu'}\`\n`
    + `  - Salon : ${formatChannel(channel)}\n`
    + `  - Catégorie : \`${formatParent(channel)}\`\n`
    + `  - Position : \`${channel?.position ?? 'inconnue'}\`\n`
    + `  - Bitrate : \`${channel?.bitrate || 'Aucun'}\`\n`
    + `  - Limite vocal : \`${channel?.userLimit || 'Aucune'}\`\n`
    + formatStageModerators(channel);
}

function stageInfo(data) {
  if (data.stageChannel) return stageChannelInfo(data.stageChannel);
  return stageInstanceInfo(data.stageInstance);
}

function getInstanceChanges(oldStageInstance, newStageInstance) {
  const changes = [];

  if (oldStageInstance.topic !== newStageInstance.topic) {
    changes.push(`  - Sujet : \`${cleanInline(oldStageInstance.topic, 'Aucun')}\` -> \`${cleanInline(newStageInstance.topic, 'Aucun')}\``);
  }

  if (oldStageInstance.privacyLevel !== newStageInstance.privacyLevel) {
    changes.push(`  - Confidentialité : \`${formatPrivacy(oldStageInstance)}\` -> \`${formatPrivacy(newStageInstance)}\``);
  }

  if (oldStageInstance.guildScheduledEventId !== newStageInstance.guildScheduledEventId) {
    changes.push(`  - Évènement lié : ${formatScheduledEvent(oldStageInstance)} -> ${formatScheduledEvent(newStageInstance)}`);
  }

  if (oldStageInstance.channelId !== newStageInstance.channelId) {
    changes.push(`  - Salon : ${formatChannel(oldStageInstance)} -> ${formatChannel(newStageInstance)}`);
  }

  return changes.length ? changes.join('\n') : '';
}

function getChannelChanges(oldChannel, newChannel) {
  const changes = [];

  if (oldChannel.name !== newChannel.name) {
    changes.push(`  - Nom : \`${cleanInline(oldChannel.name, 'Salon inconnu')}\` -> \`${cleanInline(newChannel.name, 'Salon inconnu')}\``);
  }

  if (oldChannel.parentId !== newChannel.parentId) {
    changes.push(`  - Catégorie : \`${formatParent(oldChannel)}\` -> \`${formatParent(newChannel)}\``);
  }

  if (oldChannel.position !== newChannel.position) {
    changes.push(`  - Position : \`${oldChannel.position ?? 'inconnue'}\` -> \`${newChannel.position ?? 'inconnue'}\``);
  }

  if (oldChannel.bitrate !== newChannel.bitrate) {
    changes.push(`  - Bitrate : \`${oldChannel.bitrate || 'Aucun'}\` -> \`${newChannel.bitrate || 'Aucun'}\``);
  }

  if (oldChannel.userLimit !== newChannel.userLimit) {
    changes.push(`  - Limite vocal : \`${oldChannel.userLimit || 'Aucune'}\` -> \`${newChannel.userLimit || 'Aucune'}\``);
  }

  if (oldChannel.rtcRegion !== newChannel.rtcRegion) {
    changes.push(`  - Région RTC : \`${cleanInline(oldChannel.rtcRegion, 'Automatique')}\` -> \`${cleanInline(newChannel.rtcRegion, 'Automatique')}\``);
  }

  return changes.length ? changes.join('\n') : '';
}

function getChanges(data) {
  if (data.oldStageChannel && data.stageChannel) {
    return getChannelChanges(data.oldStageChannel, data.stageChannel);
  }

  if (data.oldStageInstance && data.stageInstance) {
    return getInstanceChanges(data.oldStageInstance, data.stageInstance);
  }

  return '';
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildStageLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = STAGE_LOG_META[action] || STAGE_LOG_META.update;
  const changes = action === 'update' ? getChanges(data) : '';
  const changesText = changes ? `\n\n- Changements :\n${changes}` : '';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Stage :\n${stageInfo(data)}${changesText}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendStageLog(bot, sourceGuildId, action, data) {
  const target = getStageLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  if (action === 'update' && !getChanges(data)) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildStageLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log stage ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  sendStageLog,
};
