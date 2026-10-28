const { commandUsage, data, saveOtherConfig } = require('./state');
const { isBotOwner, isSystem, isOwnerMember } = require('./permissions');

const SANCTION_LIMITS = {
  warn: {
    general: { limit: 5, windowMinutes: 30 }
  },
  tempmute: {
    general: { limit: 5, windowMinutes: 30 }
  },
  to: {
    general: { limit: 5, windowMinutes: 30 }
  },
  mute: {
    general: { limit: 3, windowMinutes: 60 },
    owner: { limit: 5, windowMinutes: 30 },
    sys: { limit: 10, windowMinutes: 30 }
  }
};

const SANCTION_LIMIT_COMMANDS = Object.keys(SANCTION_LIMITS);

function cloneRule(rule) {
  return {
    limit: rule.limit,
    windowMinutes: rule.windowMinutes
  };
}

function isValidRule(rule) {
  return !!rule
    && Number.isInteger(rule.limit)
    && Number.isInteger(rule.windowMinutes)
    && rule.limit > 0
    && rule.windowMinutes > 0;
}

function ensureSanctionLimitsConfig(guildId, persist = false) {
  const gid = String(guildId);
  if (!data.otherConfig[gid] || typeof data.otherConfig[gid] !== 'object' || Array.isArray(data.otherConfig[gid])) {
    data.otherConfig[gid] = {};
  }

  const cfg = data.otherConfig[gid];
  if (!cfg.sanctionLimits || typeof cfg.sanctionLimits !== 'object' || Array.isArray(cfg.sanctionLimits)) {
    cfg.sanctionLimits = {};
  }

  let changed = false;

  for (const commandName of SANCTION_LIMIT_COMMANDS) {
    const defaults = SANCTION_LIMITS[commandName];
    const current = cfg.sanctionLimits[commandName];

    if (!current || typeof current !== 'object' || Array.isArray(current)) {
      cfg.sanctionLimits[commandName] = {
        general: cloneRule(defaults.general),
        roles: {}
      };
      changed = true;
      continue;
    }

    if (!isValidRule(current.general)) {
      current.general = cloneRule(defaults.general);
      changed = true;
    }

    if (!current.roles || typeof current.roles !== 'object' || Array.isArray(current.roles)) {
      current.roles = {};
      changed = true;
    }

    for (const [roleId, rule] of Object.entries(current.roles)) {
      if (isValidRule(rule)) continue;
      delete current.roles[roleId];
      changed = true;
    }
  }

  if (persist && changed) {
    saveOtherConfig();
  }

  return cfg.sanctionLimits;
}

function pickSpecialRoleRule(member, rolesConfig) {
  if (!member || !member.roles || !member.roles.cache || !rolesConfig || typeof rolesConfig !== 'object') {
    return null;
  }

  const memberRoleIds = new Set(member.roles.cache.map((role) => String(role.id)));
  let selected = null;

  for (const [roleId, rule] of Object.entries(rolesConfig)) {
    if (!memberRoleIds.has(String(roleId))) continue;
    if (!isValidRule(rule)) continue;

    const candidate = {
      roleId: String(roleId),
      limit: rule.limit,
      windowMinutes: rule.windowMinutes
    };

    if (!selected) {
      selected = candidate;
      continue;
    }

    if (candidate.limit > selected.limit) {
      selected = candidate;
      continue;
    }

    if (candidate.limit === selected.limit && candidate.windowMinutes > selected.windowMinutes) {
      selected = candidate;
    }
  }

  return selected;
}

function getConfiguredSanctionLimit(guildId, commandName, member = null, persist = false) {
  const requested = String(commandName || '').trim().toLowerCase();
  if (!SANCTION_LIMITS[requested]) return null;

  const config = ensureSanctionLimitsConfig(guildId, persist)[requested];
  const specialRoleRule = pickSpecialRoleRule(member, config.roles);
  const selected = specialRoleRule || config.general;

  return {
    limit: selected.limit,
    windowMinutes: selected.windowMinutes,
    windowMs: selected.windowMinutes * 60 * 1000,
    scope: specialRoleRule ? 'role' : 'general',
    roleId: specialRoleRule ? specialRoleRule.roleId : null
  };
}

function getLimitConfig(guildId, commandName, member = null) {
  const configured = getConfiguredSanctionLimit(guildId, commandName, member, false);
  if (configured) {
    return {
      limit: configured.limit,
      windowMs: configured.windowMs
    };
  }

  return { limit: 3, windowMs: 60 * 60 * 1000 };
}

function formatWaitTime(ms) {
  const remainingMs = Math.max(1000, Math.ceil(Number(ms || 0)));
  const unix = Math.floor((Date.now() + remainingMs) / 1000);
  return `<t:${unix}:R>`;
}

function applyLimit(guildId, userId, commandName, cfg) {
  const key = `${guildId}:${userId}:${commandName}`;
  const now = Date.now();

  const history = commandUsage.get(key) || [];
  const recent = history.filter((ts) => now - ts <= cfg.windowMs);

  if (recent.length >= cfg.limit) {
    const remaining = cfg.windowMs - (now - recent[0]);
    return { allowed: false, remaining: Math.max(0, remaining) };
  }

  recent.push(now);
  commandUsage.set(key, recent);
  return { allowed: true, remaining: null };
}

function checkCommandLimit(guildId, userId, commandName, member = null) {
  if (isBotOwner(userId) || isSystem(guildId, userId, member) || isOwnerMember(guildId, userId, member)) {
    return { allowed: true, remaining: null };
  }

  const cfg = getLimitConfig(guildId, commandName, member);
  return applyLimit(guildId, userId, commandName, cfg);
}

function checkTieredCommandLimit(guildId, userId, commandName, configs, member = null) {
  if (isBotOwner(userId)) {
    return { allowed: true, remaining: null, scope: 'owner', cfg: null };
  }

  let scope = 'default';
  let cfg = configs.default;

  if (isSystem(guildId, userId, member)) {
    scope = 'sys';
    cfg = configs.sys;
  } else if (isOwnerMember(guildId, userId, member)) {
    scope = 'owner';
    cfg = configs.owner;
  } else {
    const configured = getConfiguredSanctionLimit(guildId, commandName, member, false);
    if (configured) {
      cfg = {
        limit: configured.limit,
        windowMs: configured.windowMs
      };
    }
  }

  const result = applyLimit(guildId, userId, commandName, cfg);
  return {
    ...result,
    scope,
    cfg
  };
}

module.exports = {
  SANCTION_LIMITS,
  SANCTION_LIMIT_COMMANDS,
  ensureSanctionLimitsConfig,
  getConfiguredSanctionLimit,
  checkCommandLimit,
  checkTieredCommandLimit,
  formatWaitTime
};
