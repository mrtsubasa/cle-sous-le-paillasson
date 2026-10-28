const Discord = require('discord.js');
const { getWebhookLogTarget } = require('./logsGuildConfig');

const WEBHOOK_LOG_META = {
  create: {
    icon: '✅',
    title: 'Webhook créé',
    auditType: Discord.AuditLogEvent.WebhookCreate,
  },
  delete: {
    icon: '<:ee:1434328162426294436>',
    title: 'Webhook supprimé',
    auditType: Discord.AuditLogEvent.WebhookDelete,
  },
  update: {
    icon: '📝',
    title: 'Webhook modifié',
    auditType: Discord.AuditLogEvent.WebhookUpdate,
  },
};

const WEBHOOK_TYPE_NAMES = {
  [Discord.WebhookType.Incoming]: 'Incoming',
  [Discord.WebhookType.ChannelFollower]: 'Channel follower',
  [Discord.WebhookType.Application]: 'Application',
};

const webhookCache = new Map();

function cleanInline(value, fallback = 'Aucun') {
  const text = String(value || fallback).replace(/`/g, "'").trim();
  return text || fallback;
}

function formatUserWithId(user) {
  return user?.id ? `<@${user.id}> (\`${user.id}\`)` : 'Utilisateur inconnu (`inconnu`)';
}

function webhookType(webhook) {
  return WEBHOOK_TYPE_NAMES[webhook?.type] || `Type ${webhook?.type ?? 'inconnu'}`;
}

function webhookAvatar(webhook) {
  if (typeof webhook?.avatarURL === 'function') {
    return webhook.avatarURL({ extension: 'png', size: 256 }) || 'Aucun';
  }

  if (webhook?.avatar && webhook?.id) {
    return `https://cdn.discordapp.com/avatars/${webhook.id}/${webhook.avatar}.png?size=256`;
  }

  return 'Aucun';
}

function snapshotWebhook(webhook, channelId) {
  return {
    id: webhook?.id || '',
    name: webhook?.name || 'Webhook inconnu',
    type: webhook?.type ?? null,
    channelId: webhook?.channelId || channelId || '',
    guildId: webhook?.guildId || '',
    ownerId: webhook?.owner?.id || webhook?.user?.id || '',
    applicationId: webhook?.applicationId || '',
    avatar: webhook?.avatar || '',
    avatarUrl: webhookAvatar(webhook),
  };
}

function snapshotCollection(webhooks, channelId) {
  const next = new Map();
  for (const webhook of webhooks?.values?.() || []) {
    next.set(webhook.id, snapshotWebhook(webhook, channelId));
  }
  return next;
}

function sameWebhook(oldWebhook, newWebhook) {
  return oldWebhook?.name === newWebhook?.name
    && oldWebhook?.avatar === newWebhook?.avatar
    && oldWebhook?.channelId === newWebhook?.channelId;
}

function webhookInfo(webhook, channel, allowMention = true) {
  const channelLine = allowMention && channel?.id
    ? `  - Salon : <#${channel.id}> (\`${channel.id}\`)\n`
    : `  - Salon : \`${cleanInline(channel?.name, 'Salon inconnu')}\` (\`${channel?.id || webhook?.channelId || 'inconnu'}\`)\n`;

  return `  - Nom : \`${cleanInline(webhook?.name, 'Webhook inconnu')}\`\n`
    + `  - ID : \`${webhook?.id || 'inconnu'}\`\n`
    + channelLine
    + `  - Type : \`${webhookType(webhook)}\`\n`
    + `  - Owner : ${webhook?.ownerId ? `<@${webhook.ownerId}> (\`${webhook.ownerId}\`)` : 'Inconnu (`inconnu`)'}\n`
    + `  - Application : \`${webhook?.applicationId || 'Aucune'}\`\n`
    + `  - Avatar : \`${cleanInline(webhook?.avatarUrl)}\``;
}

function getChanges(oldWebhook, newWebhook) {
  const changes = [];

  if (oldWebhook.name !== newWebhook.name) {
    changes.push(`  - Nom : \`${cleanInline(oldWebhook.name)}\` -> \`${cleanInline(newWebhook.name)}\``);
  }

  if (oldWebhook.avatar !== newWebhook.avatar) {
    changes.push(`  - Avatar : \`${cleanInline(oldWebhook.avatarUrl)}\` -> \`${cleanInline(newWebhook.avatarUrl)}\``);
  }

  if (oldWebhook.channelId !== newWebhook.channelId) {
    changes.push(`  - Salon : \`${oldWebhook.channelId || 'inconnu'}\` -> \`${newWebhook.channelId || 'inconnu'}\``);
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

async function getWebhookAuditEntry(guild, webhookId, action) {
  const meta = WEBHOOK_LOG_META[action] || WEBHOOK_LOG_META.update;
  const logs = await guild.fetchAuditLogs({
    type: meta.auditType,
    limit: 8,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 15000;
    return targetId === webhookId && isRecent;
  }) || null;
}

function buildWebhookLog(action, data) {
  const timestamp = Math.floor(Date.now() / 1000);
  const meta = WEBHOOK_LOG_META[action] || WEBHOOK_LOG_META.update;
  const changes = action === 'update' ? `\n\n- Changements :\n${getChanges(data.oldWebhook, data.webhook)}` : '';

  return new Discord.ContainerBuilder()
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(
        `${meta.icon} **${meta.title} !**\n\n`
        + `- Auteur :\n  - ${formatUserWithId(data.executor)}\n\n`
        + `- Webhook :\n${webhookInfo(data.webhook, data.channel, action !== 'delete')}${changes}`,
      ),
    )
    .addSeparatorComponents(
      new Discord.SeparatorBuilder().setSpacing(Discord.SeparatorSpacingSize.Small).setDivider(true),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`-# <t:${timestamp}:f>`),
    );
}

async function sendWebhookLog(bot, sourceGuildId, action, data) {
  const target = getWebhookLogTarget(bot, sourceGuildId, action);
  if (!target) return;

  const logChannel = await getLogChannel(bot, target);
  if (!logChannel) return;

  await logChannel.send({
    flags: Discord.MessageFlags.IsComponentsV2,
    components: [buildWebhookLog(action, data)],
    allowedMentions: { parse: [] },
  }).catch((error) => {
    console.error(`Erreur log webhook ${action} : ${error?.message || error}`);
  });
}

async function fetchChannelWebhooks(channel) {
  if (typeof channel?.fetchWebhooks !== 'function') return null;
  return channel.fetchWebhooks().catch(() => null);
}

async function handleWebhooksUpdate(bot, channel) {
  if (!channel?.guild) return;

  const currentWebhooks = await fetchChannelWebhooks(channel);
  if (!currentWebhooks) return;

  const cacheKey = `${channel.guild.id}:${channel.id}`;
  const previous = webhookCache.get(cacheKey);
  const current = snapshotCollection(currentWebhooks, channel.id);
  webhookCache.set(cacheKey, current);

  if (!previous) {
    const auditEntry = await getLatestWebhookAuditEntry(channel.guild, channel.id, current);
    if (!auditEntry) return;

    const action = auditAction(auditEntry.action);
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const webhook = current.get(targetId) || snapshotWebhook(auditEntry.target, channel.id);
    if (!action || !webhook?.id) return;

    await sendWebhookLog(bot, channel.guild.id, action, {
      executor: auditEntry.executor,
      webhook,
      channel,
    });
    return;
  }

  for (const [webhookId, webhook] of current.entries()) {
    if (!previous.has(webhookId)) {
      const auditEntry = await getWebhookAuditEntry(channel.guild, webhookId, 'create');
      await sendWebhookLog(bot, channel.guild.id, 'create', {
        executor: auditEntry?.executor,
        webhook,
        channel,
      });
    }
  }

  for (const [webhookId, webhook] of previous.entries()) {
    if (!current.has(webhookId)) {
      const auditEntry = await getWebhookAuditEntry(channel.guild, webhookId, 'delete');
      await sendWebhookLog(bot, channel.guild.id, 'delete', {
        executor: auditEntry?.executor,
        webhook,
        channel,
      });
    }
  }

  for (const [webhookId, webhook] of current.entries()) {
    const oldWebhook = previous.get(webhookId);
    if (!oldWebhook || sameWebhook(oldWebhook, webhook)) continue;

    const auditEntry = await getWebhookAuditEntry(channel.guild, webhookId, 'update');
    await sendWebhookLog(bot, channel.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldWebhook,
      webhook,
      channel,
    });
  }
}

function auditAction(auditLogAction) {
  if (auditLogAction === Discord.AuditLogEvent.WebhookCreate) return 'create';
  if (auditLogAction === Discord.AuditLogEvent.WebhookDelete) return 'delete';
  if (auditLogAction === Discord.AuditLogEvent.WebhookUpdate) return 'update';
  return null;
}

async function getLatestWebhookAuditEntry(guild, channelId, current) {
  const logs = await guild.fetchAuditLogs({ limit: 8 }).catch(() => null);
  return logs?.entries?.find((auditEntry) => {
    const action = auditAction(auditEntry.action);
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const targetChannelId = auditEntry.target?.channelId;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 15000;
    const isSameChannel = targetChannelId ? targetChannelId === channelId : current.has(targetId);
    return action && isRecent && isSameChannel;
  }) || null;
}

module.exports = {
  handleWebhooksUpdate,
  sendWebhookLog,
};
