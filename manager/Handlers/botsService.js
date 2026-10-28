const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const config = require('../config.json');
const launchChildProcess = require('../Utils/lauchChildProcess');
const { scheduleExpiration: scheduleExpirationTimer } = require('../Utils/expirationScheduler');
const parseDurationInput = require('../Utils/parseDuration');
const { encryptToken, readJsonConfig, writeJsonConfig } = require('../Utils/tokenVault');
const { syncMusicEnvFromConfig } = require('../Utils/musicEnv');
const { syncClientRoleForUsers } = require('../Utils/clientRoleManager');
const { sendAdminActionLog } = require('../Utils/adminActionLog');
const { fetchUser, getFallbackUser, isTokenValid } = require('../Utils/discordLookup');
const { prepareBotRuntime, getTemplateDir, getRuntimeDir, ensureRuntimeConfig, loadTemplateConfig } = require('../Utils/templateRuntime');
const { getLogChannelId } = require('../Utils/logChannels');

function getBotStorageId(rowOrBotId) {
  if (typeof rowOrBotId === 'string') return rowOrBotId;
  return rowOrBotId?.folder || rowOrBotId?.botId;
}

function getBotDir(storageId) {
  return getRuntimeDir(storageId);
}

function normalizeBuyerIds(...groups) {
  const ids = new Set();

  for (const group of groups) {
    if (!Array.isArray(group)) continue;

    for (const buyerId of group) {
      if (buyerId) ids.add(String(buyerId));
    }
  }

  return [...ids];
}

function buildBotWhereClause(ownerId) {
  if (!ownerId) {
    return {
      sql: '',
      params: [],
    };
  }

  return {
    sql: ' WHERE ownerId = ?',
    params: [ownerId],
  };
}

function getBotRows(bot, { ownerId = null, limit = null, offset = 0 } = {}) {
  const { sql: whereSql, params } = buildBotWhereClause(ownerId);
  const hasLimit = Number.isFinite(limit) && limit !== null;
  const hasOffset = Number.isFinite(offset) && offset > 0;
  const query = [
    'SELECT * FROM bot',
    whereSql,
    ' ORDER BY CAST(time AS INTEGER) DESC, rowid DESC',
    hasLimit ? ' LIMIT ?' : hasOffset ? ' LIMIT -1' : '',
    hasOffset ? ' OFFSET ?' : '',
  ].join('');
  const queryParams = [...params];

  if (hasLimit) {
    queryParams.push(Math.max(1, Math.floor(limit)));
  }

  if (hasOffset) {
    queryParams.push(Math.max(0, Math.floor(offset)));
  }

  return bot.db.prepare(query).all(...queryParams);
}

function getBotTypes() {
  const baseDir = path.join(__dirname, '..', 'BotsFolders');
  if (!fs.existsSync(baseDir)) return [];

  return fs
    .readdirSync(baseDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name);
}

function updateBotCode(storageId, botType) {
  prepareBotRuntime(storageId, botType);

  const configPath = path.join(getRuntimeDir(storageId), 'config.json');
  const currentConfig = readJsonConfig(configPath, { migrateToken: true });
  const templateConfig = loadTemplateConfig(botType, {});

  const nextConfig = {
    ...(currentConfig || {}),
    ...templateConfig,
    type: botType,
  };

  if (currentConfig?.token !== undefined) {
    nextConfig.token = currentConfig.token;
  }
  if (currentConfig?.ownerId !== undefined) {
    nextConfig.ownerId = currentConfig.ownerId;
  }
  if (currentConfig?.buyers !== undefined) {
    nextConfig.buyers = currentConfig.buyers;
  }
  if (currentConfig?.buyer !== undefined) {
    nextConfig.buyer = currentConfig.buyer;
  }
  if (currentConfig?.botId !== undefined) {
    nextConfig.botId = currentConfig.botId;
  }
  if (currentConfig?.folder !== undefined) {
    nextConfig.folder = currentConfig.folder;
  }
  if (currentConfig?.time !== undefined) {
    nextConfig.time = currentConfig.time;
  }
  if (currentConfig?.starttime !== undefined) {
    nextConfig.starttime = currentConfig.starttime;
  }
  if (currentConfig?.expired !== undefined) {
    nextConfig.expired = currentConfig.expired;
  }
  if (currentConfig?.started !== undefined) {
    nextConfig.started = currentConfig.started;
  }
  if (currentConfig?.reminderSent !== undefined) {
    nextConfig.reminderSent = currentConfig.reminderSent;
  }
  if (currentConfig?.reminderSentAt !== undefined) {
    nextConfig.reminderSentAt = currentConfig.reminderSentAt;
  }

  if (botType === 'gestion') {
    const buyerId = String(nextConfig.ownerId || nextConfig.buyers?.[0] || nextConfig.sysId || '').trim();
    if (buyerId) {
      nextConfig.ownerId = buyerId;
      nextConfig.sysId = buyerId;
      nextConfig.buyers = [buyerId];
      nextConfig.buyer = [buyerId];
    }
  }

  if (currentConfig) {
    writeJsonConfig(configPath, nextConfig);
  }

  syncMusicEnvFromConfig(storageId, botType);
}

