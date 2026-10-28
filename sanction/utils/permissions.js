const { readJsonConfig } = require('../../../Utils/tokenVault');
const { getSanctionRuntimeConfigPath } = require('./runtimeConfig');
const { data } = require('./state');
const { getCommandPermLevel, getMemberPermLevel } = require('./permGroups');

function getConfig() {
  const configPath = getSanctionRuntimeConfigPath();
  return readJsonConfig(configPath, { migrateToken: false }) || {};
}

function isBotOwner(userId) {
  const config = getConfig();
  const buyers = Array.isArray(config.buyers) ? config.buyers : [];
  return buyers.includes(String(userId));
}

function normalizePrivilegedEntries(raw) {
  const users = new Set();
  const roles = new Set();

  if (Array.isArray(raw)) {
    for (const entry of raw) {
      const value = String(entry || '').trim();
      if (!value) continue;

      if (value.startsWith('role:')) {
        const roleId = value.slice(5).trim();
        if (roleId) roles.add(roleId);
        continue;
      }

      users.add(value);
    }

    return {
      users: Array.from(users),
      roles: Array.from(roles)
    };
  }

  if (raw && typeof raw === 'object') {
    const legacyUsers = Array.isArray(raw.users) ? raw.users : [];
    const legacyRoles = Array.isArray(raw.roles) ? raw.roles : [];

    for (const userId of legacyUsers) {
      const value = String(userId || '').trim();
      if (value) users.add(value);
    }

    for (const roleId of legacyRoles) {
      const value = String(roleId || '').trim();
      if (value) roles.add(value);
    }
  }

  return {
    users: Array.from(users),
    roles: Array.from(roles)
  };
}

function hasPrivilegedAccess(entries, userId, member) {
  const uid = String(userId);
  if (entries.users.includes(uid)) {
    return true;
  }

  if (!member || !member.roles || !member.roles.cache) {
    return false;
  }

  return entries.roles.some((roleId) => member.roles.cache.has(String(roleId)));
}

function isSystem(guildId, userId, member = null) {
  const entries = normalizePrivilegedEntries(data.systems[String(guildId)]);
  return hasPrivilegedAccess(entries, userId, member);
}

function isOwnerMember(guildId, userId, member = null) {
  const entries = normalizePrivilegedEntries(data.owners[String(guildId)]);
  return hasPrivilegedAccess(entries, userId, member);
}

function isProtected(guildId, userId, member = null) {
  return isSystem(guildId, userId, member)
    || isOwnerMember(guildId, userId, member)
    || (data.protected[String(guildId)] || []).includes(String(userId));
}

function getCommandAccess(guildId) {
  const access = data.commandAccess || {};
  if (Array.isArray(access.public) || Array.isArray(access.owners) || Array.isArray(access.sys)) {
    return {
      public: Array.isArray(access.public) ? access.public : [],
      owners: Array.isArray(access.owners) ? access.owners : [],
      sys: Array.isArray(access.sys) ? access.sys : []
    };
  }

  const cfg = access[String(guildId)] || {};
  return {
    public: Array.isArray(cfg.public) ? cfg.public : [],
    owners: Array.isArray(cfg.owners) ? cfg.owners : [],
    sys: Array.isArray(cfg.sys) ? cfg.sys : []
  };
}

function getRoleCommandCandidates(commandName) {
  const name = String(commandName || '').toLowerCase();
  if (name === 'profil') {
    return ['profil', 'config'];
  }
  return [name];
}

function hasOtherDangerousRoleAccess(member, commandName, guildId) {
  const requested = String(commandName || '').toLowerCase();
  if (requested !== 'ban' && requested !== 'kick') {
    return false;
  }

  const cfg = data.otherConfig[String(guildId)];
  if (!cfg || !cfg.banRoles || typeof cfg.banRoles !== 'object') {
    return false;
  }

  const roleIds = new Set(member.roles.cache.map((role) => String(role.id)));
  for (const [roleId, rule] of Object.entries(cfg.banRoles)) {
    if (!roleIds.has(String(roleId))) continue;
    if (!rule || !Number.isInteger(rule.limit) || !Number.isInteger(rule.windowMinutes)) continue;
    return true;
  }

  return false;
}

function hasPermissionForCommand(member, commandName) {
  if (!member || !member.guild) return false;
  if (isBotOwner(member.id)) {
    return true;
  }

  const requestedCommand = String(commandName || '').toLowerCase();
  const guildId = String(member.guild.id);
  const access = getCommandAccess(guildId);
  const candidates = getRoleCommandCandidates(requestedCommand);
  const hasAccessFor = (list) => candidates.some((candidate) => Array.isArray(list) && list.includes(candidate));

  const isSysMember = isSystem(guildId, member.id, member);
  const isOwner = isOwnerMember(guildId, member.id, member);
  const hasPrivilegedCategory = isSysMember || isOwner;

  if (hasPrivilegedCategory) {
    if (hasAccessFor(access.public)) {
      return true;
    }
    if (isSysMember && hasAccessFor(access.sys)) {
      return true;
    }
    if (isOwner && hasAccessFor(access.owners)) {
      return true;
    }
  }

  if (hasAccessFor(access.public)) {
    return true;
  }

  if (hasOtherDangerousRoleAccess(member, requestedCommand, guildId)) {
    return true;
  }

  const usersForGuild = data.commandUsers && typeof data.commandUsers === 'object'
    ? (data.commandUsers[guildId] || {})
    : {};
  const rolesForGuild = data.roles[guildId] || {};
  const userRoles = member.roles.cache.map((role) => String(role.id));

  for (const candidate of candidates) {
    const allowedUsers = usersForGuild[candidate];
    if (Array.isArray(allowedUsers) && allowedUsers.includes(String(member.id))) {
      return true;
    }
  }

  for (const candidate of candidates) {
    const allowedRoles = rolesForGuild[candidate];
    if (!Array.isArray(allowedRoles) || !allowedRoles.length) continue;
    if (allowedRoles.some((roleId) => userRoles.includes(String(roleId)))) {
      return true;
    }
  }

  const memberPermLevel = getMemberPermLevel(guildId, member);
  if (memberPermLevel > 0) {
    for (const candidate of candidates) {
      const requiredLevel = getCommandPermLevel(guildId, candidate);
      if (requiredLevel && memberPermLevel >= requiredLevel) {
        return true;
      }
    }
  }

  return false;
}

function checkAllowedChannel(guild, channelId, userId, member = null) {
  if (!guild) return true;
  if (isBotOwner(userId) || isSystem(guild.id, userId, member) || isOwnerMember(guild.id, userId, member)) {
    return true;
  }

  const allowed = data.allowedChannel[String(guild.id)];
  if (!allowed) return true;

  return String(allowed) === String(channelId);
}

module.exports = {
  isBotOwner,
  isSystem,
  isOwnerMember,
  isProtected,
  hasPermissionForCommand,
  checkAllowedChannel,
  getCommandAccess
};
