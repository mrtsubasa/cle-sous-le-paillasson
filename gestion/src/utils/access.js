const { COMMAND_DESCRIPTIONS, SYS_ONLY_COMMANDS } = require('../constants/commands');

const PUBLIC_COMMANDS = new Set(['help', 'helpall', 'perms', 'perm', 'mybot']);
const BUYER_BASE_COMMANDS = new Set(['custom', 'helpmessage', 'verif', 'say', 'create', 'baninfo', 'ban', 'unban', 'delcustom']);

function getMemberRoleIds(member) {
  return member?.roles?.cache?.map((role) => String(role.id)) || [];
}

function getDerivedPermissionLevel(guildId, member, accessStore) {
  const perms = accessStore.getAllPerms(guildId);
  const memberRoleIds = getMemberRoleIds(member);

  let userPerm = 10;
  for (let i = 1; i <= 9; i += 1) {
    const permRoles = perms[i]?.roleIds || perms[String(i)]?.roleIds || [];
    if (permRoles.some((roleId) => memberRoleIds.includes(String(roleId)))) {
      userPerm = Math.min(userPerm, i);
    }
  }

  return userPerm <= 9 ? userPerm : null;
}

function getGrantedCommandsForMember(guildId, member, userId, accessStore) {
  const commands = new Set();
  const memberRoleIds = getMemberRoleIds(member);
  const allCommandRoles = accessStore.getAllCommandRoles(guildId) || {};

  for (const commandName of accessStore.getPermCommands(guildId, 'publique') || []) {
    commands.add(String(commandName || '').trim().toLowerCase());
  }

  for (const [commandName, roleIds] of Object.entries(allCommandRoles)) {
    if (Array.isArray(roleIds) && roleIds.some((roleId) => memberRoleIds.includes(String(roleId)))) {
      commands.add(String(commandName || '').trim().toLowerCase());
    }
  }

  for (const commandName of accessStore.getUserPermCommands(guildId, userId) || []) {
    commands.add(String(commandName || '').trim().toLowerCase());
  }

  const derivedPerm = getDerivedPermissionLevel(guildId, member, accessStore);
  if (derivedPerm !== null) {
    const perms = accessStore.getAllPerms(guildId);
    for (let i = 1; i <= derivedPerm; i += 1) {
      const permCommands = perms[i]?.commands || perms[String(i)]?.commands || [];
      for (const commandName of permCommands) {
        commands.add(String(commandName || '').trim().toLowerCase());
      }
    }
  }

  return [...commands].filter(Boolean);
}

function hasCommandAccess({ guildId, member, userId, commandName, accessStore }) {
  const safeCommand = String(commandName || '').trim().toLowerCase();
  if (!guildId || !userId || !safeCommand) return false;

  if (accessStore.isSys(userId) || accessStore.isOwner(guildId, userId)) {
    return true;
  }

  const grantedCommands = getGrantedCommandsForMember(guildId, member, userId, accessStore);
  return grantedCommands.includes(safeCommand);
}

function getActualAccessState(guildId, userId, accessStore) {
  const safeGuildId = String(guildId || '');
  const safeUserId = String(userId || '');
  const actualSysUserId = String(accessStore?.getSysUserId?.() || '');
  const actualIsSys = Boolean(safeUserId) && actualSysUserId === safeUserId;
  const actualOwnerIds = safeGuildId && typeof accessStore?.getOwnerUserIds === 'function'
    ? accessStore.getOwnerUserIds(safeGuildId)
    : [];
  const actualIsOwner = actualIsSys || actualOwnerIds.includes(safeUserId);
  const actualIsBuyer = typeof accessStore?.isBuyer === 'function' && accessStore.isBuyer(safeUserId) === true;

  return {
    actualIsSys,
    actualIsOwner,
    actualIsBuyer
  };
}

function getAssignableCommandsForMember({ guildId, member, userId, accessStore, commandNames } = {}) {
  const safeGuildId = String(guildId || '');
  const safeUserId = String(userId || '');
  if (!safeGuildId || !safeUserId || !accessStore) return [];

  const candidates = normalizeAssignableCommandNames(commandNames);
  if (!candidates.length) return [];

  const { actualIsSys, actualIsOwner, actualIsBuyer } = getActualAccessState(safeGuildId, safeUserId, accessStore);
  const grantedCommands = new Set(getGrantedCommandsForMember(safeGuildId, member, safeUserId, accessStore));

  return candidates.filter((commandName) => {
    if (actualIsSys) return true;
    if (PUBLIC_COMMANDS.has(commandName)) return true;
    if (grantedCommands.has(commandName)) return true;
    if (actualIsOwner) return !SYS_ONLY_COMMANDS.includes(commandName);
    if (actualIsBuyer && BUYER_BASE_COMMANDS.has(commandName)) return true;
    return false;
  });
}

function buildGrantedExecutionContext(message, context, commandName) {
  if (!message.guild) return context;

  const guildId = String(message.guild.id);
  const userId = String(message.author.id);
  const safeCommand = String(commandName || '').trim().toLowerCase();

  if (
    !hasCommandAccess({
      guildId,
      member: message.member,
      userId,
      commandName: safeCommand,
      accessStore: context.accessStore
    })
  ) {
    return context;
  }

  return {
    ...context,
    accessStore: {
      ...context.accessStore,
      canUseAdminCommands: (targetGuildId, targetUserId) => {
        if (String(targetGuildId) === guildId && String(targetUserId) === userId) return true;
        return context.accessStore.canUseAdminCommands(targetGuildId, targetUserId);
      },
      isSys: (targetUserId) => {
        if (String(targetUserId) === userId) return true;
        return context.accessStore.isSys(targetUserId);
      },
      isOwner: (targetGuildId, targetUserId) => {
        if (String(targetGuildId) === guildId && String(targetUserId) === userId) return true;
        return context.accessStore.isOwner(targetGuildId, targetUserId);
      }
    }
  };
}

function normalizeAssignableCommandNames(commandNames) {
  const source = Array.isArray(commandNames) ? commandNames : Object.keys(COMMAND_DESCRIPTIONS);

  return [
    ...new Set(
      source
        .map((commandName) => String(commandName || '').trim().toLowerCase())
        .filter((commandName) => commandName && Object.prototype.hasOwnProperty.call(COMMAND_DESCRIPTIONS, commandName))
    )
  ];
}

module.exports = {
  getDerivedPermissionLevel,
  getGrantedCommandsForMember,
  getActualAccessState,
  getAssignableCommandsForMember,
  hasCommandAccess,
  buildGrantedExecutionContext
};
