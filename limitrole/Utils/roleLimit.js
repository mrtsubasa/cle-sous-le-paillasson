function parseArray(raw) {
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

function ensureRoleLimitsTable(bot) {
  if (!bot?.db) return;

  bot.db.exec(`
    CREATE TABLE IF NOT EXISTS role_limits (
      guild_id TEXT NOT NULL,
      role_id TEXT NOT NULL,
      limit_value INTEGER NOT NULL DEFAULT 0,
      baseline_member_ids TEXT DEFAULT '[]',
      updated_by TEXT DEFAULT NULL,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (guild_id, role_id)
    )
  `);
}

function getRoleRow(bot, guildId, roleId) {
  ensureRoleLimitsTable(bot);
  return bot.db.prepare(
    'SELECT * FROM role_limits WHERE guild_id = ? AND role_id = ?',
  ).get(guildId, roleId);
}

function getRoleLimit(bot, guildId, roleId) {
  const row = getRoleRow(bot, guildId, roleId);
  return row ? Number(row.limit_value) : null;
}

function getRoleLimitRecord(bot, guildId, roleId) {
  return getRoleRow(bot, guildId, roleId);
}

function listRoleLimits(bot, guildId) {
  ensureRoleLimitsTable(bot);
  return bot.db.prepare(
    'SELECT * FROM role_limits WHERE guild_id = ? ORDER BY limit_value ASC, role_id ASC',
  ).all(guildId);
}

async function captureRoleBaseline(bot, guildId, roleId) {
  const guild = bot.guilds.cache.get(guildId);
  if (!guild) return [];

  try {
    const members = await guild.members.fetch();
    return Array.from(members.filter((member) => member.roles.cache.has(roleId)).keys());
  } catch {
    const role = guild.roles.cache.get(roleId);
    return role ? Array.from(role.members.keys()) : [];
  }
}

async function setRoleLimit(bot, guildId, roleId, limitValue, updatedBy) {
  ensureRoleLimitsTable(bot);
  const existingRow = getRoleRow(bot, guildId, roleId);
  const baselineMemberIds = existingRow?.baseline_member_ids
    ? parseArray(existingRow.baseline_member_ids)
    : await captureRoleBaseline(bot, guildId, roleId);

  const payload = {
    guild_id: guildId,
    role_id: roleId,
    limit_value: Number(limitValue) || 0,
    baseline_member_ids: JSON.stringify(baselineMemberIds),
    updated_by: updatedBy ?? null,
    updated_at: Date.now(),
  };

  bot.db.prepare(
    `INSERT INTO role_limits (guild_id, role_id, limit_value, baseline_member_ids, updated_by, updated_at)
     VALUES (@guild_id, @role_id, @limit_value, @baseline_member_ids, @updated_by, @updated_at)
     ON CONFLICT(guild_id, role_id) DO UPDATE SET
       limit_value = excluded.limit_value,
       baseline_member_ids = excluded.baseline_member_ids,
       updated_by = excluded.updated_by,
       updated_at = excluded.updated_at`,
  ).run(payload);

  return payload;
}

function removeRoleLimit(bot, guildId, roleId) {
  ensureRoleLimitsTable(bot);
  bot.db.prepare(
    'DELETE FROM role_limits WHERE guild_id = ? AND role_id = ?',
  ).run(guildId, roleId);
}

function getRoleLimitOwnerInfo(bot, guildId, roleId) {
  return getRoleRow(bot, guildId, roleId);
}

function isRoleLimitBypassed(bot, guildId, userId) {
  const row = bot.functions?.getGuildData
    ? bot.functions.getGuildData(bot, guildId)
    : bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);

  if (!row) return false;

  const owner = parseArray(row.owner);
  const sys = parseArray(row.sys);
  const wl = parseArray(row.wl);
  const bypass = parseArray(row.roleBypass);

  return hasId(owner, userId)
    || hasId(sys, userId)
    || hasId(wl, userId)
    || hasId(bypass, userId);
}

function addRoleBypass(bot, guildId, userId) {
  bot.db.prepare(
    `INSERT OR IGNORE INTO guilds (id, prefix, owner, sys, wl, buyers, serverProfileBio, roleBypass)
     VALUES (?, '', '[]', '[]', '[]', '[]', '', '[]')`,
  ).run(guildId);

  const row = bot.db.prepare('SELECT roleBypass FROM guilds WHERE id = ?').get(guildId);
  const current = parseArray(row?.roleBypass);

  if (hasId(current, userId)) return false;

  current.push({ id: userId });
  bot.db.prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
    .run(JSON.stringify(current), guildId);
  return true;
}

function removeRoleBypass(bot, guildId, userId) {
  bot.db.prepare(
    `INSERT OR IGNORE INTO guilds (id, prefix, owner, sys, wl, buyers, serverProfileBio, roleBypass)
     VALUES (?, '', '[]', '[]', '[]', '[]', '', '[]')`,
  ).run(guildId);

  const row = bot.db.prepare('SELECT roleBypass FROM guilds WHERE id = ?').get(guildId);
  const current = parseArray(row?.roleBypass);

  if (!hasId(current, userId)) return false;

  const next = current.filter((entry) => String(entry?.id ?? entry) !== String(userId));
  bot.db.prepare('UPDATE guilds SET roleBypass = ? WHERE id = ?')
    .run(JSON.stringify(next), guildId);
  return true;
}

module.exports = {
  addRoleBypass,
  captureRoleBaseline,
  getRoleLimit,
  getRoleLimitOwnerInfo,
  getRoleLimitRecord,
  listRoleLimits,
  isRoleLimitBypassed,
  removeRoleLimit,
  removeRoleBypass,
  setRoleLimit,
};
