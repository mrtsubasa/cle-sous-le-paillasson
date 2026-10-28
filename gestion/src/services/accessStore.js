const fs = require('node:fs');
const path = require('node:path');

function createAccessStore(config = {}) {
  const filePath = path.join(process.cwd(), 'data', 'access.json');
  ensureFile(filePath);

  const sysUserId = String(config.sysId || '').trim();
  const buyerUserIds = [
    ...new Set(
      (Array.isArray(config.buyers) ? config.buyers : [])
        .map((id) => String(id || '').trim())
        .filter((id) => /^\d+$/.test(id))
    )
  ];

  function readState() {
    try {
      const raw = fs.readFileSync(filePath, 'utf8').replace(/^\uFEFF/, '');
      const parsed = raw.trim() ? JSON.parse(raw) : {};
      return normalizeState(parsed);
    } catch {
      return normalizeState({});
    }
  }

  function writeState(state) {
    fs.writeFileSync(filePath, JSON.stringify(normalizeState(state), null, 2), 'utf8');
  }

  function getSysUserId() {
    return sysUserId;
  }

  function isSys(userId) {
    return String(userId || '') === getSysUserId();
  }

  function getOwnerUserIds(guildId) {
    const gid = String(guildId || '');
    if (!gid) return [];
    const state = readState();
    return normalizeIdList(state.guildSettings[gid]?.ownerUserIds);
  }

  function isOwner(guildId, userId) {
    const uid = String(userId || '');
    if (!uid) return false;
    return isSys(uid) || getOwnerUserIds(guildId).includes(uid);
  }

  function isBuyer(userId) {
    const uid = String(userId || '');
    if (!uid) return false;
    return buyerUserIds.includes(uid);
  }

  function canUseAdminCommands(guildId, userId) {
    return isOwner(guildId, userId) || isBuyer(userId);
  }

  function setOwnerUserIds(guildId, userIds) {
    const gid = String(guildId || '');
    if (!gid) return [];

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].ownerUserIds = normalizeIdList(userIds);
    writeState(state);
    return state.guildSettings[gid].ownerUserIds;
  }

  function setGuildLogChannel(guildId, channelId) {
    const gid = String(guildId || '');
    if (!gid) return null;

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].logChannelId = channelId ? String(channelId) : null;
    writeState(state);
    return state.guildSettings[gid].logChannelId;
  }

  function getGuildLogChannel(guildId) {
    const gid = String(guildId || '');
    if (!gid) return null;
    const state = readState();
    return state.guildSettings[gid]?.logChannelId || null;
  }

  function getGuildQuickLinks(guildId) {
    const gid = String(guildId || '');
    if (!gid) return [];
    const state = readState();
    return normalizeQuickLinks(state.guildSettings[gid]?.quickLinks);
  }

  function setGuildQuickLinks(guildId, quickLinks) {
    const gid = String(guildId || '');
    if (!gid) return [];

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].quickLinks = normalizeQuickLinks(quickLinks);
    writeState(state);
    return state.guildSettings[gid].quickLinks;
  }

  function setCommandRoles(guildId, command, roles) {
    const gid = String(guildId || '');
    const cmd = String(command || '').trim().toLowerCase();
    if (!gid || !cmd) return [];

    const state = readState();
    ensureGuild(state, gid);
    if (!state.guildSettings[gid].commandRoles || typeof state.guildSettings[gid].commandRoles !== 'object') {
      state.guildSettings[gid].commandRoles = {};
    }

    state.guildSettings[gid].commandRoles[cmd] = normalizeIdList(roles);
    writeState(state);
    return state.guildSettings[gid].commandRoles[cmd];
  }

  function getCommandRoles(guildId, command) {
    const gid = String(guildId || '');
    const cmd = String(command || '').trim().toLowerCase();
    if (!gid || !cmd) return [];

    const state = readState();
    return normalizeIdList(state.guildSettings[gid]?.commandRoles?.[cmd]);
  }

  function getAllCommandRoles(guildId) {
    const gid = String(guildId || '');
    if (!gid) return {};

    const state = readState();
    const source = state.guildSettings[gid]?.commandRoles;
    if (!source || typeof source !== 'object') return {};

    const output = {};
    for (const [cmd, roles] of Object.entries(source)) {
      output[String(cmd).toLowerCase()] = normalizeIdList(roles);
    }
    return output;
  }

  function getGuildPerms(guildId) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultPerms();

    const state = readState();
    ensureGuild(state, gid);
    ensurePerms(state.guildSettings[gid]);
    writeState(state);
    return state.guildSettings[gid].perms;
  }

  function setPermRoles(guildId, perm, roleIds) {
    const gid = String(guildId || '');
    const key = normalizePermKey(perm);
    if (!gid || !key) return [];

    const state = readState();
    ensureGuild(state, gid);
    ensurePerms(state.guildSettings[gid]);
    state.guildSettings[gid].perms[key].roleIds = normalizeIdList(roleIds);
    writeState(state);
    return state.guildSettings[gid].perms[key].roleIds;
  }

  function setPermCommands(guildId, perm, commands) {
    const gid = String(guildId || '');
    const key = normalizePermKey(perm);
    if (!gid || !key) return [];

    const state = readState();
    ensureGuild(state, gid);
    ensurePerms(state.guildSettings[gid]);
    state.guildSettings[gid].perms[key].commands = normalizeCommandList(commands);
    writeState(state);
    return state.guildSettings[gid].perms[key].commands;
  }

  function getPermRoles(guildId, perm) {
    const key = normalizePermKey(perm);
    if (!key) return [];
    return normalizeIdList(getGuildPerms(guildId)[key]?.roleIds);
  }

  function getPermCommands(guildId, perm) {
    const key = normalizePermKey(perm);
    if (!key) return [];
    return normalizeCommandList(getGuildPerms(guildId)[key]?.commands);
  }

  function getPermForRole(guildId, roleId) {
    const rid = String(roleId || '');
    if (!rid) return null;

    const perms = getGuildPerms(guildId);
    for (let i = 1; i <= 9; i += 1) {
      const key = String(i);
      if (Array.isArray(perms[key]?.roleIds) && perms[key].roleIds.includes(rid)) {
        return i;
      }
    }

    return null;
  }

  function getPermForUser() {
    return null;
  }

  function getAllPerms(guildId) {
    return getGuildPerms(guildId);
  }

  function getAllUserPerms(guildId) {
    const gid = String(guildId || '');
    if (!gid) return {};

    const state = readState();
    const source = state.guildSettings[gid]?.userPerms;
    if (!source || typeof source !== 'object') return {};

    const output = {};
    for (const [userId, commands] of Object.entries(source)) {
      const uid = String(userId || '').trim();
      if (!/^\d+$/.test(uid)) continue;
      output[uid] = normalizeCommandList(commands);
    }
    return output;
  }

  function getUserPermCommands(guildId, userId) {
    const uid = String(userId || '');
    if (!uid) return [];
    return normalizeCommandList(getAllUserPerms(guildId)[uid]);
  }

  function addUserPermCommand(guildId, userId, command) {
    const gid = String(guildId || '');
    const uid = String(userId || '');
    const cmd = String(command || '').trim().toLowerCase();
    if (!gid || !uid || !cmd) return [];

    const state = readState();
    ensureGuild(state, gid);
    if (!state.guildSettings[gid].userPerms || typeof state.guildSettings[gid].userPerms !== 'object') {
      state.guildSettings[gid].userPerms = {};
    }

    const current = normalizeCommandList(state.guildSettings[gid].userPerms[uid]);
    if (!current.includes(cmd)) current.push(cmd);
    state.guildSettings[gid].userPerms[uid] = current;

    writeState(state);
    return current;
  }

  function getAllGuildIds() {
    const state = readState();
    return Object.keys(state.guildSettings || {}).map((guildId) => String(guildId));
  }

  function getGuildModerationLimits(guildId) {
    const gid = String(guildId || '');
    if (!gid) {
      return {
        clearMax: 100,
        banPerMinute: 5
      };
    }

    const state = readState();
    const limits = state.guildSettings[gid]?.moderationLimits || {};
    const clearMax = Number.parseInt(limits.clearMax, 10);
    const banPerMinute = Number.parseInt(limits.banPerMinute, 10);

    return {
      clearMax: Number.isInteger(clearMax) ? Math.min(100, Math.max(1, clearMax)) : 100,
      banPerMinute: Number.isInteger(banPerMinute) ? Math.min(30, Math.max(1, banPerMinute)) : 5
    };
  }

  function getGuildSecureRules(guildId) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultSecureRules();

    const state = readState();
    const rules = state.guildSettings[gid]?.secureRules;
    return normalizeSecureRules(rules);
  }

  function setGuildSecureRules(guildId, partialRules = {}) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultSecureRules();

    const state = readState();
    ensureGuild(state, gid);

    const current = normalizeSecureRules(state.guildSettings[gid].secureRules);
    const next = normalizeSecureRules({
      ...current,
      ...(partialRules && typeof partialRules === 'object' ? partialRules : {})
    });

    state.guildSettings[gid].secureRules = next;
    writeState(state);
    return next;
  }

  function isActionBlockedForChannel(guildId, action, channelId, parentCategoryId) {
    const mode = String(action || '').trim().toLowerCase();
    if (mode !== 'clear' && mode !== 'renew') return false;

    const rules = getGuildSecureRules(guildId);
    const channelKey = mode === 'clear' ? 'clearBlockedChannelIds' : 'renewBlockedChannelIds';
    const categoryKey = mode === 'clear' ? 'clearBlockedCategoryIds' : 'renewBlockedCategoryIds';

    const channelIdStr = String(channelId || '').trim();
    const categoryIdStr = String(parentCategoryId || '').trim();

    if (channelIdStr && rules[channelKey].includes(channelIdStr)) return true;
    if (categoryIdStr && rules[categoryKey].includes(categoryIdStr)) return true;
    return false;
  }

  function setGuildModerationLimits(guildId, limits = {}) {
    const gid = String(guildId || '');
    if (!gid) return getGuildModerationLimits(gid);

    const state = readState();
    ensureGuild(state, gid);

    const current = getGuildModerationLimits(gid);
    const rawClear = Number.parseInt(limits.clearMax, 10);
    const rawBan = Number.parseInt(limits.banPerMinute, 10);

    const next = {
      clearMax: Number.isInteger(rawClear) ? Math.min(100, Math.max(1, rawClear)) : current.clearMax,
      banPerMinute: Number.isInteger(rawBan) ? Math.min(30, Math.max(1, rawBan)) : current.banPerMinute
    };

    state.guildSettings[gid].moderationLimits = next;
    writeState(state);
    return next;
  }

  function getGuildJoinSettings(guildId) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultJoinSettings();
    const state = readState();
    return normalizeJoinSettings(state.guildSettings[gid]?.joinSettings);
  }

  function setGuildJoinSettings(guildId, partialSettings = {}) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultJoinSettings();

    const state = readState();
    ensureGuild(state, gid);

    const current = normalizeJoinSettings(state.guildSettings[gid].joinSettings);
    const next = normalizeJoinSettings({
      ...current,
      ...(partialSettings && typeof partialSettings === 'object' ? partialSettings : {})
    });

    state.guildSettings[gid].joinSettings = next;
    writeState(state);
    return next;
  }

  function getGuildMuteSettings(guildId) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultMuteSettings();
    const state = readState();
    return normalizeMuteSettings(state.guildSettings[gid]?.muteSettings);
  }

  function setGuildMuteSettings(guildId, partialSettings = {}) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultMuteSettings();

    const state = readState();
    ensureGuild(state, gid);

    const current = normalizeMuteSettings(state.guildSettings[gid].muteSettings);
    const next = normalizeMuteSettings({
      ...current,
      ...(partialSettings && typeof partialSettings === 'object' ? partialSettings : {})
    });

    state.guildSettings[gid].muteSettings = next;
    writeState(state);
    return next;
  }

  function getGuildBadWordsSettings(guildId) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultBadWordsSettings();
    const state = readState();
    return normalizeBadWordsSettings(state.guildSettings[gid]?.badWordsSettings);
  }

  function setGuildBadWordsSettings(guildId, partialSettings = {}) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultBadWordsSettings();

    const state = readState();
    ensureGuild(state, gid);

    const current = normalizeBadWordsSettings(state.guildSettings[gid].badWordsSettings);
    const next = normalizeBadWordsSettings({
      ...current,
      ...(partialSettings && typeof partialSettings === 'object' ? partialSettings : {})
    });

    state.guildSettings[gid].badWordsSettings = next;
    writeState(state);
    return next;
  }

  function addGuildBadWord(guildId, word) {
    const safeWord = normalizeBadWord(word);
    if (!safeWord) return getGuildBadWordsSettings(guildId);

    const current = getGuildBadWordsSettings(guildId);
    const words = [...current.words];
    if (!words.includes(safeWord)) words.push(safeWord);
    return setGuildBadWordsSettings(guildId, { words });
  }

  function deleteGuildBadWord(guildId, word) {
    const safeWord = normalizeBadWord(word);
    const current = getGuildBadWordsSettings(guildId);
    const words = current.words.filter((entry) => entry !== safeWord);
    return setGuildBadWordsSettings(guildId, { words });
  }

  function clearGuildBadWords(guildId) {
    return setGuildBadWordsSettings(guildId, { words: [] });
  }

  function getGuildSupportSettings(guildId) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultSupportSettings();
    const state = readState();
    return normalizeSupportSettings(state.guildSettings[gid]?.supportSettings);
  }

  function setGuildSupportSettings(guildId, partialSettings = {}) {
    const gid = String(guildId || '');
    if (!gid) return createDefaultSupportSettings();

    const state = readState();
    ensureGuild(state, gid);

    const current = normalizeSupportSettings(state.guildSettings[gid].supportSettings);
    const next = normalizeSupportSettings({
      ...current,
      ...(partialSettings && typeof partialSettings === 'object' ? partialSettings : {})
    });

    state.guildSettings[gid].supportSettings = next;
    writeState(state);
    return next;
  }

  function getGuildActiveMutes(guildId) {
    const gid = String(guildId || '');
    if (!gid) return {};
    const state = readState();
    return normalizeActiveMutes(state.guildSettings[gid]?.activeMutes);
  }

  function setGuildActiveMute(guildId, userId, muteData = {}) {
    const gid = String(guildId || '');
    const uid = String(userId || '').trim();
    if (!gid || !/^\d+$/.test(uid)) return null;

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].activeMutes[uid] = normalizeActiveMuteEntry(muteData);
    writeState(state);
    return state.guildSettings[gid].activeMutes[uid];
  }

  function deleteGuildActiveMute(guildId, userId) {
    const gid = String(guildId || '');
    const uid = String(userId || '').trim();
    if (!gid || !uid) return false;

    const state = readState();
    ensureGuild(state, gid);
    const hadEntry = Boolean(state.guildSettings[gid].activeMutes[uid]);
    delete state.guildSettings[gid].activeMutes[uid];
    writeState(state);
    return hadEntry;
  }

  function getGuildSanctions(guildId) {
    const gid = String(guildId || '');
    if (!gid) return {};
    const state = readState();
    return normalizeSanctions(state.guildSettings[gid]?.sanctions);
  }

  function getMemberSanctions(guildId, userId) {
    const uid = String(userId || '').trim();
    if (!uid) return [];
    return normalizeSanctions(getGuildSanctions(guildId))[uid] || [];
  }

  function setMemberSanctions(guildId, userId, sanctions) {
    const gid = String(guildId || '');
    const uid = String(userId || '').trim();
    if (!gid || !/^\d+$/.test(uid)) return [];

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].sanctions[uid] = normalizeSanctionList(sanctions);
    writeState(state);
    return state.guildSettings[gid].sanctions[uid];
  }

  function addMemberSanction(guildId, userId, sanctionData = {}) {
    const current = getMemberSanctions(guildId, userId);
    const next = [...current, normalizeSanctionEntry(sanctionData)];
    setMemberSanctions(guildId, userId, next);
    return next[next.length - 1];
  }

  function clearMemberSanctions(guildId, userId) {
    const gid = String(guildId || '');
    const uid = String(userId || '').trim();
    if (!gid || !/^\d+$/.test(uid)) return 0;

    const state = readState();
    ensureGuild(state, gid);
    const removed = Array.isArray(state.guildSettings[gid].sanctions[uid]) ? state.guildSettings[gid].sanctions[uid].length : 0;
    delete state.guildSettings[gid].sanctions[uid];
    writeState(state);
    return removed;
  }

  function clearAllGuildSanctions(guildId) {
    const gid = String(guildId || '');
    if (!gid) return 0;

    const state = readState();
    ensureGuild(state, gid);

    const totalRemoved = Object.values(state.guildSettings[gid].sanctions || {}).reduce(
      (count, entries) => count + (Array.isArray(entries) ? entries.length : 0),
      0
    );

    state.guildSettings[gid].sanctions = {};
    writeState(state);
    return totalRemoved;
  }

  function getGuildPicOnlyChannelIds(guildId) {
    const gid = String(guildId || '');
    if (!gid) return [];
    const state = readState();
    return normalizeIdList(state.guildSettings[gid]?.picOnlyChannelIds);
  }

  function setGuildPicOnlyChannels(guildId, channelIds) {
    const gid = String(guildId || '');
    if (!gid) return [];

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].picOnlyChannelIds = normalizeIdList(channelIds);
    writeState(state);
    return state.guildSettings[gid].picOnlyChannelIds;
  }

  function addGuildPicOnlyChannel(guildId, channelId) {
    const gid = String(guildId || '');
    const cid = String(channelId || '').trim();
    if (!gid || !/^\d+$/.test(cid)) return [];

    const current = getGuildPicOnlyChannelIds(guildId);
    if (current.includes(cid)) return current;
    return setGuildPicOnlyChannels(gid, [...current, cid]);
  }

  function deleteGuildPicOnlyChannel(guildId, channelId) {
    const gid = String(guildId || '');
    const cid = String(channelId || '').trim();
    if (!gid || !cid) return [];

    const current = getGuildPicOnlyChannelIds(guildId);
    return setGuildPicOnlyChannels(gid, current.filter((entry) => entry !== cid));
  }

  function getGuildWhitelistUserIds(guildId) {
    const gid = String(guildId || '');
    if (!gid) return [];
    const state = readState();
    return normalizeIdList(state.guildSettings[gid]?.whitelistUserIds);
  }

  function setGuildWhitelistUserIds(guildId, userIds) {
    const gid = String(guildId || '');
    if (!gid) return [];

    const state = readState();
    ensureGuild(state, gid);
    state.guildSettings[gid].whitelistUserIds = normalizeIdList(userIds);
    writeState(state);
    return state.guildSettings[gid].whitelistUserIds;
  }

  function addGuildWhitelistUser(guildId, userId) {
    const gid = String(guildId || '');
    const uid = String(userId || '').trim();
    if (!gid || !/^\d+$/.test(uid)) return [];

    const current = getGuildWhitelistUserIds(guildId);
    if (current.includes(uid)) return current;
    return setGuildWhitelistUserIds(gid, [...current, uid]);
  }

  function removeRolesFromAllPermissions(guildId, roleIds) {
    const gid = String(guildId || '');
    const targets = normalizeIdList(roleIds);
    if (!gid || targets.length === 0) {
      return { removedRoleIds: [], permissionLinksRemoved: 0, commandLinksRemoved: 0 };
    }

    const state = readState();
    ensureGuild(state, gid);

    let permissionLinksRemoved = 0;
    let commandLinksRemoved = 0;

    for (let index = 1; index <= 9; index += 1) {
      const key = String(index);
      const current = normalizeIdList(state.guildSettings[gid].perms[key]?.roleIds);
      const next = current.filter((roleId) => !targets.includes(roleId));
      permissionLinksRemoved += current.length - next.length;
      state.guildSettings[gid].perms[key].roleIds = next;
    }

    const commandRoles = state.guildSettings[gid].commandRoles || {};
    for (const [commandName, roleList] of Object.entries(commandRoles)) {
      const current = normalizeIdList(roleList);
      const next = current.filter((roleId) => !targets.includes(roleId));
      commandLinksRemoved += current.length - next.length;
      state.guildSettings[gid].commandRoles[commandName] = next;
    }

    writeState(state);

    return {
      removedRoleIds: targets,
      permissionLinksRemoved,
      commandLinksRemoved
    };
  }

  function clearAllRolePermissions(guildId) {
    const gid = String(guildId || '');
    if (!gid) {
      return { clearedPermissionLinks: 0, clearedCommandLinks: 0 };
    }

    const state = readState();
    ensureGuild(state, gid);

    let clearedPermissionLinks = 0;
    for (let index = 1; index <= 9; index += 1) {
      const key = String(index);
      const current = normalizeIdList(state.guildSettings[gid].perms[key]?.roleIds);
      clearedPermissionLinks += current.length;
      state.guildSettings[gid].perms[key].roleIds = [];
    }

    const commandRoles = state.guildSettings[gid].commandRoles || {};
    let clearedCommandLinks = 0;
    for (const roles of Object.values(commandRoles)) {
      clearedCommandLinks += normalizeIdList(roles).length;
    }

    state.guildSettings[gid].commandRoles = {};
    writeState(state);

    return {
      clearedPermissionLinks,
      clearedCommandLinks
    };
  }

  return {
    getSysUserId,
    getOwnerUserIds,
    isSys,
    isOwner,
    isBuyer,
    canUseAdminCommands,
    setOwnerUserIds,
    setGuildLogChannel,
    getGuildLogChannel,
    getGuildQuickLinks,
    setGuildQuickLinks,
    setCommandRoles,
    getCommandRoles,
    getAllCommandRoles,
    getGuildModerationLimits,
    setGuildModerationLimits,
    getGuildSecureRules,
    setGuildSecureRules,
    isActionBlockedForChannel,
    getGuildPerms,
    setPermRoles,
    setPermCommands,
    getPermRoles,
    getPermCommands,
    getPermForRole,
    getPermForUser,
    getAllPerms,
    getAllUserPerms,
    getUserPermCommands,
    addUserPermCommand,
    getAllGuildIds,
    getGuildJoinSettings,
    setGuildJoinSettings,
    getGuildMuteSettings,
    setGuildMuteSettings,
    getGuildBadWordsSettings,
    setGuildBadWordsSettings,
    addGuildBadWord,
    deleteGuildBadWord,
    clearGuildBadWords,
    getGuildSupportSettings,
    setGuildSupportSettings,
    getGuildActiveMutes,
    setGuildActiveMute,
    deleteGuildActiveMute,
    getGuildSanctions,
    getMemberSanctions,
    setMemberSanctions,
    addMemberSanction,
    clearMemberSanctions,
    clearAllGuildSanctions,
    getGuildPicOnlyChannelIds,
    addGuildPicOnlyChannel,
    deleteGuildPicOnlyChannel,
    getGuildWhitelistUserIds,
    addGuildWhitelistUser,
    removeRolesFromAllPermissions,
    clearAllRolePermissions
  };
}

