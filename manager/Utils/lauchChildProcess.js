const { spawn } = require('child_process');
const childProcesses = [];
const fs = require('fs');
const path = require('path');
const Discord = require('discord.js');
const config = require('../config.json');
const buildPanel = require('./buildPanel');
const { readJsonConfig, writeJsonConfig } = require('./tokenVault');
const { fetchUser } = require('./discordLookup');
const { getLogChannelId } = require('./logChannels');
const managerApi = require('./managerApi');

const processStateCache = new Map();

function waitForExit(childProcess, timeoutMs = 2000) {
    return new Promise((resolve) => {
        let settled = false;

        const done = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
        };

        const timer = setTimeout(done, timeoutMs);

        childProcess.once('exit', done);
        childProcess.once('error', done);
    });
}

function readBotConfig(botStorageId, botId) {
    const candidates = [
        botStorageId,
        botId,
    ].filter(Boolean);

    for (const candidate of candidates) {
        const runtimeConfigPath = path.join(__dirname, '..', 'BotRuntimes', candidate, 'config.json');
        try {
            if (fs.existsSync(runtimeConfigPath)) {
                return {
                    storageId: candidate,
                    data: JSON.parse(fs.readFileSync(runtimeConfigPath, 'utf8')),
                };
            }
        } catch {}
    }

    const runtimeBotsDir = path.join(__dirname, '..', 'BotRuntimes');
    try {
        if (fs.existsSync(runtimeBotsDir)) {
            const match = fs.readdirSync(runtimeBotsDir, { withFileTypes: true })
                .find((entry) => entry.isDirectory() && String(entry.name).startsWith(String(botId || '')));

            if (match) {
                const configPath = path.join(runtimeBotsDir, match.name, 'config.json');
                if (fs.existsSync(configPath)) {
                    return {
                        storageId: match.name,
                        data: JSON.parse(fs.readFileSync(configPath, 'utf8')),
                    };
                }
            }
        }
    } catch {}

  return { storageId: botStorageId || botId || null, data: null };
}

function resolveEntryScript(filePath) {
    const absolutePath = path.resolve(filePath);
    if (fs.existsSync(absolutePath)) {
        return path.basename(absolutePath);
    }

    const altPath = path.join(path.dirname(absolutePath), 'src', 'index.js');
    if (fs.existsSync(altPath)) {
        return path.relative(path.dirname(absolutePath), altPath);
    }

    return path.basename(absolutePath);
}

function getProcessKey(filePath, entryScript = null) {
    const botFolder = path.dirname(filePath);
    const script = entryScript || resolveEntryScript(filePath);
    return path.join(botFolder, script);
}

function getPrimaryBuyerId(botRow, botConfig, fallbackIds = []) {
  const candidates = [
        botConfig?.ownerId,
        botConfig?.buyerId,
        botRow?.ownerId,
        ...fallbackIds,
    ].filter(Boolean).map(String);

    const uniqueCandidates = [...new Set(candidates)];
    return uniqueCandidates[0] || null;
}

function getBuyerIds(botConfig) {
    return [
        ...(Array.isArray(botConfig?.buyers) ? botConfig.buyers : []),
        ...(Array.isArray(botConfig?.buyer) ? botConfig.buyer : []),
    ]
      .filter(Boolean)
      .map(String);
}

function getStoredStartedState(bot, instanceName, botUser) {
    if (!bot?.db) return null;

    try {
        const row = bot.db
            .prepare('SELECT started, expired FROM bot WHERE folder = ? OR botId = ? OR botId = ?')
            .get(instanceName, instanceName, botUser?.id || null);

        if (!row || row.expired === 'true') return null;
        return row.started === 'true';
    } catch {
        return null;
    }
}

async function sendActionLog(bot, action, filePath, detail, options = {}) {
    if (options.suppressLogs) return;

    const channelId = getLogChannelId(`${action}Logs`, ['botActionLogs']);
    const channel = bot.channels.cache.get(channelId);
    if(!channel) return;

    const botStorageId = path.basename(path.dirname(filePath || '')) || null;
    const botRow = bot.db.prepare('SELECT * FROM bot WHERE folder = ? OR botId = ?').get(botStorageId, botStorageId);
    const actualBotId = botRow?.botId || botStorageId;
    const { data: botConfig } = readBotConfig(botRow?.folder || botStorageId, actualBotId);

    const buyers = [...new Set(getBuyerIds(botConfig))];
    const buyerId = getPrimaryBuyerId(botRow, botConfig, buyers);
    const buyerUser = buyerId ? await fetchUser(bot, buyerId) : null;
    const buyerLabel = buyerUser
        ? `<@${buyerUser.id}> (**${buyerUser.username}** | \`${buyerUser.id}\`)`
        : buyerId
          ? `\`${buyerId}\``
          : '`Aucun`';
    const botUser = actualBotId ? await fetchUser(bot, actualBotId) : null;
    const botLabel = botUser
        ? `<@${botUser.id}> (**${botUser.username || botUser.id}** | \`${botUser.id}\`)`
        : actualBotId
          ? `<@${actualBotId}> (**${actualBotId}** | \`${actualBotId}\`)`
          : '`Bot inconnu`';

    const titleByAction = {
        start: "Lancement d'un bot",
        stop: "Arrêt d'un bot",
        restart: "Redémarrage d'un bot"
    };

    const descriptionByAction = {
        start: "Le bot a été lancé avec succès",
        stop: "Le bot a été arrêté avec succès",
        restart: "Le bot a été relancé avec succès"
    };

    const embed = buildPanel(
        `# ${titleByAction[action] || 'Action bot'}`,
        [
            `> **Bot:** ${botLabel}`,
            `> **Buyer:** ${buyerLabel}`,
            buyers.length > 1 ? `> **Buyers liés:** ${buyers.map((id) => `<@${id}>`).join(', ')}` : null,
            `> **Action:** ${descriptionByAction[action] || 'Action réalisée.'}`,
            detail ? `> **Détail:** \`${detail}\`` : null,
        ].filter(Boolean)
    );

    await channel.send({
        components: [embed],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2
    }).catch(() => {});
}

