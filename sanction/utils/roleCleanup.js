const {
  data,
  saveRoles,
  saveMutedRole,
  saveOtherConfig,
  savePermRoles,
  saveOwners,
  saveSystems
} = require('./state');

function hasRole(guild, roleId) {
  return guild.roles.cache.has(String(roleId));
}

function cleanCommandRoles(guild, guildId) {
  const guildRoles = data.roles[guildId] || {};
  let changed = false;

  const allRoleIds = new Set();
  Object.values(guildRoles).forEach((roleList) => {
    if (!Array.isArray(roleList)) return;
    roleList.forEach((roleId) => allRoleIds.add(String(roleId)));
  });

  allRoleIds.forEach((roleId) => {
    if (hasRole(guild, roleId)) return;

    Object.keys(guildRoles).forEach((commandName) => {
      const list = Array.isArray(guildRoles[commandName]) ? guildRoles[commandName] : [];
      const next = list.filter((id) => String(id) !== String(roleId));
      if (next.length !== list.length) {
        guildRoles[commandName] = next;
        changed = true;
      }

      if (!guildRoles[commandName].length) {
        delete guildRoles[commandName];
        changed = true;
      }
    });
  });

  if (!Object.keys(guildRoles).length && data.roles[guildId]) {
    delete data.roles[guildId];
    changed = true;
  }

  if (changed) {
    saveRoles();
  }

  return changed;
}

function cleanPermRoles(guild, guildId) {
  const guildPermRoles = data.permRoles[guildId];
  if (!guildPermRoles || typeof guildPermRoles !== 'object') return false;

  let changed = false;
  Object.keys(guildPermRoles).forEach((level) => {
    const list = Array.isArray(guildPermRoles[level]) ? guildPermRoles[level] : [];
    const next = list.filter((roleId) => hasRole(guild, roleId));
    if (next.length !== list.length) {
      guildPermRoles[level] = next;
      changed = true;
    }
  });

  if (changed) {
    savePermRoles();
  }

  return changed;
}

function cleanPrivilegedRoleEntries(guild, guildId, key, saver) {
  const store = data[key];
  if (!store || typeof store !== 'object') return false;
  const raw = store[guildId];
  if (!raw) return false;

  let changed = false;

  if (Array.isArray(raw)) {
    const next = raw.filter((entry) => {
      const value = String(entry || '').trim();
      if (!value.startsWith('role:')) return true;
      const roleId = value.slice(5).trim();
      const keep = roleId && hasRole(guild, roleId);
      if (!keep) changed = true;
      return keep;
    });

    if (next.length !== raw.length) {
      store[guildId] = next;
      changed = true;
    }
  } else if (typeof raw === 'object') {
    const roleList = Array.isArray(raw.roles) ? raw.roles : [];
    const nextRoles = roleList.filter((roleId) => hasRole(guild, roleId));
    if (nextRoles.length !== roleList.length) {
      raw.roles = nextRoles;
      changed = true;
    }
  }

  if (changed) {
    saver();
  }

  return changed;
}

function cleanMutedRole(guild, guildId) {
  const mutedRoleId = data.mutedRole[guildId];
  if (!mutedRoleId || hasRole(guild, mutedRoleId)) return false;

  delete data.mutedRole[guildId];
  saveMutedRole();
  return true;
}

function cleanBanRoles(guild, guildId) {
  const cfg = data.otherConfig[guildId];
  if (!cfg || !cfg.banRoles || typeof cfg.banRoles !== 'object') return false;

  const nextBanRoles = {};
  let changed = false;
  Object.entries(cfg.banRoles).forEach(([roleId, rule]) => {
    if (hasRole(guild, roleId)) {
      nextBanRoles[roleId] = rule;
      return;
    }
    changed = true;
  });

  if (changed) {
    cfg.banRoles = nextBanRoles;
    saveOtherConfig();
  }

  return changed;
}

function cleanSanctionLimitRoles(guild, guildId) {
  const cfg = data.otherConfig[guildId];
  if (!cfg || !cfg.sanctionLimits || typeof cfg.sanctionLimits !== 'object') return false;

  let changed = false;

  for (const [commandName, commandConfig] of Object.entries(cfg.sanctionLimits)) {
    if (!commandConfig || !commandConfig.roles || typeof commandConfig.roles !== 'object') continue;

    const nextRoles = {};
    for (const [roleId, rule] of Object.entries(commandConfig.roles)) {
      if (!hasRole(guild, roleId)) {
        changed = true;
        continue;
      }
      nextRoles[roleId] = rule;
    }

    if (JSON.stringify(nextRoles) !== JSON.stringify(commandConfig.roles)) {
      commandConfig.roles = nextRoles;
      changed = true;
    }
  }

  if (changed) {
    saveOtherConfig();
  }

  return changed;
}

function cleanUpRoles(guild) {
  const guildId = String(guild.id);
  const changes = [
    cleanCommandRoles(guild, guildId),
    cleanPermRoles(guild, guildId),
    cleanPrivilegedRoleEntries(guild, guildId, 'owners', saveOwners),
    cleanPrivilegedRoleEntries(guild, guildId, 'systems', saveSystems),
    cleanMutedRole(guild, guildId),
    cleanBanRoles(guild, guildId),
    cleanSanctionLimitRoles(guild, guildId)
  ];

  return changes.some(Boolean);
}

module.exports = {
  cleanUpRoles
};