function ensureFile(filePath) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(
      filePath,
      JSON.stringify({ ownerUserIds: [], guildSettings: {} }, null, 2),
      'utf8'
    );
  }
}

function normalizeState(value) {
  const state = value && typeof value === 'object' ? { ...value } : {};
  if (!Array.isArray(state.ownerUserIds)) state.ownerUserIds = [];
  if (!state.guildSettings || typeof state.guildSettings !== 'object') state.guildSettings = {};

  for (const [gid, rawGuild] of Object.entries(state.guildSettings)) {
    const guild = rawGuild && typeof rawGuild === 'object' ? rawGuild : {};

    guild.ownerUserIds = normalizeIdList(guild.ownerUserIds);

    if (!guild.commandRoles || typeof guild.commandRoles !== 'object') {
      guild.commandRoles = {};
    }
    for (const [command, roles] of Object.entries(guild.commandRoles)) {
      guild.commandRoles[String(command).toLowerCase()] = normalizeIdList(roles);
    }

    guild.quickLinks = normalizeQuickLinks(guild.quickLinks);
    guild.secureRules = normalizeSecureRules(guild.secureRules);
    guild.joinSettings = normalizeJoinSettings(guild.joinSettings);
    guild.muteSettings = normalizeMuteSettings(guild.muteSettings);
    guild.badWordsSettings = normalizeBadWordsSettings(guild.badWordsSettings);
    guild.supportSettings = normalizeSupportSettings(guild.supportSettings);
    guild.activeMutes = normalizeActiveMutes(guild.activeMutes);
    guild.sanctions = normalizeSanctions(guild.sanctions);
    guild.picOnlyChannelIds = normalizeIdList(guild.picOnlyChannelIds);
    guild.whitelistUserIds = normalizeIdList(guild.whitelistUserIds);

    if (!guild.userPerms || typeof guild.userPerms !== 'object') {
      guild.userPerms = {};
    }
    for (const [uid, commands] of Object.entries(guild.userPerms)) {
      const cleanUid = String(uid || '').trim();
      if (!/^\d+$/.test(cleanUid)) {
        delete guild.userPerms[uid];
        continue;
      }
      guild.userPerms[cleanUid] = normalizeCommandList(commands);
      if (cleanUid !== uid) delete guild.userPerms[uid];
    }

    ensurePerms(guild);

    state.guildSettings[gid] = guild;
  }

  return state;
}

