const Discord = require('discord.js');
const path = require('path');
const { getLogChannelId } = require('./logChannels');
const { readJsonConfig } = require('./tokenVault');

const MAX_CODE_LENGTH = 1800;
const RECENT_WINDOW_MS = 4000;
const recentErrorKeys = new Map();
const ALERT_PATTERNS = [
  {
    source: 'CMD ERROR',
    pattern: /\b(console\.error|error|err|erreur|exception|uncaught|unhandled|rejection|UnhandledPromiseRejection|ReferenceError|TypeError|SyntaxError|RangeError|failed|failure|fatal|crash|abort)\b/i,
  },
  {
    source: 'CMD WARN',
    pattern: /\b(console\.warn|warn|warning|avertissement|deprecated|deprecation|DeprecationWarning)\b/i,
  },
];

function cleanErrorText(value) {
  return String(value || '')
    .replace(/\u001b\[[0-9;]*m/g, '')
    .trim();
}

function limitCodeBlock(value) {
  const cleaned = cleanErrorText(value);
  if (!cleaned) return 'Erreur inconnue.';
  if (cleaned.length <= MAX_CODE_LENGTH) return cleaned;

  return `${cleaned.slice(0, MAX_CODE_LENGTH - 35)}\n... (erreur tronquée)`;
}

function getConsoleAlertSource(output) {
  const text = cleanErrorText(output);

  for (const alert of ALERT_PATTERNS) {
    if (alert.pattern.test(text)) {
      return alert.source;
    }
  }

  return null;
}

function getRuntimeConfig(instanceName) {
  const runtimePath = path.join(__dirname, '..', 'BotRuntimes', instanceName, 'config.json');
  const templatePath = path.join(__dirname, '..', 'BotsFolders', instanceName, 'config.json');
  return readJsonConfig(runtimePath, { migrateToken: false })
    || readJsonConfig(templatePath, { migrateToken: false })
    || null;
}

function getBotRow(bot, instanceName, botConfig) {
  if (!bot?.db) return null;

  try {
    return bot.db
      .prepare('SELECT * FROM bot WHERE folder = ? OR botId = ? OR botId = ? LIMIT 1')
      .get(instanceName, instanceName, botConfig?.botId || null);
  } catch {
    return null;
  }
}

async function resolveBotLabel(bot, instanceName, row, botConfig) {
  const botId = row?.botId || botConfig?.botId || (String(instanceName).match(/^\d+/)?.[0] || null);
  if (!botId) return `\`${instanceName}\``;

  const user = bot?.users?.cache?.get(botId) || await bot?.users?.fetch(botId).catch(() => null);
  if (user) {
    return `${user.username || user.tag || botId}#${user.discriminator || '0000'}`;
  }

  return botId;
}

function shouldSkipDuplicate(instanceName, errorText) {
  const key = `${instanceName}:${errorText.slice(0, 300)}`;
  const now = Date.now();
  const previous = recentErrorKeys.get(key) || 0;

  if (now - previous < RECENT_WINDOW_MS) {
    return true;
  }

  recentErrorKeys.set(key, now);
  for (const [storedKey, timestamp] of recentErrorKeys) {
    if (now - timestamp > RECENT_WINDOW_MS * 5) {
      recentErrorKeys.delete(storedKey);
    }
  }

  return false;
}

function buildErrorPanel(botName, timestamp, source, errorText) {
  return new Discord.ContainerBuilder()
    .setAccentColor(0x5865f2)
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`# ⚠️ Erreur — ${botName}`),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`<t:${timestamp}:f>`),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent('> Ton bot a rencontré une erreur et a peut-être été arrêté.'),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent(`\`\`\`\n[${source}] ${errorText}\n\`\`\``),
    )
    .addTextDisplayComponents(
      new Discord.TextDisplayBuilder().setContent("Si l'erreur persiste, contacte un administrateur."),
    );
}

async function getBotErrorLogContext(bot, instanceName) {
  if (!bot) return null;

  const channelId = getLogChannelId('botErrorLogs', ['botActionLogs', 'logs']);
  if (!channelId) return null;

  const channel = bot.channels.cache.get(channelId) || await bot.channels.fetch(channelId).catch(() => null);
  if (!channel) return null;

  const botConfig = getRuntimeConfig(instanceName);
  const row = getBotRow(bot, instanceName, botConfig);
  const botName = await resolveBotLabel(bot, instanceName, row, botConfig);

  return {
    botName,
    channel,
    timestamp: Math.floor(Date.now() / 1000),
  };
}

async function sendBotErrorLog(bot, instanceName, error, options = {}) {
  const errorText = limitCodeBlock(error);
  if (shouldSkipDuplicate(instanceName, errorText)) return false;

  const context = await getBotErrorLogContext(bot, instanceName);
  if (!context) return false;

  const source = options.source || 'Console';

  try {
    await context.channel.send({
      components: [
        buildErrorPanel(context.botName, context.timestamp, source, errorText),
      ],
      allowedMentions: { parse: [] },
      flags: Discord.MessageFlags.IsComponentsV2,
    });
    return true;
  } catch (sendError) {
    console.error(`[BOT ERROR LOG] Impossible d'envoyer le log de ${instanceName}: ${sendError.message}`);
    return false;
  }
}

module.exports = {
  getConsoleAlertSource,
  sendBotErrorLog,
};
