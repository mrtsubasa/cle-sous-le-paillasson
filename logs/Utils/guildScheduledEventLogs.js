const Discord = require('discord.js');
const { getGuildScheduledEventLogTarget } = require('./logsGuildConfig');

const EVENT_META = {
  create: { icon: '✅', title: 'Événement programmé créé', auditType: Discord.AuditLogEvent.GuildScheduledEventCreate },
  delete: { icon: '<:ee:1434328162426294436>', title: 'Événement programmé supprimé', auditType: Discord.AuditLogEvent.GuildScheduledEventDelete },
  update: { icon: '📝', title: 'Événement programmé modifié', auditType: Discord.AuditLogEvent.GuildScheduledEventUpdate },
  user_add: { icon: '✅', title: 'Utilisateur ajouté à un événement programmé' },
  user_remove: { icon: '<:ee:1434328162426294436>', title: "Utilisateur retiré d'un événement programmé" },
};

const ENTITY_TYPES = {
  [Discord.GuildScheduledEventEntityType.StageInstance]: 'Stage',
  [Discord.GuildScheduledEventEntityType.Voice]: 'Vocal',
  [Discord.GuildScheduledEventEntityType.External]: 'Externe',
};

const STATUSES = {
  [Discord.GuildScheduledEventStatus.Scheduled]: 'Planifié',
  [Discord.GuildScheduledEventStatus.Active]: 'Actif',
  [Discord.GuildScheduledEventStatus.Completed]: 'Terminé',
  [Discord.GuildScheduledEventStatus.Canceled]: 'Annulé',
};

const PRIVACY_LEVELS = {
  [Discord.GuildScheduledEventPrivacyLevel.GuildOnly]: 'Serveur uniquement',
};

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value ?? fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function truncate(value, max = 180) {
  const text = cleanInline(value);
  return text.length > max ? `${text.slice(0, max - 3)}...` : text;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatTimestamp(value) {
  const rawTimestamp = value instanceof Date ? value.getTime() : Number(value || 0);
  const timestamp = rawTimestamp > 9999999999 ? Math.floor(rawTimestamp / 1000) : rawTimestamp;
  return timestamp ? `<t:${timestamp}:f>` : '`Aucun`';
}

function formatChannel(event) {
  const channel = event?.channel;
  if (channel?.id) return `<#${channel.id}> (\`${channel.id}\`)`;
  if (event?.channelId) return `\`${event.channelId}\``;
  return '`Aucun`';
}

function formatCreator(event) {
  return event?.creator ? formatUserWithId(event.creator) : (event?.creatorId ? `<@${event.creatorId}> (\`${event.creatorId}\`)` : 'Utilisateur inconnu (`inconnu`)');
}

function eventImageUrl(event) {
  if (typeof event?.coverImageURL === 'function') {
    return event.coverImageURL({ extension: 'png', size: 1024 }) || null;
  }

  if (event?.image && event?.id) {
    return `https://cdn.discordapp.com/guild-events/${event.id}/${event.image}.png?size=1024`;
  }

  return null;
}

function eventInfo(event) {
  return `  - Nom : \`${cleanInline(event?.name, 'Événement inconnu')}\`\n`
    + `  - ID : \`${event?.id || 'inconnu'}\`\n`
    + `  - Description : \`${truncate(event?.description)}\`\n`
    + `  - Type : \`${ENTITY_TYPES[event?.entityType] || `Type ${event?.entityType ?? 'inconnu'}`}\`\n`
    + `  - Statut : \`${STATUSES[event?.status] || `Statut ${event?.status ?? 'inconnu'}`}\`\n`
    + `  - Confidentialité : \`${PRIVACY_LEVELS[event?.privacyLevel] || `Niveau ${event?.privacyLevel ?? 'inconnu'}`}\`\n`
    + `  - Salon : ${formatChannel(event)}\n`
    + `  - Lieu : \`${cleanInline(event?.entityMetadata?.location || event?.location)}\`\n`
    + `  - Créateur : ${formatCreator(event)}\n`
    + `  - Début : ${formatTimestamp(event?.scheduledStartTimestamp || event?.scheduledStartAt)}\n`
    + `  - Fin : ${formatTimestamp(event?.scheduledEndTimestamp || event?.scheduledEndAt)}\n`
    + `  - Utilisateurs intéressés : \`${event?.userCount ?? 0}\``;
}

function addChange(changes, label, before, after) {
  if (before === after) return;
  changes.push(`  - ${label} : \`${truncate(before)}\` -> \`${truncate(after)}\``);
}

function getChanges(oldEvent, newEvent) {
  const changes = [];

  addChange(changes, 'Nom', oldEvent?.name, newEvent?.name);
  addChange(changes, 'Description', oldEvent?.description, newEvent?.description);
  addChange(changes, 'Type', ENTITY_TYPES[oldEvent?.entityType], ENTITY_TYPES[newEvent?.entityType]);
  addChange(changes, 'Statut', STATUSES[oldEvent?.status], STATUSES[newEvent?.status]);
  addChange(changes, 'Confidentialité', PRIVACY_LEVELS[oldEvent?.privacyLevel], PRIVACY_LEVELS[newEvent?.privacyLevel]);
  addChange(changes, 'Salon', oldEvent?.channelId, newEvent?.channelId);
  addChange(changes, 'Lieu', oldEvent?.entityMetadata?.location || oldEvent?.location, newEvent?.entityMetadata?.location || newEvent?.location);
  addChange(changes, 'Début', formatTimestamp(oldEvent?.scheduledStartTimestamp || oldEvent?.scheduledStartAt), formatTimestamp(newEvent?.scheduledStartTimestamp || newEvent?.scheduledStartAt));
  addChange(changes, 'Fin', formatTimestamp(oldEvent?.scheduledEndTimestamp || oldEvent?.scheduledEndAt), formatTimestamp(newEvent?.scheduledEndTimestamp || newEvent?.scheduledEndAt));
  addChange(changes, 'Image', eventImageUrl(oldEvent) || 'Aucune', eventImageUrl(newEvent) || 'Aucune');

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

function buildGuildScheduledEventLog(action, data) {
  const meta = EVENT_META[action] || EVENT_META.update;
  const timestamp = Math.floor(Date.now() / 1000);
  const event = data.event;
  const imageUrl = eventImageUrl(event);
  const updateChanges = action === 'update' ? `\n\n- Changements :\n${getChanges(data.oldEvent, event)}` : '';
  const userLine = data.user ? `\n\n- Utilisateur :\n  - ${formatUserWithId(data.user)}` : '';
  const container = new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor || data.user)}${userLine}\n\n`
        + `- Événement :\n${eventInfo(event)}${updateChanges}`,
      ),
    );

  if (imageUrl) {
    container.addMediaGalleryComponents(
      new Discord.MediaGalleryBuilder().addItems(
        new Discord.MediaGalleryItemBuilder().setURL(imageUrl),
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

async function sendGuildScheduledEventLog(bot, sourceGuildId, action, data) {
  const target = getGuildScheduledEventLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildGuildScheduledEventLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log événement programmé ${action} : ${error?.message || error}`);
  });
}

async function getGuildScheduledEventAuditEntry(guild, eventId, action) {
  const meta = EVENT_META[action];
  if (!meta?.auditType) return null;

  const logs = await guild.fetchAuditLogs({
    type: meta.auditType,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 12000;
    return targetId === eventId && isRecent;
  }) || null;
}

module.exports = {
  getGuildScheduledEventAuditEntry,
  sendGuildScheduledEventLog,
};