function ensureGuild(state, guildId) {
  if (!state.guildSettings[guildId] || typeof state.guildSettings[guildId] !== 'object') {
    state.guildSettings[guildId] = {};
  }

  const guild = state.guildSettings[guildId];
  if (!Array.isArray(guild.ownerUserIds)) guild.ownerUserIds = [];
  if (!guild.commandRoles || typeof guild.commandRoles !== 'object') guild.commandRoles = {};
  if (!guild.userPerms || typeof guild.userPerms !== 'object') guild.userPerms = {};
  if (!Array.isArray(guild.quickLinks)) guild.quickLinks = [];
  guild.secureRules = normalizeSecureRules(guild.secureRules);
  guild.joinSettings = normalizeJoinSettings(guild.joinSettings);
  guild.muteSettings = normalizeMuteSettings(guild.muteSettings);
  guild.badWordsSettings = normalizeBadWordsSettings(guild.badWordsSettings);
  guild.supportSettings = normalizeSupportSettings(guild.supportSettings);
  guild.activeMutes = normalizeActiveMutes(guild.activeMutes);
  guild.sanctions = normalizeSanctions(guild.sanctions);
  guild.picOnlyChannelIds = normalizeIdList(guild.picOnlyChannelIds);
  guild.whitelistUserIds = normalizeIdList(guild.whitelistUserIds);
  ensurePerms(guild);
}

