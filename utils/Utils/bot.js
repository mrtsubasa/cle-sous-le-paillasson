const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');
const config = loadRuntimeConfig();

function getDefaultPrefix() {
  return typeof config.prefix === 'string' ? config.prefix.trim() : '';
}

function checkBot(bot) {
  let req = bot.db.prepare('SELECT * FROM bot WHERE id = ?').get(bot.user.id);
  if (!req) bot.db.exec(`INSERT INTO bot (id) VALUES ('${bot.user.id}')`);
  req = bot.db.prepare('SELECT * FROM bot WHERE id = ?').get(bot.user.id);
  return req;
}

function ensureGuildRow(bot, guildId) {
  if (!guildId) return null;

  let req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!req) {
    bot.db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
    req = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }

  return req;
}

function getGuildData(bot, guildId) {
  const guildRow = ensureGuildRow(bot, guildId) || {};
  const botRow = checkBot(bot) || {};

  return {
    ...botRow,
    ...guildRow,
  };
}

function getGuildPrefix(bot, guildId) {
  const fallbackPrefix = getDefaultPrefix();
  if (!guildId) return fallbackPrefix;

  const req = ensureGuildRow(bot, guildId);
  const prefix = typeof req?.prefix === 'string' ? req.prefix.trim() : '';
  return prefix || fallbackPrefix;
}

function parseList(value) {
  try {
    return JSON.parse(value || '[]');
  } catch (err) {
    return [];
  }
}

function hasId(list, userId) {
  const target = String(userId);
  return Array.isArray(list) && list.some((entry) => String(entry?.id ?? entry) === target);
}

function getGuildAccessLists(bot, guildId) {
  const req = getGuildData(bot, guildId);
  return {
    owner: parseList(req?.owner),
    sys: parseList(req?.sys),
    wl: parseList(req?.wl),
    buyers: parseList(req?.buyers),
  };
}

function checkPerm(bot, message, type) {
  const userId = message.author?.id || message.user?.id;
  const buyers = Array.isArray(config.buyers)
    ? config.buyers.map((id) => String(id))
    : [String(config.buyers || '')];

  if (type === 'everyone') return true;
  if (type === 'buyer') {
    if (!message.guild) return buyers.includes(String(userId));

    const { buyers: guildBuyers } = getGuildAccessLists(bot, message.guild.id);
    if (guildBuyers.length) return hasId(guildBuyers, userId);
    return buyers.includes(String(userId));
  }
  if (buyers.includes(String(userId))) return true;

  if (!message.guild) return false;

  if (message.guild.ownerId === userId) {
    return ['owner', 'sys', 'wl'].includes(type);
  }

  const { wl, owner, sys } = getGuildAccessLists(bot, message.guild.id);

  if (hasId(sys, userId)) return true;
  if (type === 'owner' && hasId(owner, userId)) return true;
  if (type === 'wl' && (hasId(owner, userId) || hasId(wl, userId))) return true;
  return false;
}

module.exports = {
  checkBot,
  ensureGuildRow,
  getGuildData,
  getGuildPrefix,
  checkPerm,
};
