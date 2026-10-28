const path = require('node:path');
const { ActivityType } = require('discord.js');
const { buildVariableContext, formatTemplate } = require('../utils/variables');
const { buildNoticePayload } = require('../utils/components');

const muteTimers = new Map();
const lastDeletedMessages = new Map();

async function restoreAutomationState(context) {
  const guildIds = context.accessStore.getAllGuildIds();

  for (const guildId of guildIds) {
    const guild = context.client.guilds.cache.get(guildId) || (await context.client.guilds.fetch(guildId).catch(() => null));
    if (!guild) continue;

    const activeMutes = context.accessStore.getGuildActiveMutes(guildId);
    for (const [userId, muteData] of Object.entries(activeMutes)) {
      if (Number(muteData.expiresAt) <= Date.now()) {
        await unmuteMember(guild, userId, context, { automatic: true, skipLog: false });
        continue;
      }
      scheduleMuteExpiration(context, guildId, userId, muteData.expiresAt);
    }

    const supportSettings = context.accessStore.getGuildSupportSettings(guildId);
    if (supportSettings.enabled && supportSettings.roleId && supportSettings.matchText) {
      await syncSupportRoleForGuild(guild, context);
    }
  }
}

async function handleGuildMemberAdd(member, context) {
  if (!member?.guild || member.user?.bot) return;

  const settings = context.accessStore.getGuildJoinSettings(member.guild.id);
  if (settings.enabled && settings.channelId && settings.message) {
    const channel = member.guild.channels.cache.get(settings.channelId) || (await member.guild.channels.fetch(settings.channelId).catch(() => null));
    if (channel?.isTextBased()) {
      const content = formatTemplate(settings.message, buildVariableContext({ guild: member.guild, targetMember: member }));
      await channel
        .send({
          content,
          allowedMentions: { users: [member.id], roles: [], repliedUser: false }
        })
        .catch(() => null);
    }
  }

  await syncSupportRoleForMember(member, context).catch(() => null);
}

