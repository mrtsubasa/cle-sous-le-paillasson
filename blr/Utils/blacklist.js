const { loadRuntimeConfig } = require('../../../Utils/runtimeContext');

function parseList(raw) {
  try {
    const parsed = JSON.parse(raw || '[]');
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function hasId(list, userId) {
  const target = String(userId);
  return Array.isArray(list) && list.some((entry) => String(entry?.id ?? entry) === target);
}

function getRuntimeBuyers() {
  const config = loadRuntimeConfig();
  if (Array.isArray(config?.buyers)) return config.buyers.map((id) => String(id));
  return [String(config?.buyers || '')].filter(Boolean);
}

function getGuildAccessLists(bot, guildId) {
  const row = bot?.functions?.getGuildData
    ? bot.functions.getGuildData(bot, guildId)
    : bot?.db?.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);

  return {
    owner: parseList(row?.owner),
    sys: parseList(row?.sys),
    wl: parseList(row?.wl),
    buyers: parseList(row?.buyers),
  };
}

function ensureBlacklistColumn(bot) {
  if (!bot?.db) return;
  bot.db.exec(`
    CREATE TABLE IF NOT EXISTS guilds (
      id TEXT NOT NULL PRIMARY KEY
    )
  `);
}

function ensureGuildRow(bot, guildId) {
  if (!bot?.db || !guildId) return null;

  ensureBlacklistColumn(bot);

  let row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    bot.db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
    row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }

  return row;
}

function getBlacklist(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);
  return parseList(row?.nobl).filter((entry) => canBlacklistTarget(bot, guildId, entry?.id ?? entry));
}

function setBlacklist(bot, guildId, entries) {
  ensureGuildRow(bot, guildId);
  bot.db.prepare('UPDATE guilds SET nobl = ? WHERE id = ?').run(JSON.stringify(entries), guildId);
}

function isBlacklisted(bot, guildId, userId) {
  if (isBuyer(userId)) return false;
  return hasId(getBlacklist(bot, guildId), userId);
}

function isBuyer(userId) {
  return getRuntimeBuyers().includes(String(userId));
}

function getBlacklistBlockReason(bot, guildId, userId, requesterId) {
  const targetId = String(userId);
  const actorId = requesterId ? String(requesterId) : null;

  if (actorId && actorId === targetId) return 'self';
  if (isBuyer(targetId)) return 'buyer';

  const { owner, sys } = getGuildAccessLists(bot, guildId);
  if (hasId(owner, targetId)) return 'owner';
  if (hasId(sys, targetId)) return 'sys';
  return null;
}

function canBlacklistTarget(bot, guildId, userId, requesterId) {
  return getBlacklistBlockReason(bot, guildId, userId, requesterId) === null;
}

function addBlacklist(bot, guildId, userId, reason, addedBy, requesterId) {
  if (!canBlacklistTarget(bot, guildId, userId, requesterId ?? addedBy)) {
    return {
      entry: null,
      updated: false,
      skipped: true,
    };
  }

  const current = getBlacklist(bot, guildId);
  const next = current.filter((entry) => String(entry?.id ?? entry) !== String(userId));
  const entry = {
    id: String(userId),
    reason: typeof reason === 'string' ? reason.trim() : '',
    addedBy: addedBy ? String(addedBy) : null,
    addedAt: Date.now(),
  };

  next.unshift(entry);
  setBlacklist(bot, guildId, next);

  return {
    entry,
    updated: current.length !== next.length,
  };
}

function removeBlacklist(bot, guildId, userId) {
  if (isBuyer(userId)) return null;

  const current = getBlacklist(bot, guildId);
  const entry = current.find((item) => String(item?.id ?? item) === String(userId)) || null;
  const next = current.filter((item) => String(item?.id ?? item) !== String(userId));

  if (next.length === current.length) return null;

  setBlacklist(bot, guildId, next);
  return entry;
}

module.exports = {
  addBlacklist,
  getBlacklistBlockReason,
  getBlacklist,
  isBlacklisted,
  canBlacklistTarget,
  isBuyer,
  removeBlacklist,
};