function ensurePerms(guildSettings) {
  if (!guildSettings.perms || typeof guildSettings.perms !== 'object') {
    guildSettings.perms = createDefaultPerms();
    return;
  }

  for (let i = 1; i <= 9; i += 1) {
    const key = String(i);
    if (!guildSettings.perms[key] || typeof guildSettings.perms[key] !== 'object') {
      guildSettings.perms[key] = { roleIds: [], commands: [] };
      continue;
    }

    guildSettings.perms[key].roleIds = normalizeIdList(guildSettings.perms[key].roleIds);
    guildSettings.perms[key].commands = normalizeCommandList(guildSettings.perms[key].commands);
  }

  if (!guildSettings.perms.publique || typeof guildSettings.perms.publique !== 'object') {
    guildSettings.perms.publique = { roleIds: [], commands: [] };
    return;
  }

  guildSettings.perms.publique.roleIds = [];
  guildSettings.perms.publique.commands = normalizeCommandList(guildSettings.perms.publique.commands);
}

function createDefaultPerms() {
  const perms = {};
  for (let i = 1; i <= 9; i += 1) {
    perms[String(i)] = { roleIds: [], commands: [] };
  }
  perms.publique = { roleIds: [], commands: [] };
  return perms;
}

function normalizePermKey(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw === 'publique' || raw === 'public') return 'publique';

  const parsed = Number.parseInt(raw, 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 9) return '';
  return String(parsed);
}

