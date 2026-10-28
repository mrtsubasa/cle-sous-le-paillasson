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

function ensureGuildRow(bot, guildId) {
  if (!bot?.db || !guildId) return null;

  let row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    bot.db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
    row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }

  return row;
}

function getRoleBypass(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);
  return parseList(row?.roleBypass);
}

function addRoleBypass(bot, guildId, userId) {
  ensureGuildRow(bot, guildId);

  const current = getRoleBypass(bot, guildId);
  if (hasId(current, userId)) return false;

  current.push({ id: String(userId) });
  bot.db.prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
    .run(JSON.stringify(current), guildId);
  return true;
}

function removeRoleBypass(bot, guildId, userId) {
  ensureGuildRow(bot, guildId);

  const current = getRoleBypass(bot, guildId);
  if (!hasId(current, userId)) return false;

  const next = current.filter((entry) => String(entry?.id ?? entry) !== String(userId));
  bot.db.prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
    .run(JSON.stringify(next), guildId);
  return true;
}

function isRoleBypass(bot, guildId, userId) {
  return hasId(getRoleBypass(bot, guildId), userId);
}

module.exports = {
  addRoleBypass,
  getRoleBypass,
  isRoleBypass,
  removeRoleBypass,
};