function createBotFromTemplate(storageId, botType) {
  prepareBotRuntime(storageId, botType, { preserveRootFiles: new Set(['.env']) });
}

function readBotConfig(storageId) {
  const configPath = path.join(getBotDir(storageId), 'config.json');
  return readJsonConfig(configPath, { migrateToken: true });
}

function getBotRowFromStorage(bot, storageId) {
  return bot.db.prepare('SELECT * FROM bot WHERE folder = ? OR botId = ?').get(storageId, storageId);
}

function writeBotConfig(bot, storageId, patch) {
  const row = getBotRowFromStorage(bot, storageId);
  const botType = patch.type || row?.type || null;
  if (!botType) {
    throw new Error(`Le type du bot ${storageId} est introuvable.`);
  }

  const current = ensureRuntimeConfig(storageId, botType, patch);

  const next = {
    ...current,
    ...patch,
  };

  next.type = botType;
  next.folder = patch.folder !== undefined ? String(patch.folder) : (current.folder || storageId);
  if (patch.botId !== undefined) {
    next.botId = String(patch.botId);
  } else if (row?.botId) {
    next.botId = String(row.botId);
  } else if (current.botId !== undefined) {
    next.botId = current.botId;
  }

  if (patch.ownerId) {
    const buyers = Array.isArray(patch.buyers) || Array.isArray(patch.buyer)
      ? normalizeBuyerIds(patch.buyers, patch.buyer, [patch.ownerId])
      : normalizeBuyerIds(current.buyers, current.buyer, [patch.ownerId]);
    next.ownerId = String(patch.ownerId);
    next.buyers = buyers;
    next.buyer = [...buyers];
  }

  const written = writeJsonConfig(path.join(getBotDir(storageId), 'config.json'), next);

  if (patch.ownerId && row?.botId) {
    bot.db.prepare('UPDATE bot SET ownerId = ? WHERE botId = ?').run(String(patch.ownerId), row.botId);
  }

  return written;
}

function syncBotOwnershipFromConfig(bot, storageId, configData = null, options = {}) {
  const row = options.row || getBotRowFromStorage(bot, storageId);
  const resolvedStorageId = storageId || row?.folder || row?.botId;
  if (!resolvedStorageId) return null;

  const configPath = path.join(getBotDir(resolvedStorageId), 'config.json');
  const currentConfig = configData || readJsonConfig(configPath, { migrateToken: true });
  if (!currentConfig) return null;

  const buyers = normalizeBuyerIds(currentConfig.buyers, currentConfig.buyer, currentConfig.ownerId ? [currentConfig.ownerId] : []);
  const nextOwnerId = String(currentConfig.ownerId || row?.ownerId || buyers[0] || '').trim() || null;
  const nextBotId = currentConfig.botId || row?.botId || null;
  const nextType = currentConfig.type || row?.type || null;

  const nextConfig = {
    ...currentConfig,
    ownerId: nextOwnerId,
    buyers,
    buyer: [...buyers],
    folder: currentConfig.folder || resolvedStorageId,
  };
  if (nextBotId) nextConfig.botId = String(nextBotId);
  if (nextType) nextConfig.type = String(nextType);
  if (nextType === 'gestion' && nextOwnerId) {
    nextConfig.sysId = nextOwnerId;
    nextConfig.buyers = [nextOwnerId];
    nextConfig.buyer = [nextOwnerId];
  }

  writeJsonConfig(configPath, nextConfig);

  if (options.updateDatabase !== false && row?.botId && nextOwnerId && String(row.ownerId || '') !== String(nextOwnerId)) {
    bot.db.prepare('UPDATE bot SET ownerId = ? WHERE botId = ?').run(nextOwnerId, row.botId);
  }

  return {
    storageId: resolvedStorageId,
    botId: row?.botId || null,
    ownerId: nextOwnerId,
    previousOwnerId: row?.ownerId || null,
    config: nextConfig,
  };
}