async function sendClientStartupLog(bot, action, filePath, options = {}) {
    if (options.suppressLogs) return;

    const channelId = getLogChannelId('clientStartupLogs', [`${action}Logs`, 'botActionLogs']);
    const channel = bot.channels.cache.get(channelId);
    if(!channel) return;

    const botStorageId = path.basename(path.dirname(filePath || '')) || null;
    const botRow = bot.db.prepare('SELECT * FROM bot WHERE folder = ? OR botId = ?').get(botStorageId, botStorageId);
    const actualBotId = botRow?.botId || botStorageId;
    const { data: botConfig } = readBotConfig(botRow?.folder || botStorageId, actualBotId);

    const buyers = [...new Set(getBuyerIds(botConfig))];
    const buyerId = getPrimaryBuyerId(botRow, botConfig, buyers);
    const buyerUser = buyerId ? await fetchUser(bot, buyerId) : null;
    const buyerLabel = buyerUser
        ? `<@${buyerUser.id}> (**${buyerUser.username}** | \`${buyerUser.id}\`)`
        : buyerId
          ? `\`${buyerId}\``
          : '`Aucun`';
    const botUser = actualBotId ? await fetchUser(bot, actualBotId) : null;
    const botLabel = botUser
        ? `<@${botUser.id}> (**${botUser.username || botUser.id}** | \`${botUser.id}\`)`
        : actualBotId
          ? `<@${actualBotId}> (**${actualBotId}** | \`${actualBotId}\`)`
          : '`Bot inconnu`';

    const titleByAction = {
        start: 'Start-up',
        restart: 'Redémarrage',
        stop: 'Arrêt',
    };

    const descriptionByAction = {
        start: 'Le client a démarré avec succès',
        restart: 'Le client a été redémarré avec succès',
        stop: 'Le client a été arrêté avec succès',
    };

    const embed = buildPanel(
        `# ${titleByAction[action] || 'Client start-up'}`,
        [
            `> **Bot:** ${botLabel}`,
            `> **Buyer:** ${buyerLabel}`,
            buyers.length > 1 ? `> **Buyers liés:** ${buyers.map((id) => `<@${id}>`).join(', ')}` : null,
            `> **Action:** ${descriptionByAction[action] || 'Client lancé'}`,
        ]
    );

    await channel.send({
        components: [embed],
        allowedMentions: { parse: [] },
        flags: Discord.MessageFlags.IsComponentsV2
    }).catch(() => {});
}

async function launchChildProcess(filePath, option, botId, bot, options = {}) {
    const normalizedFilePath = String(filePath || '');
    const botFolder = path.dirname(normalizedFilePath);
    const entryScript = resolveEntryScript(normalizedFilePath);
    const existingKey = getProcessKey(normalizedFilePath, entryScript);
    const instanceName = path.basename(botFolder);
    const existingIndex = childProcesses.findIndex(item => item.file === existingKey);
    const hasCachedState = processStateCache.has(existingKey);
    const currentState = hasCachedState ? processStateCache.get(existingKey) : null;

    if (option === 'checkstart') {
        try {
            const status = await managerApi.getInstanceStatus(instanceName, { timeoutMs: 1500 });
            const apiRunning = Boolean(status?.data?.running ?? status?.running);
            const storedStarted = getStoredStartedState(bot, instanceName, botId);
            const running = apiRunning || storedStarted === true;
            processStateCache.set(existingKey, running);
            return running;
        } catch {
            const storedStarted = getStoredStartedState(bot, instanceName, botId);
            return storedStarted ?? Boolean(currentState);
        }
    }

    if (option === 'start' || option === 'stop' || option === 'restart') {
        if (existingIndex !== -1) {
            childProcesses.splice(existingIndex, 1);
        }

        const response = await managerApi.performBotAction(instanceName, option, options.suppressLogs ? { suppressLogs: true } : {});
        processStateCache.set(existingKey, Boolean(response?.data?.running));

        if (bot?.db && botId?.id) {
            bot.db.prepare('UPDATE bot SET started = ? WHERE botId = ?').run(option === 'stop' ? 'false' : 'true', botId.id);
        }

        if (option === 'stop' || option === 'restart') {
            await sendActionLog(bot, option === 'restart' ? 'restart' : 'stop', filePath, null, options);
            await sendClientStartupLog(bot, option === 'restart' ? 'restart' : 'stop', filePath, options);
        } else {
            await sendActionLog(bot, 'start', filePath, null, options);
            await sendClientStartupLog(bot, 'start', filePath, options);
        }

        return response;
    }

    if(option === 'checkstart') {
        return Boolean(currentState);
    }
}

module.exports = launchChildProcess;
