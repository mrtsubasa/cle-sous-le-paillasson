const CHANNEL_MAP = {
  role_limit_logs: 'roleLimitLogsChannel',
  role_limit_overflow_logs: 'roleLimitOverflowLogsChannel',
  bypass_add_logs: 'bypassAddLogsChannel',
  bypass_remove_logs: 'bypassRemoveLogsChannel',
  del_limite_logs: 'delLimitLogsChannel',
};

const FIELD_MAP = CHANNEL_MAP;

function ensureGuildSettingsRow(bot, guildId) {
  if (!bot?.db || !guildId) return null;

  let row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    bot.db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
    row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }

  return row;
}

function getConfiguredLogChannelId(bot, guildId, key) {
  if (!bot?.db || !guildId || !key) return null;

  const column = CHANNEL_MAP[key];
  if (!column) return null;

  const row = ensureGuildSettingsRow(bot, guildId);
  const channelId = row?.[column];
  return typeof channelId === 'string' && channelId.trim() ? channelId.trim() : null;
}

function getLogChannelConfig(bot, guildId) {
  const row = ensureGuildSettingsRow(bot, guildId);
  if (!row) return null;

  return {
    role_limit_logs: row.roleLimitLogsChannel || '',
    role_limit_overflow_logs: row.roleLimitOverflowLogsChannel || '',
    bypass_add_logs: row.bypassAddLogsChannel || '',
    bypass_remove_logs: row.bypassRemoveLogsChannel || '',
    del_limite_logs: row.delLimitLogsChannel || '',
  };
}

function getSelectedChannelIds(config) {
  return {
    role_limit_logs: config?.role_limit_logs || null,
    role_limit_overflow_logs: config?.role_limit_overflow_logs || null,
    bypass_add_logs: config?.bypass_add_logs || null,
    bypass_remove_logs: config?.bypass_remove_logs || null,
    del_limite_logs: config?.del_limite_logs || null,
  };
}

function setLogChannel(bot, guildId, field, channelId) {
  if (!bot?.db || !guildId || !field) return;

  const column = FIELD_MAP[field] || field;
  if (!Object.values(CHANNEL_MAP).includes(column)) return;

  ensureGuildSettingsRow(bot, guildId);
  bot.db.prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`).run(channelId || '', guildId);
}

module.exports = {
  getConfiguredLogChannelId,
  getLogChannelConfig,
  getSelectedChannelIds,
  setLogChannel,
  ROLE_LIMIT_LOG_CHANNEL_ID_FIELD: 'role_limit_logs',
  ROLE_LIMIT_OVERFLOW_LOG_CHANNEL_ID_FIELD: 'role_limit_overflow_logs',
  BYPASS_ADD_LOG_CHANNEL_ID_FIELD: 'bypass_add_logs',
  BYPASS_REMOVE_LOG_CHANNEL_ID_FIELD: 'bypass_remove_logs',
  DEL_LIMIT_LOG_CHANNEL_ID_FIELD: 'del_limite_logs',
};