async function isRunning(storageId, botUser) {
  return launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'checkstart', botUser);
}

function getStatus(row, started, tokenValid) {
  if (row.expired === 'true') return 'expired';
  if (!tokenValid) return 'token_invalide';
  return started ? 'online' : 'offline';
}

function formatExpire(row) {
  return row.expired === 'true'
    ? 'expiré'
    : `<t:${Number(row.time) || Math.floor(Date.now() / 1000)}:R>`;
}

function parseApiRow(row) {
  return {
    botId: row.botId,
    type: row.type || null,
    ownerId: row.ownerId || null,
    folder: row.folder || row.botId,
    time: row.time || null,
    starttime: row.starttime || null,
    expired: row.expired === 'true',
    started: row.started === 'true',
  };
}

function isDraftBotId(botId) {
  return String(botId || '').startsWith('draft_');
}

function getDisplayName(row, botUser) {
  if (isDraftBotId(row?.botId) || !row?.token) {
    return row?.type || 'inconnu';
  }

  return botUser?.tag || botUser?.username || row.botId;
}

async function buildBotRecord(bot, row, options = {}) {
  const {
    liveStatus = true,
    resolveUser = true,
    resolveTokenValidity = true,
    includeAvatar = true,
  } = options;
  const storageId = getBotStorageId(row);
  const botUser = resolveUser && !isDraftBotId(row.botId) ? await fetchUser(bot, row.botId) : null;
  const tokenValid = resolveTokenValidity ? await isTokenValid(row.token) : null;
  const started = liveStatus
    ? await isRunning(storageId, botUser || getFallbackUser(row.botId))
    : row.started === 'true';

  return {
    ...parseApiRow(row),
    storageId,
    name: getDisplayName(row, botUser),
    avatarUrl: includeAvatar && botUser?.displayAvatarURL ? botUser.displayAvatarURL({ size: 256 }) : null,
    status: resolveTokenValidity ? getStatus(row, started, tokenValid) : (row.expired === 'true' ? 'expired' : started ? 'online' : 'offline'),
    statusLabel: row.expired === 'true'
      ? 'expiré'
      : resolveTokenValidity && !tokenValid
        ? 'token invalide'
        : started
          ? 'en ligne'
          : 'hors ligne',
    tokenValid,
    started,
    expireText: formatExpire(row),
  };
}

async function collectBots(bot, options = {}) {
  const {
    ownerId = null,
    limit = null,
    offset = 0,
    liveStatus = true,
    resolveUser = true,
    resolveTokenValidity = true,
    includeAvatar = true,
  } = options;

  const rows = getBotRows(bot, { ownerId, limit, offset });
  return Promise.all(
    rows.map((row) => buildBotRecord(bot, row, {
      liveStatus,
      resolveUser,
      resolveTokenValidity,
      includeAvatar,
    }))
  );
}

async function collectStats(bot, options = {}) {
  const { fast = true } = options;
  const byType = {};
  const byOwner = {};

  let online = 0;
  let offline = 0;
  let expired = 0;
  let tokenInvalid = 0;

  const rows = fast
    ? bot.db.prepare('SELECT botId, token, type, ownerId, started, expired FROM bot ORDER BY CAST(time AS INTEGER) DESC, rowid DESC').all()
    : await collectBots(bot, { liveStatus: false });

  if (fast) {
    const tokenValidity = await Promise.all(rows.map((row) => isTokenValid(row.token)));

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i];
      const tokenValid = tokenValidity[i];

      byType[row.type || 'inconnu'] = (byType[row.type || 'inconnu'] || 0) + 1;
      byOwner[row.ownerId || 'unknown'] = (byOwner[row.ownerId || 'unknown'] || 0) + 1;

      if (row.expired === 'true') {
        expired += 1;
      } else if (!tokenValid) {
        tokenInvalid += 1;
      } else if (row.started === 'true') {
        online += 1;
      } else {
        offline += 1;
      }
    }
  } else {
    for (const record of rows) {
      byType[record.type || 'inconnu'] = (byType[record.type || 'inconnu'] || 0) + 1;
      byOwner[record.ownerId || 'unknown'] = (byOwner[record.ownerId || 'unknown'] || 0) + 1;

      if (record.expired) {
        expired += 1;
      } else if (!record.tokenValid) {
        tokenInvalid += 1;
      } else if (record.started) {
        online += 1;
      } else {
        offline += 1;
      }
    }
  }

  return {
    total: rows.length,
    online,
    offline,
    expired,
    tokenInvalid,
    byType,
    byOwner,
  };
}