function normalizeIdList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((id) => String(id || '').trim())
        .filter((id) => /^\d+$/.test(id))
    )
  ];
}

function normalizeCommandList(value) {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .map((command) => String(command || '').trim().toLowerCase())
        .filter(Boolean)
    )
  ];
}

function normalizeQuickLinks(input) {
  if (!Array.isArray(input)) return [];

  return input
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({
      label: String(entry.label || '').trim(),
      type: String(entry.type || '').trim().toLowerCase(),
      url: entry.url ? String(entry.url).trim() : undefined,
      channelId: entry.channelId ? String(entry.channelId).trim() : undefined
    }))
    .filter((entry) => {
      if (!entry.label) return false;
      if (entry.type === 'url') return /^https?:\/\//i.test(String(entry.url || ''));
      if (entry.type === 'channel') return /^\d+$/.test(String(entry.channelId || ''));
      return false;
    })
    .slice(0, 5);
}

function createDefaultJoinSettings() {
  return {
    enabled: false,
    channelId: null,
    message: 'Bienvenue {MemberMention} sur le serveur.'
  };
}

function normalizeJoinSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  const defaults = createDefaultJoinSettings();

  return {
    enabled: source.enabled === true,
    channelId: /^\d+$/.test(String(source.channelId || '').trim()) ? String(source.channelId).trim() : null,
    message: String(source.message || defaults.message).trim().slice(0, 2000) || defaults.message
  };
}

