const Discord = require('discord.js');
const { getInviteLogTarget } = require('./logsGuildConfig');

const INVITE_LOG_META = {
  create: {
    icon: '✅',
    title: 'Invitation créée',
  },
  delete: {
    icon: '<:ee:1434328162426294436>',
    title: 'Invitation supprimée',
  },
};

const inviteCache = new Map();
const recentInviteLogs = new Map();

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function formatTimestamp(value) {
  const rawTimestamp = value instanceof Date ? value.getTime() : Number(value || 0);
  const timestamp = rawTimestamp > 9999999999 ? Math.floor(rawTimestamp / 1000) : rawTimestamp;
  return timestamp ? `<t:${timestamp}:f>` : '`Jamais`';
}

function inviteChannel(invite, allowMention = true) {
  const channel = invite?.channel;
  if (allowMention && channel?.id) return `<#${channel.id}> (\`${channel.id}\`)`;
  return `\`${cleanInline(channel?.name, 'Salon inconnu')}\` (\`${channel?.id || 'inconnu'}\`)`;
}

function maxUses(invite) {
  return invite?.maxUses ? String(invite.maxUses) : 'Illimité';
}

function maxAge(invite) {
  if (!invite?.maxAge) return 'Jamais';
  return `${invite.maxAge}s`;
}

function inviteUrl(invite) {
  if (invite?.url) return invite.url;
  if (invite?.code) return `https://discord.gg/${invite.code}`;
  return 'Aucun';
}

function inviteChannelId(invite) {
  return invite?.channelId || invite?.channel?.id || '';
}

function auditChangeValue(auditEntry, keys) {
  const changes = [...(auditEntry?.changes?.values?.() || auditEntry?.changes || [])];
  const change = changes.find((item) => keys.includes(item?.key));
  return change?.new ?? change?.old ?? null;
}

function formatRoleValue(value, guild) {
  const values = value?.values && typeof value.values === 'function'
    ? [...value.values()]
    : Array.isArray(value) ? value : [value].filter(Boolean);
  const roles = values
    .flatMap((item) => {
      if (typeof item === 'string') return item.split(',').map((roleId) => roleId.trim());
      if (typeof item === 'number') return [String(item)];
      if (typeof item === 'object' && item?.id) return [item.id];
      return [];
    })
    .filter(Boolean);

  if (!roles.length) return '`Aucun`';

  return roles.map((roleId) => {
    const role = guild?.roles?.cache?.get(roleId);
    return role ? `\`${cleanInline(role.name)}\` (\`${role.id}\`)` : `\`${roleId}\``;
  }).join(', ');
}

function inviteRoles(invite, data) {
  const roleValue = invite?.roles
    || invite?.roleIds
    || invite?.roleId
    || auditChangeValue(data.auditEntry, ['roles', 'role_ids', 'roleIds', 'role_id', 'roleId']);

  return formatRoleValue(roleValue, invite?.guild);
}

function temporaryStatus(invite, data) {
  const value = invite?.temporary ?? auditChangeValue(data.auditEntry, ['temporary']);
  return value ? 'Oui' : 'Non';
}

function snapshotInvite(invite) {
  return {
    code: invite?.code || '',
    url: inviteUrl(invite),
    channel: invite?.channel || null,
    channelId: inviteChannelId(invite),
    guild: invite?.guild || null,
    guildId: invite?.guild?.id || invite?.guildId || '',
    inviter: invite?.inviter || null,
    inviterId: invite?.inviter?.id || '',
    uses: invite?.uses ?? 0,
    maxUses: invite?.maxUses || 0,
    maxAge: invite?.maxAge || 0,
    expiresTimestamp: invite?.expiresTimestamp || invite?.expiresAt?.getTime?.() || 0,
    expiresAt: invite?.expiresAt || null,
    temporary: Boolean(invite?.temporary),
  };
}

function snapshotInvites(invites) {
  const next = new Map();
  for (const invite of invites?.values?.() || []) {
    if (invite?.code) next.set(invite.code, snapshotInvite(invite));
  }
  return next;
}

function mergeInvite(invite, fullInvite, auditEntry) {
  const base = snapshotInvite(fullInvite || invite);
  const fallback = snapshotInvite(invite);

  return {
    ...fallback,
    ...base,
    channel: base.channel || fallback.channel,
    guild: base.guild || fallback.guild,
    inviter: base.inviter || fallback.inviter || auditEntry?.executor || null,
    inviterId: base.inviterId || fallback.inviterId || auditEntry?.executor?.id || '',
  };
}

async function fetchGuildInvites(guild) {
  if (typeof guild?.invites?.fetch !== 'function') return null;
  return guild.invites.fetch().catch(() => null);
}

async function getFullInvite(invite) {
  const invites = await fetchGuildInvites(invite?.guild);
  if (!invites) return invite;

  const guildId = invite?.guild?.id || invite?.guildId;
  if (guildId) inviteCache.set(guildId, snapshotInvites(invites));

  return invites.get(invite?.code) || invite;
}

function auditTargetCode(auditEntry) {
  return auditEntry?.target?.code || auditEntry?.targetId || '';
}

function auditTargetChannelId(auditEntry) {
  return auditEntry?.target?.channelId || auditEntry?.target?.channel?.id || '';
}