function getBotRow(bot, botId) {
  return bot.db.prepare('SELECT * FROM bot WHERE botId = ?').get(botId);
}

async function scheduleExpiration(bot, botId, botName, storageId, owner, durationMs) {
  scheduleExpirationTimer(bot, { botId, folder: storageId, time: Number(bot.db.prepare('SELECT time FROM bot WHERE botId = ?').get(botId)?.time) || Math.floor(Date.now() / 1000) }, owner, async ({ storageId: targetStorageId, row }) => {
    try {
      const botConfig = readJsonConfig(path.join(getRuntimeDir(targetStorageId), 'config.json'), { migrateToken: false });
      const currentOwnerId = botConfig?.ownerId || row?.ownerId || owner?.id || null;
      const currentOwnerUser = currentOwnerId ? await fetchUser(bot, currentOwnerId) : null;

      await launchChildProcess(
        `./BotRuntimes/${targetStorageId}/index.js`,
        'stop',
        currentOwnerUser || { id: currentOwnerId || botId, username: currentOwnerId || botId },
        bot
      );

      bot.db.prepare('UPDATE bot SET expired = ? WHERE botId = ?').run('true', botId);

      const roleUserIds = new Set([currentOwnerId]);
      if (Array.isArray(botConfig?.buyers)) {
        for (const buyerId of botConfig.buyers) {
          if (buyerId) roleUserIds.add(String(buyerId));
        }
      }
      if (Array.isArray(botConfig?.buyer)) {
        for (const buyerId of botConfig.buyer) {
          if (buyerId) roleUserIds.add(String(buyerId));
        }
      }

      await syncClientRoleForUsers(bot, [...roleUserIds]).catch((error) => {
        console.log(`[BOTS API] Sync role après expiration échouée pour ${botId}: ${error.message}`);
      });

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

      try {
        if (currentOwnerUser) {
          const dmLabel = currentOwnerUser.tag || currentOwnerUser.username ? `${currentOwnerUser.username || currentOwnerUser.tag} (${currentOwnerUser.id})` : currentOwnerUser.id;
          console.log(`[EXPIRE] DM expiration vers ${dmLabel} pour ${botId}`);
          await currentOwnerUser.send({
            content: `Le bot ${botName || botId} a expire.`,
          });
        }
      } catch {}
    } catch (error) {
      console.error(`[BOTS API] Erreur lors de l'expiration de ${botId}:`, error);
    }
  });
}