function createDefaultMuteSettings() {
  return {
    roleId: null,
    roleName: 'Muet'
  };
}

function normalizeMuteSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  const defaults = createDefaultMuteSettings();

  return {
    roleId: /^\d+$/.test(String(source.roleId || '').trim()) ? String(source.roleId).trim() : null,
    roleName: String(source.roleName || defaults.roleName).trim().slice(0, 100) || defaults.roleName
  };
}

function createDefaultBadWordsSettings() {
  return {
    enabled: false,
    words: []
  };
}

function normalizeBadWord(word) {
  return String(word || '').trim().toLowerCase().replace(/\s+/g, ' ').slice(0, 80);
}

function normalizeBadWordsSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled === true,
    words: [
      ...new Set(
        (Array.isArray(source.words) ? source.words : [])
          .map((word) => normalizeBadWord(word))
          .filter(Boolean)
      )
    ].slice(0, 200)
  };
}

function createDefaultSupportSettings() {
  return {
    enabled: false,
    roleId: null,
    matchText: '',
    source: 'status'
  };
}

function normalizeSupportSource(value) {
  const source = String(value || '').trim().toLowerCase();
  if (source === 'activity' || source === 'guild') return 'activity';
  if (source === 'both') return 'both';
  return 'status';
}

function normalizeSupportSettings(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    enabled: source.enabled === true,
    roleId: /^\d+$/.test(String(source.roleId || '').trim()) ? String(source.roleId).trim() : null,
    matchText: String(source.matchText || '').trim().slice(0, 100),
    source: normalizeSupportSource(source.source)
  };
}