async function getInviteAuditEntry(guild, invite, action) {
  const type = action === 'delete'
    ? Discord.AuditLogEvent.InviteDelete
    : Discord.AuditLogEvent.InviteCreate;
  const inviteCode = invite?.code || '';
  const channelId = inviteChannelId(invite);

  const logs = await guild.fetchAuditLogs({
    type,
    limit: 8,
  }).catch(() => null);

  const entries = [...(logs?.entries?.values?.() || [])]
    .filter((auditEntry) => Date.now() - auditEntry.createdTimestamp < 15000);

  return entries.find((auditEntry) => auditTargetCode(auditEntry) === inviteCode)
    || entries.find((auditEntry) => channelId && auditTargetChannelId(auditEntry) === channelId)
    || entries[0]
    || null;
}

async function resolveInviteLogData(invite, action) {
  if (!invite?.guild) return null;

  const cachedInvite = inviteCache.get(invite.guild.id)?.get(invite.code);
  const fullInvite = action === 'create' ? await getFullInvite(invite) : (cachedInvite || invite);
  const auditEntry = await getInviteAuditEntry(invite.guild, fullInvite || invite, action);
  const resolvedInvite = mergeInvite(invite, fullInvite, auditEntry);

  if (action === 'delete') {
    const cache = inviteCache.get(invite.guild.id);
    if (cache) cache.delete(invite.code);
  }

  if (action === 'create') {
    const cache = inviteCache.get(invite.guild.id) || new Map();
    cache.set(resolvedInvite.code, resolvedInvite);
    inviteCache.set(invite.guild.id, cache);
  }

  return {
    executor: auditEntry?.executor || resolvedInvite.inviter,
    creator: resolvedInvite.inviter || auditEntry?.executor,
    auditEntry,
    invite: resolvedInvite,
  };
}

async function initializeInviteCache(bot) {
  const guilds = bot?.guilds?.cache;
  if (!guilds) return;

  await Promise.allSettled(guilds.map(async (guild) => {
    const invites = await fetchGuildInvites(guild);
    if (invites) inviteCache.set(guild.id, snapshotInvites(invites));
  }));
}

async function scanInviteChanges(bot) {
  const guilds = bot?.guilds?.cache;
  if (!guilds) return;

  await Promise.allSettled(guilds.map(async (guild) => {
    const invites = await fetchGuildInvites(guild);
    if (!invites) return;

    const previous = inviteCache.get(guild.id);
    const current = snapshotInvites(invites);

    if (!previous) {
      inviteCache.set(guild.id, current);
      return;
    }

    for (const [code, invite] of current.entries()) {
      if (previous.has(code)) continue;

      const auditEntry = await getInviteAuditEntry(guild, invite, 'create');
      const resolvedInvite = mergeInvite(invite, invite, auditEntry);

      await sendInviteLog(bot, guild.id, 'create', {
        executor: auditEntry?.executor || resolvedInvite.inviter,
        creator: resolvedInvite.inviter || auditEntry?.executor,
        auditEntry,
        invite: resolvedInvite,
      });
    }

    for (const [code, invite] of previous.entries()) {
      if (current.has(code)) continue;

      const auditEntry = await getInviteAuditEntry(guild, invite, 'delete');
      const resolvedInvite = mergeInvite(invite, invite, auditEntry);

      await sendInviteLog(bot, guild.id, 'delete', {
        executor: auditEntry?.executor || resolvedInvite.inviter,
        creator: resolvedInvite.inviter || auditEntry?.executor,
        auditEntry,
        invite: resolvedInvite,
      });
    }

    inviteCache.set(guild.id, current);
  }));
}

async function getLogChannel(bot, target) {
  const destinationGuild = bot.guilds.cache.get(target.secondaryGuildId)
    || await bot.guilds.fetch(target.secondaryGuildId).catch(() => null);
  if (!destinationGuild) return null;

  const logChannel = destinationGuild.channels.cache.get(target.channelId)
    || await destinationGuild.channels.fetch(target.channelId).catch(() => null);

  return logChannel?.isTextBased?.() ? logChannel : null;
}

function buildInviteLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = INVITE_LOG_META[action] || INVITE_LOG_META.create;
  const invite = data.invite;

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor || invite?.inviter)}\n\n`
        + `- Invitation :\n`
        + `  - Code : \`${cleanInline(invite?.code, 'inconnu')}\`\n`
        + `  - Lien : \`${cleanInline(inviteUrl(invite))}\`\n`
        + `  - Salon : ${inviteChannel(invite, action !== 'delete')}\n`
        + `  - Créateur : ${formatUserWithId(data.creator || invite?.inviter || data.executor)}\n`
        + `  - Utilisations : \`${invite?.uses ?? 0}\`\n`
        + `  - Nombre maximum d'utilisations : \`${maxUses(invite)}\`\n`
        + `  - Rôles : ${inviteRoles(invite, data)}\n`
        + `  - Expire : ${formatTimestamp(invite?.expiresTimestamp || invite?.expiresAt)}\n`
        + `  - Durée : \`${maxAge(invite)}\`\n`
        + `  - Statut de membre provisoire : \`${temporaryStatus(invite, data)}\``,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendInviteLog(bot, sourceGuildId, action, data) {
  const dedupeKey = `${sourceGuildId}:${action}:${data?.invite?.code || 'unknown'}`;
  const now = Date.now();
  const previousLogAt = recentInviteLogs.get(dedupeKey) || 0;
  if (now - previousLogAt < 10000) return;
  recentInviteLogs.set(dedupeKey, now);

  const target = getInviteLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildInviteLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log invitation ${action} : ${error?.message || error}`);
  });
}

module.exports = {
  initializeInviteCache,
  resolveInviteLogData,
  scanInviteChanges,
  sendInviteLog,
};