async function addBot(bot, payload) {
  const token = String(payload.token || '').trim();
  const ownerId = String(payload.ownerId || '').trim();
  const botType = String(payload.type || '').trim();
  const durationInput = String(payload.duration || '').trim();
  const durationMs = parseDurationInput(durationInput);

  if (!token) throw new Error('Le token est obligatoire.');
  if (!ownerId) throw new Error("L'ownerId est obligatoire.");
  if (!botType) throw new Error('Le type est obligatoire.');
  if (durationMs === false) throw new Error('La duree est invalide.');

  const templateDir = getTemplateDir(botType);
  if (!fs.existsSync(templateDir)) {
    throw new Error(`Le type ${botType} n'existe pas.`);
  }

  const loginClient = new Discord.Client({ intents: [] });
  const loginResult = await loginClient.login(token).catch(() => null);
  if (!loginResult) {
    loginClient.destroy();
    throw new Error('Le token fourni est invalide.');
  }

  const botUser = loginClient.user;
  const botId = botUser.id;
  const destinationParentDirectory = path.join(__dirname, '..', 'BotRuntimes');
  const baseFolderName = `${botId}_${botType}`;

  fs.mkdirSync(destinationParentDirectory, { recursive: true });

  let storageId = baseFolderName;
  let index = 1;
  while (fs.existsSync(getBotDir(storageId))) {
    storageId = `${baseFolderName}_${index}`;
    index += 1;
  }

  const existingBot = getBotRow(bot, botId);
  const previousOwnerId = existingBot?.ownerId || null;
  const newTime = Math.floor(Date.now() / 1000) + Math.floor(durationMs / 1000);

  try {
    createBotFromTemplate(storageId, botType);
    writeBotConfig(bot, storageId, {
      token,
      ownerId,
      type: botType,
      botId,
      folder: storageId,
      buyers: [ownerId],
      buyer: [ownerId],
    });
    syncMusicEnvFromConfig(storageId, botType, {
      token,
      ownerId,
      clientId: botId,
      botId,
    });
  } catch (error) {
    loginClient.destroy();
    throw error;
  }

  if (existingBot) {
    bot.db.prepare(
      'UPDATE bot SET token = ?, type = ?, folder = ?, time = ?, starttime = ?, ownerId = ?, started = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?'
    ).run(
      encryptToken(token),
      botType,
      storageId,
      newTime,
      durationInput,
      ownerId,
      'true',
      'false',
      'false',
      null,
      botId
    );
  } else {
    bot.db.prepare(
      'INSERT INTO bot (botId, token, type, folder, time, starttime, ownerId, started, expired, reminderSent, reminderSentAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(
      botId,
      encryptToken(token),
      botType,
      storageId,
      newTime,
      durationInput,
      ownerId,
      'true',
      'false',
      'false',
      null
    );
  }

  const owner = await fetchUser(bot, ownerId) || getFallbackUser(ownerId);
  const started = await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'checkstart', owner, bot);

  if (!started) {
    await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'start', owner, bot, { suppressLogs: true });
  }

  await syncClientRoleForUsers(bot, [previousOwnerId, ownerId]).catch((error) => {
    console.log(`[BOTS API] Sync role client échouée pour ${ownerId}: ${error.message}`);
  });

  await sendAdminActionLog(bot, 'addBotLogs', '# Bot ajouté', [
    `> **Bot:** <@${botId}> (\`${botId}\`)`,
    `> **Owner:** <@${ownerId}> (\`${ownerId}\`)`,
    `> **Type:** \`${botType}\``,
    `> **Dossier:** \`${storageId}\``,
    `> **Durée:** \`${durationInput}\``,
    `> **Statut:** ${started ? 'déjà lancé' : 'démarré'}`,
  ], ['createLogs']);

  scheduleExpiration(bot, botId, botUser.username, storageId, owner, durationMs);
  loginClient.destroy();

  return {
    botId,
    storageId,
    started: true,
  };
}

function parseMentionOrId(value) {
  const raw = String(value || '').trim();
  const match = raw.match(/^<@!?(\d{17,20})>$/);
  return match ? match[1] : raw;
}