async function maybeHandleBadWords(message, context) {
  if (!message?.guild || message.author?.bot) return false;
  if (String(message.content || '').startsWith(String(context.config.prefix))) return false;
  if (context.accessStore.isSys(message.author.id) || context.accessStore.isOwner(message.guild.id, message.author.id)) return false;

  const settings = context.accessStore.getGuildBadWordsSettings(message.guild.id);
  if (!settings.enabled || !Array.isArray(settings.words) || settings.words.length === 0) return false;

  const rawContent = String(message.content || '');
  const safeContent = rawContent.toLowerCase().trim();

  // Split into tokens using whitespace and punctuation/symbols (Unicode-aware)
  const tokens = safeContent.split(/[[\s\p{P}\p{S}]+/u).filter(Boolean);

  const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  const foundWord = settings.words.find((word) => {
    if (!word) return false;
    const w = String(word).toLowerCase().trim();
    if (!w) return false;

    // Exact full-message match (covers single-letter messages)
    if (safeContent === w) return true;

    // Token exact match (word separated by spaces/punctuation)
    if (tokens.includes(w)) return true;

    // Phrase or fallback: ensure we match whole-word boundaries, not substrings inside longer words
    try {
      const re = new RegExp(`(^|[^\\p{L}\\p{N}_])${escapeRegex(w)}([^\\p{L}\\p{N}_]|$)`, 'iu');
      if (re.test(safeContent)) return true;
    } catch (e) {
      // If regex fails for any reason, fallback to strict token equality only
    }

    return false;
  });

  if (!foundWord) return false;

  await message.delete().catch(() => null);
  await context.logger.log(
    message.guild,
    '# BadWords',
    `> Mot detecte: \`${foundWord}\`\n> Auteur: <@${message.author.id}>\n> Salon: <#${message.channel.id}>`
  );

  return true;
}

async function maybeHandlePicOnly(message, context) {
  if (!message?.guild || message.author?.bot) return false;
  if (String(message.content || '').startsWith(String(context.config.prefix))) return false;
  if (context.accessStore.isSys(message.author.id) || context.accessStore.isOwner(message.guild.id, message.author.id)) return false;

  const picOnlyChannelIds = context.accessStore.getGuildPicOnlyChannelIds(message.guild.id);
  if (!picOnlyChannelIds.includes(String(message.channel.id))) return false;

  const attachments = [...message.attachments.values()];
  const hasImage = attachments.some((attachment) => isImageAttachment(attachment));
  if (hasImage) return false;

  await message.delete().catch(() => null);

  const notice = await message.channel.send(
    buildNoticePayload({
      title: '# PicOnly',
      body: '> Ce salon accepte uniquement des photos.'
    })
  ).catch(() => null);

  if (notice) {
    setTimeout(() => {
      notice.delete().catch(() => null);
    }, 5_000).unref();
  }

  await context.logger.log(
    message.guild,
    '# PicOnly',
    `> Message supprime\n> Auteur: <@${message.author.id}>\n> Salon: <#${message.channel.id}>`
  );

  return true;
}

async function handlePresenceUpdate(oldPresence, newPresence, context) {
  const member = newPresence?.member || oldPresence?.member || null;
  if (!member || member.user?.bot) return;
  await syncSupportRoleForMember(member, context, newPresence || oldPresence).catch(() => null);
}

async function syncSupportRoleForGuild(guild, context) {
  if (!guild) return;
  await guild.members.fetch().catch(() => null);

  const members = guild.members.cache.filter((member) => !member.user.bot);
  for (const member of members.values()) {
    await syncSupportRoleForMember(member, context).catch(() => null);
  }
}

async function syncSupportRoleForMember(member, context, presenceOverride = null) {
  if (!member?.guild || member.user?.bot) return false;

  const settings = context.accessStore.getGuildSupportSettings(member.guild.id);
  if (!settings.roleId) return false;

  const role = member.guild.roles.cache.get(settings.roleId) || (await member.guild.roles.fetch(settings.roleId).catch(() => null));
  if (!role) return false;

  const shouldHaveRole = settings.enabled && settings.matchText
    ? matchSupportNeedle(presenceOverride || member.presence, settings)
    : false;
  const hasRole = member.roles.cache.has(role.id);

  if (shouldHaveRole && !hasRole) {
    await member.roles.add(role, 'Soutien automatique').catch(() => null);
    return true;
  }

  if (!shouldHaveRole && hasRole) {
    await member.roles.remove(role, 'Soutien automatique').catch(() => null);
    return true;
  }

  return false;
}

function matchSupportNeedle(presence, settings) {
  const needle = normalizeText(settings.matchText);
  if (!needle) return false;

  const activities = Array.isArray(presence?.activities) ? presence.activities : [];
  const statusTexts = activities
    .filter((activity) => activity.type === ActivityType.Custom)
    .map((activity) => [activity.state, activity.name, activity.details])
    .flat()
    .map((value) => normalizeText(value))
    .filter(Boolean);

  const activityTexts = activities
    .filter((activity) => activity.type !== ActivityType.Custom)
    .map((activity) => [activity.name, activity.state, activity.details])
    .flat()
    .map((value) => normalizeText(value))
    .filter(Boolean);

  const statusMatch = statusTexts.some((value) => value.includes(needle));
  const activityMatch = activityTexts.some((value) => value.includes(needle));

  if (settings.source === 'activity') return activityMatch;
  if (settings.source === 'both') return statusMatch || activityMatch;
  return statusMatch;
}

async function muteMember(member, context, { durationMs, reason, moderatorId }) {
  const settings = context.accessStore.getGuildMuteSettings(member.guild.id);
  if (!settings.roleId) {
    return { ok: false, reason: 'Aucun role mute configure.' };
  }

  const role = member.guild.roles.cache.get(settings.roleId) || (await member.guild.roles.fetch(settings.roleId).catch(() => null));
  if (!role) {
    return { ok: false, reason: 'Le role mute configure est introuvable.' };
  }

  await member.roles.add(role, `Mute temporaire: ${String(reason || 'Aucune raison').slice(0, 400)}`);

  const expiresAt = Date.now() + durationMs;
  const entry = context.accessStore.setGuildActiveMute(member.guild.id, member.id, {
    expiresAt,
    moderatorId,
    reason,
    roleId: role.id
  });

  scheduleMuteExpiration(context, member.guild.id, member.id, expiresAt);

  return {
    ok: true,
    role,
    expiresAt,
    entry
  };
}

async function unmuteMember(guild, userId, context, options = {}) {
  const safeUserId = String(userId || '').trim();
  if (!guild || !safeUserId) return { ok: false, reason: 'Utilisateur invalide.' };

  const activeMutes = context.accessStore.getGuildActiveMutes(guild.id);
  const entry = activeMutes[safeUserId] || null;
  const muteSettings = context.accessStore.getGuildMuteSettings(guild.id);
  const roleId = entry?.roleId || muteSettings.roleId || null;

  clearMuteTimer(guild.id, safeUserId);
  context.accessStore.deleteGuildActiveMute(guild.id, safeUserId);

  if (!roleId) {
    return { ok: true, removedRole: false, userId: safeUserId };
  }

  const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
  const member = await guild.members.fetch(safeUserId).catch(() => null);

  if (member && role && member.roles.cache.has(role.id)) {
    await member.roles.remove(role, options.automatic ? 'Fin mute automatique' : 'Unmute manuel').catch(() => null);
  }

  if (!options.skipLog) {
    const action = options.automatic ? 'auto-unmute' : 'unmute';
    const moderatorLine = options.moderatorId ? `\n> Auteur: <@${options.moderatorId}>` : '';
    await context.logger.log(
      guild,
      '# Moderation',
      `> Action: ${action}\n> Cible: <@${safeUserId}>${moderatorLine}`
    );
  }

  return {
    ok: true,
    removedRole: Boolean(member && role),
    userId: safeUserId,
    roleId
  };
}

function scheduleMuteExpiration(context, guildId, userId, expiresAt) {
  clearMuteTimer(guildId, userId);

  const delay = Math.max(1_000, Number(expiresAt) - Date.now());
  const key = buildMuteTimerKey(guildId, userId);

  const timeout = setTimeout(async () => {
    clearMuteTimer(guildId, userId);
    const guild = context.client.guilds.cache.get(String(guildId)) || (await context.client.guilds.fetch(String(guildId)).catch(() => null));
    if (!guild) {
      context.accessStore.deleteGuildActiveMute(guildId, userId);
      return;
    }
    await unmuteMember(guild, userId, context, { automatic: true }).catch(() => null);
  }, delay);

  timeout.unref();
  muteTimers.set(key, timeout);
}

function clearMuteTimer(guildId, userId) {
  const key = buildMuteTimerKey(guildId, userId);
  const timeout = muteTimers.get(key);
  if (timeout) {
    clearTimeout(timeout);
    muteTimers.delete(key);
  }
}

function buildMuteTimerKey(guildId, userId) {
  return `${String(guildId)}:${String(userId)}`;
}

function normalizeText(value) {
  return String(value || '').trim().toLowerCase();
}

async function rememberDeletedMessage(message) {
  if (!message?.channelId || !message.guildId || message.author?.bot) return;

  const safeMessage = message.partial ? await message.fetch().catch(() => null) : message;
  if (!safeMessage || !safeMessage.channelId || !safeMessage.guildId) return;

  lastDeletedMessages.set(String(safeMessage.channelId), {
    guildId: String(safeMessage.guildId),
    channelId: String(safeMessage.channelId),
    messageId: String(safeMessage.id),
    authorId: safeMessage.author ? String(safeMessage.author.id) : null,
    content: String(safeMessage.content || '').trim(),
    createdAt: safeMessage.createdTimestamp || Date.now(),
    deletedAt: Date.now(),
    attachments: [...safeMessage.attachments.values()].map((attachment) => ({
      url: String(attachment.url || ''),
      name: String(attachment.name || ''),
      contentType: String(attachment.contentType || '')
    }))
  });
}

function getChannelSnipe(channelId) {
  return lastDeletedMessages.get(String(channelId)) || null;
}

function isImageAttachment(attachment) {
  if (!attachment) return false;
  if (String(attachment.contentType || '').toLowerCase().startsWith('image/')) return true;

  const extension = path.extname(String(attachment.name || attachment.url || '')).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.tiff', '.svg'].includes(extension);
}

module.exports = {
  restoreAutomationState,
  handleGuildMemberAdd,
  maybeHandleBadWords,
  maybeHandlePicOnly,
  handlePresenceUpdate,
  syncSupportRoleForGuild,
  syncSupportRoleForMember,
  muteMember,
  unmuteMember,
  scheduleMuteExpiration,
  rememberDeletedMessage,
  getChannelSnipe
};
