const CHANNEL_MAP = {
  blr_add_logs: 'blrAddLogsChannel',
  blr_remove_logs: 'blrRemoveLogsChannel',
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
    blr_add_logs: row.blrAddLogsChannel || '',
    blr_remove_logs: row.blrRemoveLogsChannel || '',
  };
}

function getSelectedChannelIds(config) {
  return {
    blr_add_logs: config?.blr_add_logs || null,
    blr_remove_logs: config?.blr_remove_logs || null,
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
  BLR_ADD_LOG_CHANNEL_ID_FIELD: 'blr_add_logs',
  BLR_REMOVE_LOG_CHANNEL_ID_FIELD: 'blr_remove_logs',
};