async function editBot(bot, payload) {
  const botId = String(payload.botId || '').trim();
  if (!botId) throw new Error('botId est obligatoire.');

  const row = getBotRow(bot, botId);
  if (!row) throw new Error(`Le bot ${botId} est introuvable.`);

  const storageId = getBotStorageId(row);
  const botUser = await fetchUser(bot, botId) || getFallbackUser(botId);
  let currentOwner = await fetchUser(bot, row.ownerId) || getFallbackUser(row.ownerId);
  const startedBefore = await isRunning(storageId, botUser);
  const changes = [];
  let restartNeeded = startedBefore;

  if (payload.type) {
    const nextType = String(payload.type).trim();
    if (!fs.existsSync(getTemplateDir(nextType))) {
      throw new Error(`Le type ${nextType} n'existe pas.`);
    }
    if (nextType !== row.type) {
      updateBotCode(storageId, nextType);
      bot.db.prepare('UPDATE bot SET type = ? WHERE botId = ?').run(nextType, botId);
      writeBotConfig(bot, storageId, {
        type: nextType,
        botId,
        folder: storageId,
        ownerId: row.ownerId,
      });
      syncMusicEnvFromConfig(storageId, nextType, {
        ownerId: row.ownerId,
        clientId: botId,
        botId,
      });
      changes.push('type');
      restartNeeded = true;
    }
  }

  if (payload.token) {
    const nextToken = String(payload.token).trim();
    if (!nextToken) throw new Error('Le token est invalide.');
    const tokenOk = await isTokenValid(nextToken);
    if (!tokenOk) throw new Error('Le token fourni est invalide.');

    const currentType = payload.type ? String(payload.type).trim() : row.type;
    writeBotConfig(bot, storageId, {
      token: nextToken,
      type: currentType,
      botId,
      folder: storageId,
    });
    syncMusicEnvFromConfig(storageId, currentType, {
      token: nextToken,
      ownerId: row.ownerId,
      clientId: botId,
      botId,
    });
    bot.db.prepare('UPDATE bot SET token = ? WHERE botId = ?').run(encryptToken(nextToken), botId);
    changes.push('token');
    restartNeeded = true;
  }

  if (payload.ownerId) {
    const nextOwnerId = parseMentionOrId(payload.ownerId);
    if (!/^\d{17,20}$/.test(nextOwnerId)) {
      throw new Error("L'ownerId est invalide.");
    }

    const previousOwnerId = row.ownerId;
    const currentType = payload.type ? String(payload.type).trim() : row.type;
    writeBotConfig(bot, storageId, {
      ownerId: nextOwnerId,
      buyers: [nextOwnerId],
      buyer: [nextOwnerId],
      type: currentType,
      botId,
      folder: storageId,
    });
    syncMusicEnvFromConfig(storageId, currentType, {
      ownerId: nextOwnerId,
      clientId: botId,
      botId,
    });
    bot.db.prepare('UPDATE bot SET ownerId = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(nextOwnerId, 'false', null, botId);
    changes.push('ownerId');
    currentOwner = await fetchUser(bot, nextOwnerId) || getFallbackUser(nextOwnerId);

    await syncClientRoleForUsers(bot, [previousOwnerId, nextOwnerId]).catch((error) => {
      console.log(`[BOTS API] Sync role client échouée pour ${botId}: ${error.message}`);
    });
  }

  if (payload.duration) {
    const durationMs = parseDurationInput(String(payload.duration).trim());
    if (durationMs === false) {
      throw new Error('La duree est invalide.');
    }

    const addedSeconds = Math.floor(durationMs / 1000);
    const nextTime = row.expired === 'true'
      ? Math.floor(Date.now() / 1000) + addedSeconds
      : Number(row.time) + addedSeconds;

    bot.db.prepare('UPDATE bot SET time = ?, expired = ?, reminderSent = ?, reminderSentAt = ? WHERE botId = ?').run(nextTime, 'false', 'false', null, botId);
    changes.push('duration');

    scheduleExpiration(bot, botId, botUser.username, storageId, currentOwner, durationMs);
  }

  if (payload.action) {
    const action = String(payload.action).trim().toLowerCase();
    if (!['start', 'stop', 'restart'].includes(action)) {
      throw new Error("L'action est invalide.");
    }

    await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, action, botUser, bot, {
      suppressLogs: Boolean(payload.suppressLogs),
    });
    restartNeeded = false;
    changes.push(action);
  }

  if (changes.length === 0) {
    return {
      botId,
      storageId,
      changed: [],
      started: startedBefore,
    };
  }

  if (restartNeeded) {
    await launchChildProcess(`./BotRuntimes/${storageId}/index.js`, 'restart', botUser, bot, {
      suppressLogs: Boolean(payload.suppressLogs),
    });
  }

  if (changes.length > 0) {
    await sendAdminActionLog(bot, 'updateLogs', '# Bot mis à jour', [
      `> **Bot:** <@${botId}> (\`${botId}\`)`,
      `> **Type:** \`${row.type || 'inconnu'}\``,
      `> **Dossier:** \`${storageId}\``,
      `> **Changements:** \`${changes.join(', ')}\``,
      `> **Owner:** ${currentOwner ? `<@${currentOwner.id}> (\`${currentOwner.id}\`)` : '`Inconnu`'}`,
    ], ['createLogs']);
  }

  return {
    botId,
    storageId,
    changed: changes,
    started: await isRunning(storageId, botUser),
  };
}

function getApiSecret() {
  return process.env.BOTS_API_KEY || config.api?.key || null;
}

module.exports = {
  addBot,
  collectBots,
  collectStats,
  createBotFromTemplate,
  editBot,
  getApiSecret,
  getBotRow,
  getBotRows,
  getBotStorageId,
  getBotTypes,
  isRunning,
  isTokenValid,
  buildBotRecord,
  syncBotOwnershipFromConfig,
  updateBotCode,
};
