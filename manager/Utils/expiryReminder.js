const Discord = require('discord.js');
const path = require('path');
const config = require('../config.json');
const buildPanel = require('./buildPanel');
const { readJsonConfig } = require('./tokenVault');
const { getInterestedUserIdsFromRow } = require('./clientRoleManager');
const { getLogChannelId } = require('./logChannels');

function normalizeUnixTime(value) {
  const raw = Number(value);
  if (!Number.isFinite(raw)) return null;

  if (raw > 1e12) {
    return Math.floor(raw / 1000);
  }

  return Math.floor(raw);
}

function getReminderLeadSeconds() {
  if (config.expiryReminderEnabled === false) {
    return null;
  }

  const days = Number(config.expiryReminderDays);
  if (Number.isFinite(days) && days > 0) {
    return Math.floor(days * 24 * 60 * 60);
  }

  const hours = Number(config.expiryReminderHours);
  if (Number.isFinite(hours) && hours > 0) {
    return Math.floor(hours * 60 * 60);
  }

  return 3 * 24 * 60 * 60;
}

function formatRemainingTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const days = Math.floor(total / 86400);
  const hours = Math.floor((total % 86400) / 3600);
  const minutes = Math.floor((total % 3600) / 60);

  const parts = [];

  if (days > 0) {
    parts.push(`${days} jour${days > 1 ? 's' : ''}`);
  }

  if (hours > 0) {
    parts.push(`${hours} heure${hours > 1 ? 's' : ''}`);
  }

  if (minutes > 0 && parts.length < 2) {
    parts.push(`${minutes} minute${minutes > 1 ? 's' : ''}`);
  }

  if (parts.length === 0) {
    return 'moins d\'1 minute';
  }

  return parts.join(' ');
}

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getBotConfig(storageId) {
  const configPath = path.join(__dirname, '..', 'BotRuntimes', storageId, 'config.json');
  return readJsonConfig(configPath, { migrateToken: false });
}

function getReminderRecipients(row) {
  const storageId = getBotStorageId(row);
  const botConfig = getBotConfig(storageId);
  const recipients = new Set(getInterestedUserIdsFromRow(row, botConfig));

  return [...recipients];
}

function buildReminderPanel(botId, botName, remainingSeconds, expiresAtUnix) {
  const displayName = botName && botName !== botId ? botName : botId;
  const container = buildPanel('# Ton bot expire bientôt', [
    `> **Le bot ${displayName}** (\`${botId}\`) expire dans **${formatRemainingTime(remainingSeconds)}**`,
    `> **Expiration:** <t:${expiresAtUnix}:F> (<t:${expiresAtUnix}:R>)`,
    '> *Renouvelle-le avant la fin pour garder ton bot actif*',
    '> *Tu peux utiliser la commande `/updatebot` ou contacter le support si besoin*',
  ]);

  container.addActionRowComponents(
    new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder()
        .setLabel('Ouvrir un ticket')
        .setStyle(Discord.ButtonStyle.Link)
        .setURL('https://discord.gg/nYApyw6mXR')
        .setEmoji('<:tickets:1503489867961729065>')
    )
  );

  return container;
}

function buildReminderLogPanel(botId, botName, remainingSeconds, expiresAtUnix, sentTo = []) {
  const displayName = botName && botName !== botId ? botName : botId;
  const recipients = sentTo.length > 0
    ? sentTo.map((userId) => `<@${userId}>`).join(', ')
    : 'aucun destinataire';

  return buildPanel('# Rappel expiration', [
    `> **Bot:** ${displayName} (\`${botId}\`)`,
    `> **Expiration:** <t:${expiresAtUnix}:F> (<t:${expiresAtUnix}:R>)`,
    `> **Temps restant:** ${formatRemainingTime(remainingSeconds)}`,
    `> **Envoyé à:** ${recipients}`,
  ]);
}

function shouldSendReminder(row, nowUnix, reminderLeadSeconds) {
  if (!row || row.expired === 'true') return false;
  if (!Number.isFinite(reminderLeadSeconds) || reminderLeadSeconds <= 0) return false;

  const expiresAt = normalizeUnixTime(row.time);
  if (expiresAt === null) return false;

  const remainingSeconds = expiresAt - nowUnix;
  if (remainingSeconds <= 0) return false;

  return remainingSeconds <= reminderLeadSeconds && String(row.reminderSent) !== 'true';
}

async function markReminderSent(bot, botId) {
  bot.db.prepare('UPDATE bot SET reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(
    'true',
    String(Math.floor(Date.now() / 1000)),
    botId
  );
}

async function resetReminderState(bot, botId) {
  bot.db.prepare('UPDATE bot SET reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(
    'false',
    null,
    botId
  );
}

async function sendExpiryReminder(bot, row, options = {}) {
  const botId = String(row?.botId || '');
  const expiresAtUnix = normalizeUnixTime(row?.time);
  const nowUnix = Math.floor(Date.now() / 1000);

  if (!botId || expiresAtUnix === null) {
    return { sentTo: [], skipped: true, reason: 'invalid_row' };
  }

  const remainingSeconds = options.remainingSeconds ?? Math.max(0, expiresAtUnix - nowUnix);
  if (remainingSeconds <= 0) {
    return { sentTo: [], skipped: true, reason: 'already_expired' };
  }

  const recipients = options.recipients || getReminderRecipients(row);
  if (recipients.length === 0) {
    return { sentTo: [], skipped: true, reason: 'no_recipients' };
  }

  const botUser = options.botUser || await bot.users.fetch(botId).catch(() => null);
  const botName = options.botName || botUser?.username || botId;
  const payload = {
    components: [buildReminderPanel(botId, botName, remainingSeconds, expiresAtUnix)],
    allowedMentions: { parse: [] },
    flags: Discord.MessageFlags.IsComponentsV2,
  };

  await markReminderSent(bot, botId);

  const sentTo = [];

  for (const userId of recipients) {
    const user = bot.users.cache.get(userId) || await bot.users.fetch(userId).catch(() => null);
    if (!user) continue;

    const userLabel = user.tag || user.username ? `${user.username || user.tag} (${user.id})` : userId;
    console.log(`[REMINDER] DM expiration vers ${userLabel} pour ${botId}`);
    await user.send(payload).catch((error) => {
      console.log(`[REMINDER] DM impossible vers ${userId} pour ${botId}: ${error.message}`);
    });
    sentTo.push(userId);
  }

  console.log(`[REMINDER] Rappel envoyé pour ${botId} vers ${sentTo.length} utilisateur(s)`);

  const logChannelId = getLogChannelId('reminderLogs', ['expiryReminderLogs']);
  if (logChannelId) {
    const logChannel = bot.channels.cache.get(logChannelId);
    if (logChannel) {
      const logPanel = buildReminderLogPanel(botId, botName, remainingSeconds, expiresAtUnix, sentTo);
      await logChannel.send({
        components: [logPanel],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2,
      }).catch((error) => {
        console.log(`[REMINDER] Log impossible pour ${botId}: ${error.message}`);
      });
    }
  }

  return { sentTo, skipped: false };
}

module.exports = {
  buildReminderPanel,
  buildReminderLogPanel,
  formatRemainingTime,
  getReminderLeadSeconds,
  getReminderRecipients,
  markReminderSent,
  normalizeUnixTime,
  resetReminderState,
  sendExpiryReminder,
  shouldSendReminder,
};
