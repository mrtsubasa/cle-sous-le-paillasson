const assignableCommandsRaw = require('./assignable_commands.json');
const { data, savePermCommands, savePermRoles } = require('./state');

const PERM_LEVELS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const DEFAULT_LEVEL = 9;
const EXPT_BUCKET = 'expt';

function getAssignableCommands() {
  const uniq = new Set(
    (Array.isArray(assignableCommandsRaw) ? assignableCommandsRaw : [])
      .map((name) => String(name || '').trim().toLowerCase())
      .filter(Boolean)
  );
  return Array.from(uniq).sort();
}

function buildEmptyPermRolesMap() {
  const out = {};
  for (const level of PERM_LEVELS) out[String(level)] = [];
  return out;
}

function buildEmptyPermCommandsMap() {
  const out = buildEmptyPermRolesMap();
  out[EXPT_BUCKET] = [];
  return out;
}

function normalizePermCommands(raw) {
  const assignable = getAssignableCommands();
  const assignableSet = new Set(assignable);
  const normalized = buildEmptyPermCommandsMap();
  const seen = new Set();

  if (raw && typeof raw === 'object') {
    const exptEntries = Array.isArray(raw[EXPT_BUCKET]) ? raw[EXPT_BUCKET] : [];
    for (const name of exptEntries) {
      const command = String(name || '').trim().toLowerCase();
      if (!command || !assignableSet.has(command) || seen.has(command)) continue;
      normalized[EXPT_BUCKET].push(command);
      seen.add(command);
    }

    for (const level of PERM_LEVELS) {
      const entries = Array.isArray(raw[String(level)]) ? raw[String(level)] : [];
      for (const name of entries) {
        const command = String(name || '').trim().toLowerCase();
        if (!command || !assignableSet.has(command) || seen.has(command)) continue;
        normalized[String(level)].push(command);
        seen.add(command);
      }
    }
  }

  return normalized;
}

function normalizePermRoles(raw) {
  const normalized = buildEmptyPermRolesMap();
  const seen = new Set();

  if (!raw || typeof raw !== 'object') return normalized;

  for (const level of PERM_LEVELS) {
    const entries = Array.isArray(raw[String(level)]) ? raw[String(level)] : [];
    for (const roleId of entries) {
      const rid = String(roleId || '').trim();
      if (!rid || seen.has(rid)) continue;
      normalized[String(level)].push(rid);
      seen.add(rid);
    }
  }

  return normalized;
}

function stableStringify(value) {
  return JSON.stringify(value);
}

function getGuildPermCommands(guildId, persist = true) {
  const gid = String(guildId);
  const current = data.permCommands[gid];
  const normalized = normalizePermCommands(current);

  if (persist && stableStringify(current || {}) !== stableStringify(normalized)) {
    data.permCommands[gid] = normalized;
    savePermCommands();
  }

  return normalized;
}

function getGuildPermRoles(guildId, persist = true) {
  const gid = String(guildId);
  const current = data.permRoles[gid];
  const normalized = normalizePermRoles(current);

  if (persist && stableStringify(current || {}) !== stableStringify(normalized)) {
    data.permRoles[gid] = normalized;
    savePermRoles();
  }

  return normalized;
}

function moveCommandsToPerm(guildId, commands, targetLevel) {
  const gid = String(guildId);
  const normalizedTarget = String(targetLevel || '').trim().toLowerCase();
  const level = normalizedTarget === EXPT_BUCKET
    ? EXPT_BUCKET
    : String(Math.min(9, Math.max(1, parseInt(targetLevel, 10) || DEFAULT_LEVEL)));
  const config = getGuildPermCommands(gid, true);
  const commandSet = new Set(
    (Array.isArray(commands) ? commands : [])
      .map((name) => String(name || '').trim().toLowerCase())
      .filter(Boolean)
  );

  for (const key of Object.keys(config)) {
    config[key] = config[key].filter((name) => !commandSet.has(name));
  }

  for (const name of commandSet.values()) {
    if (!config[level].includes(name)) config[level].push(name);
  }

  data.permCommands[gid] = normalizePermCommands(config);
  savePermCommands();
  return data.permCommands[gid];
}

function moveRolesToPerm(guildId, roleIds, targetLevel) {
  const gid = String(guildId);
  const level = String(Math.min(9, Math.max(1, parseInt(targetLevel, 10) || DEFAULT_LEVEL)));
  const config = getGuildPermRoles(gid, true);
  const roleSet = new Set(
    (Array.isArray(roleIds) ? roleIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );

  for (const key of Object.keys(config)) {
    config[key] = config[key].filter((id) => !roleSet.has(id));
  }

  for (const rid of roleSet.values()) {
    if (!config[level].includes(rid)) config[level].push(rid);
  }

  data.permRoles[gid] = normalizePermRoles(config);
  savePermRoles();
  return data.permRoles[gid];
}

function removeRolesFromPerm(guildId, roleIds, sourceLevel) {
  const gid = String(guildId);
  const level = String(Math.min(9, Math.max(1, parseInt(sourceLevel, 10) || DEFAULT_LEVEL)));
  const config = getGuildPermRoles(gid, true);
  const roleSet = new Set(
    (Array.isArray(roleIds) ? roleIds : [])
      .map((id) => String(id || '').trim())
      .filter(Boolean)
  );

  config[level] = config[level].filter((id) => !roleSet.has(String(id)));

  data.permRoles[gid] = normalizePermRoles(config);
  savePermRoles();
  return data.permRoles[gid];
}

function getCommandPermLevel(guildId, commandName) {
  const config = getGuildPermCommands(guildId, true);
  const target = String(commandName || '').trim().toLowerCase();
  if (!target) return null;

  for (const level of PERM_LEVELS) {
    if (config[String(level)].includes(target)) return level;
  }

  return null;
}

function getMemberPermLevel(guildId, member) {
  if (!member || !member.roles || !member.roles.cache) return 0;
  const config = getGuildPermRoles(guildId, true);
  const roleIds = new Set(member.roles.cache.map((role) => String(role.id)));
  let highest = 0;

  for (const level of PERM_LEVELS) {
    const has = config[String(level)].some((rid) => roleIds.has(String(rid)));
    if (has && level > highest) highest = level;
  }

  return highest;
}

module.exports = {
  PERM_LEVELS,
  EXPT_BUCKET,
  getAssignableCommands,
  getGuildPermCommands,
  getGuildPermRoles,
  moveCommandsToPerm,
  moveRolesToPerm,
  removeRolesFromPerm,
  getCommandPermLevel,
  getMemberPermLevel
};
