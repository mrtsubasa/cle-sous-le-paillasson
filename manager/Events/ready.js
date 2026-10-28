const path = require('path');
const loadSlashCommands = require('../Handlers/slashcommand');
const Discord = require('discord.js');
const config = require('../config.json');
const buildExpiredPanel = require('../Utils/buildExpiredPanel');
const { readJsonConfig } = require('../Utils/tokenVault');
const { fetchUser, getFallbackUser } = require('../Utils/discordLookup');
const { getCurrentOwnerIdFromRow, getInterestedUserIdsFromRow, syncAllClientRoles, syncClientRoleForUsers } = require('../Utils/clientRoleManager');
const { getRuntimeConfigPath } = require('../Utils/templateRuntime');
const { getLogChannelId } = require('../Utils/logChannels');
const {
  getReminderLeadSeconds,
  normalizeUnixTime,
  sendExpiryReminder,
  shouldSendReminder,
} = require('../Utils/expiryReminder');

let lifecycleSweepRunning = false;

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getBotUserIdsForRow(row) {
  const botStorageId = getBotStorageId(row);
  const botConfigPath = getRuntimeConfigPath(botStorageId);
  const botConfig = readJsonConfig(botConfigPath, { migrateToken: false });
  return getInterestedUserIdsFromRow(row, botConfig);
}

function getCurrentOwnerForRow(row) {
  const botStorageId = getBotStorageId(row);
  const botConfigPath = getRuntimeConfigPath(botStorageId);
  const botConfig = readJsonConfig(botConfigPath, { migrateToken: false });
  return getCurrentOwnerIdFromRow(row, botConfig);
}

async function stopExpiredBot(bot, row) {
  const botId = String(row?.botId || '');
  const botStorageId = getBotStorageId(row);
  const ownerId = getCurrentOwnerForRow(row);
  const botUser = await fetchUser(bot, botId);
  const botName = botUser?.username || botId;

  require('../Utils/lauchChildProcess')(
    `./BotRuntimes/${botStorageId}/index.js`,
    'stop',
    botUser || { id: botId, username: botName },
    bot
  );

  bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);

  const roleUserIds = getBotUserIdsForRow(row);
  await syncClientRoleForUsers(bot, roleUserIds).catch((error) => {
    console.log(`[MANAGER] Sync role après expiration échouée pour ${botId}: ${error.message}`);
  });

  const expiredPanel = buildExpiredPanel(botId, botName);
  if (ownerId && bot.users.cache.get(ownerId)) {
    const ownerUser = bot.users.cache.get(ownerId);
    const ownerLabel = ownerUser.tag || ownerUser.username ? `${ownerUser.username || ownerUser.tag} (${ownerUser.id})` : ownerId;
    console.log(`[EXPIRE] DM expiration vers ${ownerLabel} pour ${botId}`);
    const dmResult = await ownerUser.send({
      components: [expiredPanel],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2,
    }).catch(() => {});

    const expirationLogChannelId = getLogChannelId('expirationLogs', ['expiryReminderLogs']);
    if (expirationLogChannelId) {
      const expirationLogChannel = bot.channels.cache.get(expirationLogChannelId);
      if (expirationLogChannel) {
        await expirationLogChannel.send({
          components: [expiredPanel],
          allowedMentions: { parse: [] },
          flags: Discord.MessageFlags.IsComponentsV2,
        }).catch(() => {});
      }
    }

    return dmResult;
  }

  const logsChannelId = getLogChannelId('expirationLogs', ['expiryReminderLogs']);
  const logsChannel = logsChannelId ? bot.channels.cache.get(logsChannelId) : null;
  if (logsChannel) {
    return logsChannel.send({
      components: [expiredPanel],
      flags: Discord.MessageFlags.IsComponentsV2,
    }).catch(() => {});
  }

  return null;
}

async function processBotLifecycleRows(bot, rows) {
  if (lifecycleSweepRunning) {
    return;
  }

  lifecycleSweepRunning = true;

  try {
    const nowUnix = Math.floor(Date.now() / 1000);
    const reminderLeadSeconds = getReminderLeadSeconds();

    for (const row of rows) {
      const botId = String(row?.botId || '');
      const targetTime = normalizeUnixTime(row?.time);

      if (!row?.token || !/^\d{17,20}$/.test(botId) || targetTime === null) {
        continue;
      }

      if (row.expired !== 'true' && targetTime <= nowUnix) {
        await stopExpiredBot(bot, row);
        continue;
      }

      if (shouldSendReminder(row, nowUnix, reminderLeadSeconds)) {
        await sendExpiryReminder(bot, row, {
          remainingSeconds: targetTime - nowUnix,
        }).catch((error) => {
          console.log(`[MANAGER] Rappel impossible pour ${botId}: ${error.message}`);
        });
      }
    }
  } finally {
    lifecycleSweepRunning = false;
  }
}

module.exports = {
  name: 'clientReady',
  async execute(bot) {

    await loadSlashCommands(bot);

    console.log(`[!] — Logged in as ${bot.user.tag} (${bot.user.id})`);

    bot.user.setPresence({
      activities: [{
        name: "/zix",
        type: 4
      }],
      status: "dnd"
    });

    require('../Utils/stopallbot')();

    const req = bot.db.prepare('SELECT * FROM bot').all();
    for (const row of req) {
      const botId = row.botId;
      const botStorageId = row.folder || row.botId;
      const targetTime = normalizeUnixTime(row.time);

      if (row.expired === 'true') {
        console.log(`[MANAGER] Bot ignoré (expiré): ${botId}`);
        continue;
      }

      if (targetTime !== null && targetTime <= Math.floor(Date.now() / 1000)) {
        bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);
        console.log(`[MANAGER] Bot ignoré (temps expiré): ${botId}`);
        continue;
      }

      if (!row.token || !/^\d{17,20}$/.test(String(botId || ''))) {
        console.log(`[MANAGER] Bot ignoré (en attente de token): ${botId}`);
        continue;
      }

      console.log(`[MANAGER] Lancement du bot ${botId}`);

      require('../Utils/lauchChildProcess')(
        `./BotRuntimes/${botStorageId}/index.js`,
        'start',
        bot.users.cache.get(botId) || getFallbackUser(botId),
        bot
      );
    }

    await syncAllClientRoles(bot).catch((error) => {
      console.log(`[MANAGER] Synchronisation du role client échouée: ${error.message}`);
    });

    await processBotLifecycleRows(bot, bot.db.prepare('SELECT * FROM bot').all());

    setInterval(async () => {
      const req = bot.db.prepare('SELECT * FROM bot').all();
      await processBotLifecycleRows(bot, req).catch((error) => {
        console.log(`[MANAGER] Echec du sweep des bots: ${error.message}`);
      });
    }, 10000);

  },
};