function normalizeActiveMuteEntry(input) {
  const source = input && typeof input === 'object' ? input : {};
  const expiresAt = Number.parseInt(source.expiresAt, 10);

  return {
    expiresAt: Number.isInteger(expiresAt) ? expiresAt : Date.now(),
    moderatorId: /^\d+$/.test(String(source.moderatorId || '').trim()) ? String(source.moderatorId).trim() : null,
    reason: String(source.reason || '').trim().slice(0, 500) || 'Aucune raison',
    roleId: /^\d+$/.test(String(source.roleId || '').trim()) ? String(source.roleId).trim() : null
  };
}

function normalizeActiveMutes(input) {
  const source = input && typeof input === 'object' ? input : {};
  const output = {};

  for (const [userId, muteData] of Object.entries(source)) {
    const uid = String(userId || '').trim();
    if (!/^\d+$/.test(uid)) continue;
    output[uid] = normalizeActiveMuteEntry(muteData);
  }

  return output;
}

function normalizeSanctionEntry(input) {
  const source = input && typeof input === 'object' ? input : {};
  const createdAt = Number.parseInt(source.createdAt, 10);

  return {
    type: 'warn',
    moderatorId: /^\d+$/.test(String(source.moderatorId || '').trim()) ? String(source.moderatorId).trim() : null,
    reason: String(source.reason || '').trim().slice(0, 500) || 'Aucune raison',
    createdAt: Number.isInteger(createdAt) ? createdAt : Date.now()
  };
}

function normalizeSanctionList(input) {
  return Array.isArray(input) ? input.map((entry) => normalizeSanctionEntry(entry)) : [];
}

function normalizeSanctions(input) {
  const source = input && typeof input === 'object' ? input : {};
  const output = {};

  for (const [userId, sanctions] of Object.entries(source)) {
    const uid = String(userId || '').trim();
    if (!/^\d+$/.test(uid)) continue;
    output[uid] = normalizeSanctionList(sanctions);
  }

  return output;
}

function createDefaultSecureRules() {
  return {
    clearBlockedChannelIds: [],
    clearBlockedCategoryIds: [],
    renewBlockedChannelIds: [],
    renewBlockedCategoryIds: []
  };
}

function normalizeSecureRules(input) {
  const source = input && typeof input === 'object' ? input : {};
  return {
    clearBlockedChannelIds: normalizeIdList(source.clearBlockedChannelIds),
    clearBlockedCategoryIds: normalizeIdList(source.clearBlockedCategoryIds),
    renewBlockedChannelIds: normalizeIdList(source.renewBlockedChannelIds),
    renewBlockedCategoryIds: normalizeIdList(source.renewBlockedCategoryIds)
  };
}

module.exports = { createAccessStore };