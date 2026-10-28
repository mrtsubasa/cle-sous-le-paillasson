const { loadJson, saveJson } = require('./dataStore');

const FILES = {
  logs: 'sanction_logs.json',
  warns: 'warns.json',
  owners: 'owners.json',
  roles: 'command_roles.json',
  commandUsers: 'command_users.json',
  protected: 'protected.json',
  systems: 'systems.json',
  allowedChannel: 'allowed_channel.json',
  mutedRole: 'muted_role.json',
  otherConfig: 'other_config.json',
  commandAccess: '../utils/command_access.json',
  permCommands: 'perm_commands.json',
  permRoles: 'perm_roles.json',
  tempMutes: 'temp_mutes.json',
  tempTimeouts: 'temp_timeouts.json',
  banLogs: 'ban_logs.json',
  gwConfig: 'gw_config.json',
  giveaways: 'giveaways.json'
};

const data = {
  logs: loadJson(FILES.logs),
  warns: loadJson(FILES.warns),
  owners: loadJson(FILES.owners),
  roles: loadJson(FILES.roles),
  commandUsers: loadJson(FILES.commandUsers),
  protected: loadJson(FILES.protected),
  systems: loadJson(FILES.systems),
  allowedChannel: loadJson(FILES.allowedChannel),
  mutedRole: loadJson(FILES.mutedRole),
  otherConfig: loadJson(FILES.otherConfig),
  commandAccess: loadJson(FILES.commandAccess),
  permCommands: loadJson(FILES.permCommands),
  permRoles: loadJson(FILES.permRoles),
  tempMutes: loadJson(FILES.tempMutes),
  tempTimeouts: loadJson(FILES.tempTimeouts),
  banLogs: loadJson(FILES.banLogs),
  gwConfig: loadJson(FILES.gwConfig),
  giveaways: loadJson(FILES.giveaways)
};

function mergeUnique(listA, listB) {
  const merged = [];
  for (const value of [...(Array.isArray(listA) ? listA : []), ...(Array.isArray(listB) ? listB : [])]) {
    const entry = String(value || '').trim();
    if (!entry || merged.includes(entry)) continue;
    merged.push(entry);
  }
  return merged;
}

function migrateRenameCommandRoles() {
  let changed = false;

  for (const guildId of Object.keys(data.roles || {})) {
    const guildRoles = data.roles[guildId];
    if (!guildRoles || typeof guildRoles !== 'object' || Array.isArray(guildRoles)) continue;
    if (!Object.prototype.hasOwnProperty.call(guildRoles, 'rename')) continue;

    guildRoles.nick = mergeUnique(guildRoles.nick, guildRoles.rename);
    delete guildRoles.rename;
    changed = true;
  }

  if (changed) saveJson(FILES.roles, data.roles);
}

function migrateRenameCommandUsers() {
  let changed = false;

  for (const guildId of Object.keys(data.commandUsers || {})) {
    const guildUsers = data.commandUsers[guildId];
    if (!guildUsers || typeof guildUsers !== 'object' || Array.isArray(guildUsers)) continue;
    if (!Object.prototype.hasOwnProperty.call(guildUsers, 'rename')) continue;

    guildUsers.nick = mergeUnique(guildUsers.nick, guildUsers.rename);
    delete guildUsers.rename;
    changed = true;
  }

  if (changed) saveJson(FILES.commandUsers, data.commandUsers);
}

function migrateRenamePermCommands() {
  let changed = false;

  for (const guildId of Object.keys(data.permCommands || {})) {
    const guildPerms = data.permCommands[guildId];
    if (!guildPerms || typeof guildPerms !== 'object' || Array.isArray(guildPerms)) continue;

    for (const key of Object.keys(guildPerms)) {
      const entries = Array.isArray(guildPerms[key]) ? guildPerms[key] : [];
      const migrated = [];

      for (const entry of entries) {
        const value = String(entry || '').trim().toLowerCase();
        const target = value === 'rename' ? 'nick' : value;
        if (!target || migrated.includes(target)) continue;
        migrated.push(target);
      }

      if (JSON.stringify(entries) !== JSON.stringify(migrated)) {
        guildPerms[key] = migrated;
        changed = true;
      }
    }
  }

  if (changed) saveJson(FILES.permCommands, data.permCommands);
}

migrateRenameCommandRoles();
migrateRenameCommandUsers();
migrateRenamePermCommands();

const tempMutes = new Map();
const muteTimers = new Map();
const commandUsage = new Map();

function saveLogs() {
  saveJson(FILES.logs, data.logs);
}

function saveWarns() {
  saveJson(FILES.warns, data.warns);
}

function saveOwners() {
  saveJson(FILES.owners, data.owners);
}

function saveRoles() {
  saveJson(FILES.roles, data.roles);
}

function saveCommandUsers() {
  saveJson(FILES.commandUsers, data.commandUsers);
}

function saveProtected() {
  saveJson(FILES.protected, data.protected);
}

function saveSystems() {
  saveJson(FILES.systems, data.systems);
}

function saveAllowedChannel() {
  saveJson(FILES.allowedChannel, data.allowedChannel);
}

function saveMutedRole() {
  saveJson(FILES.mutedRole, data.mutedRole);
}

function saveOtherConfig() {
  saveJson(FILES.otherConfig, data.otherConfig);
}

function saveCommandAccess() {
  saveJson(FILES.commandAccess, data.commandAccess);
}

function savePermCommands() {
  saveJson(FILES.permCommands, data.permCommands);
}

function savePermRoles() {
  saveJson(FILES.permRoles, data.permRoles);
}

function saveTempMutes() {
  saveJson(FILES.tempMutes, data.tempMutes);
}

function saveTempTimeouts() {
  saveJson(FILES.tempTimeouts, data.tempTimeouts);
}

function saveBanLogs() {
  saveJson(FILES.banLogs, data.banLogs);
}

function saveGwConfig() {
  saveJson(FILES.gwConfig, data.gwConfig);
}

function saveGiveaways() {
  saveJson(FILES.giveaways, data.giveaways);
}

module.exports = {
  data,
  tempMutes,
  muteTimers,
  commandUsage,
  saveLogs,
  saveWarns,
  saveOwners,
  saveRoles,
  saveCommandUsers,
  saveProtected,
  saveSystems,
  saveAllowedChannel,
  saveMutedRole,
  saveOtherConfig,
  savePermCommands,
  savePermRoles,
  saveTempMutes,
  saveTempTimeouts,
  saveBanLogs,
  saveGwConfig,
  saveGiveaways
};



