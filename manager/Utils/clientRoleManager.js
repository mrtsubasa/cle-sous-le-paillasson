const fs = require('fs');
const path = require('path');
const config = require('../config.json');
const { readJsonConfig } = require('./tokenVault');

function getClientRoleId() {
  return (
    config.clientRoleId ||
    config?.role?.client ||
    config?.roles?.client ||
    process.env.CLIENT_ROLE_ID ||
    null
  );
}

function getTargetGuild(bot) {
  const guildId = config.guildId || config?.guild?.id || process.env.CLIENT_GUILD_ID || null;

  if (guildId) {
    return bot.guilds.cache.get(guildId) || null;
  }

  return bot.guilds.cache.first() || null;
}

function getBotStorageId(row) {
  return row?.folder || row?.botId;
}

function getBotConfig(botStorageId) {
  const configPath = path.join(__dirname, '..', 'BotRuntimes', botStorageId, 'config.json');
  return readJsonConfig(configPath, { migrateToken: false });
}

function getInterestedUserIdsFromRow(row, botConfig) {
  const ids = new Set();

  const currentOwnerId = botConfig?.ownerId || row?.ownerId || botConfig?.buyerId || null;
  if (currentOwnerId) {
    ids.add(String(currentOwnerId));
  }

  if (Array.isArray(botConfig?.buyers)) {
    for (const buyerId of botConfig.buyers) {
      if (buyerId) ids.add(String(buyerId));
    }
  }

  if (Array.isArray(botConfig?.buyer)) {
    for (const buyerId of botConfig.buyer) {
      if (buyerId) ids.add(String(buyerId));
    }
  }

  const fallbackBuyer = botConfig?.buyerId;
  if (fallbackBuyer) {
    ids.add(String(fallbackBuyer));
  }

  return [...ids];
}

function getCurrentOwnerIdFromRow(row, botConfig) {
  return botConfig?.ownerId || row?.ownerId || botConfig?.buyerId || null;
}

async function countActiveBotsForUser(bot, userId) {
  const rows = bot.db.prepare("SELECT * FROM bot WHERE expired != 'true'").all();
  let count = 0;

  for (const row of rows) {
    const botStorageId = getBotStorageId(row);
    const botConfig = getBotConfig(botStorageId);

    const userIds = getInterestedUserIdsFromRow(row, botConfig);
    if (userIds.includes(String(userId))) {
      count += 1;
    }
  }

  return count;
}

async function syncClientRoleForUser(bot, userId) {
  const roleId = getClientRoleId();
  if (!roleId || !userId) return { skipped: true, reason: 'missing_role_or_user' };

  const guild = getTargetGuild(bot);
  if (!guild) return { skipped: true, reason: 'missing_guild' };

  const role = guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null);
  if (!role) return { skipped: true, reason: 'missing_role' };

  const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
  if (!member) return { skipped: true, reason: 'missing_member' };

  const activeCount = await countActiveBotsForUser(bot, userId);
  const hasRole = member.roles.cache.has(roleId);

  if (activeCount > 0 && !hasRole) {
    await member.roles.add(roleId).catch(() => {});
    return { updated: true, action: 'added', activeCount };
  }

  if (activeCount < 1 && hasRole) {
    await member.roles.remove(roleId).catch(() => {});
    return { updated: true, action: 'removed', activeCount };
  }

  return { updated: false, activeCount, hasRole };
}

async function syncClientRoleForUsers(bot, userIds) {
  const uniqueIds = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean).map(String))];
  const results = [];

  for (const userId of uniqueIds) {
    results.push(await syncClientRoleForUser(bot, userId));
  }

  return results;
}

async function syncAllClientRoles(bot) {
  const rows = bot.db.prepare('SELECT * FROM bot').all();
  const userIds = new Set();

  for (const row of rows) {
    const botConfig = getBotConfig(getBotStorageId(row));
    for (const userId of getInterestedUserIdsFromRow(row, botConfig)) {
      userIds.add(userId);
    }
  }

  const roleId = getClientRoleId();
  const guild = getTargetGuild(bot);

  if (roleId && guild) {
    await guild.members.fetch().catch(() => null);

    for (const member of guild.members.cache.values()) {
      if (member.roles.cache.has(roleId)) {
        userIds.add(member.id);
      }
    }
  }

  return syncClientRoleForUsers(bot, [...userIds]);
}

module.exports = {
  getClientRoleId,
  getInterestedUserIdsFromRow,
  getCurrentOwnerIdFromRow,
  syncAllClientRoles,
  syncClientRoleForUser,
  syncClientRoleForUsers,
};
