function ensureGuildRow(bot, guildId) {
  if (!bot?.db || !guildId) return null;

  let row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  if (!row) {
    bot.db.prepare('INSERT INTO guilds (id) VALUES (?)').run(guildId);
    row = bot.db.prepare('SELECT * FROM guilds WHERE id = ?').get(guildId);
  }

  return row;
}

function normalizeGuildId(guildId) {
  const value = String(guildId || '').trim();
  return /^\d{17,20}$/.test(value) ? value : '';
}

function normalizeWebhookUrl(url) {
  const value = String(url || '').trim();
  if (!value) return '';
  return /^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d{17,20}\/[^\s]+$/i.test(value) ? value : '';
}

const VOICE_LOG_CHANNEL_COLUMNS = {
  join: 'voiceJoinLogsChannelId',
  leave: 'voiceLeaveLogsChannelId',
  move: 'voiceMoveLogsChannelId',
  mute_mic: 'voiceMuteMicLogsChannelId',
  mute_headset: 'voiceMuteHeadsetLogsChannelId',
  mute_both: 'voiceMuteBothLogsChannelId',
  unmute_mic: 'voiceUnmuteMicLogsChannelId',
  unmute_headset: 'voiceUnmuteHeadsetLogsChannelId',
  unmute_both: 'voiceUnmuteBothLogsChannelId',
  stream_start: 'voiceStreamStartLogsChannelId',
  stream_stop: 'voiceStreamStopLogsChannelId',
  cam_on: 'voiceCamOnLogsChannelId',
  cam_off: 'voiceCamOffLogsChannelId',
};

const MEMBER_LOG_CHANNEL_COLUMNS = {
  join: 'memberJoinLogsChannelId',
  leave: 'memberLeaveLogsChannelId',
  name: 'memberNameLogsChannelId',
};

const MESSAGE_LOG_CHANNEL_COLUMNS = {
  delete: 'messageDeleteLogsChannelId',
  bulk_delete: 'messageBulkDeleteLogsChannelId',
  edit: 'messageEditLogsChannelId',
  embed_delete: 'messageEmbedDeleteLogsChannelId',
};

const ROLE_LOG_CHANNEL_COLUMNS = {
  add: 'roleAddLogsChannelId',
  remove: 'roleRemoveLogsChannelId',
};

const MOD_LOG_CHANNEL_COLUMNS = {
  to: 'modToLogsChannelId',
  unto: 'modUntoLogsChannelId',
  kick: 'modKickLogsChannelId',
  ban: 'modBanLogsChannelId',
  unban: 'modUnbanLogsChannelId',
};

const SERVER_ROLE_LOG_CHANNEL_COLUMNS = {
  create: 'serverRoleCreateLogsChannelId',
  delete: 'serverRoleDeleteLogsChannelId',
  update: 'serverRoleUpdateLogsChannelId',
};

const EMOJI_LOG_CHANNEL_COLUMNS = {
  create: 'emojiCreateLogsChannelId',
  delete: 'emojiDeleteLogsChannelId',
  update: 'emojiUpdateLogsChannelId',
};

const CHANNEL_LOG_CHANNEL_COLUMNS = {
  create: 'channelCreateLogsChannelId',
  delete: 'channelDeleteLogsChannelId',
  update: 'channelUpdateLogsChannelId',
};

const STICKER_LOG_CHANNEL_COLUMNS = {
  create: 'stickerCreateLogsChannelId',
  delete: 'stickerDeleteLogsChannelId',
  update: 'stickerUpdateLogsChannelId',
};

const WEBHOOK_LOG_CHANNEL_COLUMNS = {
  create: 'webhookCreateLogsChannelId',
  delete: 'webhookDeleteLogsChannelId',
  update: 'webhookUpdateLogsChannelId',
};

const INVITE_LOG_CHANNEL_COLUMNS = {
  create: 'inviteCreateLogsChannelId',
  delete: 'inviteDeleteLogsChannelId',
};

const GUILD_LOG_CHANNEL_COLUMNS = {
  update: 'guildUpdateLogsChannelId',
  unavailable: 'guildUnavailableLogsChannelId',
};

const GUILD_SCHEDULED_EVENT_LOG_CHANNEL_COLUMNS = {
  create: 'guildScheduledEventCreateLogsChannelId',
  delete: 'guildScheduledEventDeleteLogsChannelId',
  update: 'guildScheduledEventUpdateLogsChannelId',
  user_add: 'guildScheduledEventUserAddLogsChannelId',
  user_remove: 'guildScheduledEventUserRemoveLogsChannelId',
};

const SOUNDBOARD_LOG_CHANNEL_COLUMNS = {
  create: 'soundboardSoundCreateLogsChannelId',
  delete: 'soundboardSoundDeleteLogsChannelId',
  update: 'soundboardSoundUpdateLogsChannelId',
  sounds_update: 'soundboardSoundsUpdateLogsChannelId',
  sounds: 'soundboardSoundsLogsChannelId',
};

const STAGE_LOG_CHANNEL_COLUMNS = {
  create: 'stageInstanceCreateLogsChannelId',
  delete: 'stageInstanceDeleteLogsChannelId',
  update: 'stageInstanceUpdateLogsChannelId',
};

const THREAD_LOG_CHANNEL_COLUMNS = {
  create: 'threadCreateLogsChannelId',
  delete: 'threadDeleteLogsChannelId',
  update: 'threadUpdateLogsChannelId',
  member_update: 'threadMemberUpdateLogsChannelId',
  members_update: 'threadMembersUpdateLogsChannelId',
  list_sync: 'threadListSyncLogsChannelId',
};

const REACTION_LOG_CHANNEL_COLUMNS = {
  add: 'messageReactionAddLogsChannelId',
  remove: 'messageReactionRemoveLogsChannelId',
  remove_all: 'messageReactionRemoveAllLogsChannelId',
  remove_emoji: 'messageReactionRemoveEmojiLogsChannelId',
};

const AUTO_MODERATION_LOG_CHANNEL_COLUMNS = {
  action_execution: 'autoModerationActionExecutionLogsChannelId',
  rule_create: 'autoModerationRuleCreateLogsChannelId',
  rule_delete: 'autoModerationRuleDeleteLogsChannelId',
  rule_update: 'autoModerationRuleUpdateLogsChannelId',
};

const INTEGRATION_LOG_CHANNEL_COLUMNS = {
  create: 'integrationCreateLogsChannelId',
  delete: 'integrationDeleteLogsChannelId',
  update: 'integrationUpdateLogsChannelId',
};

const TYPING_LOG_CHANNEL_COLUMNS = {
  start: 'typingStartLogsChannelId',
};

function getLogsGuildConfig(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);

  return {
    mainGuildId: normalizeGuildId(row?.mainLogsGuildId),
    secondaryGuildId: normalizeGuildId(row?.secondaryLogsGuildId),
  };
}

function saveLogsGuildConfig(bot, guildId, config) {
  if (!bot?.db || !guildId) return getLogsGuildConfig(bot, guildId);

  ensureGuildRow(bot, guildId);

  const mainGuildId = normalizeGuildId(config?.mainGuildId);
  const secondaryGuildId = normalizeGuildId(config?.secondaryGuildId);

  bot.db
    .prepare('UPDATE guilds SET mainLogsGuildId = ?, secondaryLogsGuildId = ? WHERE id = ?')
    .run(mainGuildId, secondaryGuildId, guildId);

  return {
    mainGuildId,
    secondaryGuildId,
  };
}

function getVoiceJoinLogsChannelId(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);
  return normalizeGuildId(row?.voiceJoinLogsChannelId);
}

function getVoiceLeaveLogsChannelId(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);
  return normalizeGuildId(row?.voiceLeaveLogsChannelId);
}

function getVoiceMoveLogsChannelId(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);
  return normalizeGuildId(row?.voiceMoveLogsChannelId);
}

function getVoiceLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = VOICE_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveVoiceJoinLogsChannelId(bot, guildId, channelId) {
  if (!bot?.db || !guildId) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare('UPDATE guilds SET voiceJoinLogsChannelId = ? WHERE id = ?')
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function saveVoiceLeaveLogsChannelId(bot, guildId, channelId) {
  if (!bot?.db || !guildId) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare('UPDATE guilds SET voiceLeaveLogsChannelId = ? WHERE id = ?')
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function saveVoiceMoveLogsChannelId(bot, guildId, channelId) {
  if (!bot?.db || !guildId) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare('UPDATE guilds SET voiceMoveLogsChannelId = ? WHERE id = ?')
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function saveVoiceLogChannelId(bot, guildId, action, channelId) {
  const column = VOICE_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getMemberLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = MEMBER_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveMemberLogChannelId(bot, guildId, action, channelId) {
  const column = MEMBER_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getMemberLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = MEMBER_LOG_CHANNEL_COLUMNS[action] || MEMBER_LOG_CHANNEL_COLUMNS.join;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getMessageLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = MESSAGE_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveMessageLogChannelId(bot, guildId, action, channelId) {
  const column = MESSAGE_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getMessageLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = MESSAGE_LOG_CHANNEL_COLUMNS[action] || MESSAGE_LOG_CHANNEL_COLUMNS.delete;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getMessageEmbedDeleteWebhookUrl(bot, guildId) {
  const row = ensureGuildRow(bot, guildId);
  return normalizeWebhookUrl(row?.messageEmbedDeleteWebhookUrl);
}

function saveMessageEmbedDeleteWebhookUrl(bot, guildId, webhookUrl) {
  if (!bot?.db || !guildId) return '';

  ensureGuildRow(bot, guildId);
  const nextWebhookUrl = normalizeWebhookUrl(webhookUrl);

  bot.db
    .prepare('UPDATE guilds SET messageEmbedDeleteWebhookUrl = ? WHERE id = ?')
    .run(nextWebhookUrl, guildId);

  return nextWebhookUrl;
}

function getVoiceLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = VOICE_LOG_CHANNEL_COLUMNS[action] || VOICE_LOG_CHANNEL_COLUMNS.join;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getVoiceJoinLogTarget(bot, sourceGuildId) {
  return getVoiceLogTarget(bot, sourceGuildId, 'join');
}

function getRoleLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = ROLE_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveRoleLogChannelId(bot, guildId, action, channelId) {
  const column = ROLE_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getRoleLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = ROLE_LOG_CHANNEL_COLUMNS[action] || ROLE_LOG_CHANNEL_COLUMNS.add;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getModLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = MOD_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveModLogChannelId(bot, guildId, action, channelId) {
  const column = MOD_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getModLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = MOD_LOG_CHANNEL_COLUMNS[action] || MOD_LOG_CHANNEL_COLUMNS.to;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getServerRoleLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = SERVER_ROLE_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveServerRoleLogChannelId(bot, guildId, action, channelId) {
  const column = SERVER_ROLE_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getServerRoleLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = SERVER_ROLE_LOG_CHANNEL_COLUMNS[action] || SERVER_ROLE_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getEmojiLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = EMOJI_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveEmojiLogChannelId(bot, guildId, action, channelId) {
  const column = EMOJI_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getEmojiLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = EMOJI_LOG_CHANNEL_COLUMNS[action] || EMOJI_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getChannelLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = CHANNEL_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveChannelLogChannelId(bot, guildId, action, channelId) {
  const column = CHANNEL_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getChannelLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = CHANNEL_LOG_CHANNEL_COLUMNS[action] || CHANNEL_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getStageLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = STAGE_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveStageLogChannelId(bot, guildId, action, channelId) {
  const column = STAGE_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getStageLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = STAGE_LOG_CHANNEL_COLUMNS[action] || STAGE_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getThreadLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = THREAD_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveThreadLogChannelId(bot, guildId, action, channelId) {
  const column = THREAD_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getThreadLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = THREAD_LOG_CHANNEL_COLUMNS[action] || THREAD_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getReactionLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = REACTION_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveReactionLogChannelId(bot, guildId, action, channelId) {
  const column = REACTION_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getReactionLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = REACTION_LOG_CHANNEL_COLUMNS[action] || REACTION_LOG_CHANNEL_COLUMNS.add;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getAutoModerationLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = AUTO_MODERATION_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveAutoModerationLogChannelId(bot, guildId, action, channelId) {
  const column = AUTO_MODERATION_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getAutoModerationLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = AUTO_MODERATION_LOG_CHANNEL_COLUMNS[action] || AUTO_MODERATION_LOG_CHANNEL_COLUMNS.action_execution;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getIntegrationLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = INTEGRATION_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveIntegrationLogChannelId(bot, guildId, action, channelId) {
  const column = INTEGRATION_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getIntegrationLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = INTEGRATION_LOG_CHANNEL_COLUMNS[action] || INTEGRATION_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getTypingLogChannelId(bot, guildId, action = 'start') {
  const row = ensureGuildRow(bot, guildId);
  const column = TYPING_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveTypingLogChannelId(bot, guildId, action, channelId) {
  const column = TYPING_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getTypingLogTarget(bot, sourceGuildId, action = 'start') {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = TYPING_LOG_CHANNEL_COLUMNS[action] || TYPING_LOG_CHANNEL_COLUMNS.start;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getStickerLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = STICKER_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveStickerLogChannelId(bot, guildId, action, channelId) {
  const column = STICKER_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getStickerLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = STICKER_LOG_CHANNEL_COLUMNS[action] || STICKER_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getWebhookLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = WEBHOOK_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveWebhookLogChannelId(bot, guildId, action, channelId) {
  const column = WEBHOOK_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getWebhookLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = WEBHOOK_LOG_CHANNEL_COLUMNS[action] || WEBHOOK_LOG_CHANNEL_COLUMNS.update;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getInviteLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = INVITE_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveInviteLogChannelId(bot, guildId, action, channelId) {
  const column = INVITE_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getInviteLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = INVITE_LOG_CHANNEL_COLUMNS[action] || INVITE_LOG_CHANNEL_COLUMNS.create;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getGuildLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = GUILD_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveGuildLogChannelId(bot, guildId, action, channelId) {
  const column = GUILD_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getGuildLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = GUILD_LOG_CHANNEL_COLUMNS[action] || GUILD_LOG_CHANNEL_COLUMNS.update;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getGuildScheduledEventLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = GUILD_SCHEDULED_EVENT_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveGuildScheduledEventLogChannelId(bot, guildId, action, channelId) {
  const column = GUILD_SCHEDULED_EVENT_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getGuildScheduledEventLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = GUILD_SCHEDULED_EVENT_LOG_CHANNEL_COLUMNS[action]
    || GUILD_SCHEDULED_EVENT_LOG_CHANNEL_COLUMNS.update;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

function getSoundboardLogChannelId(bot, guildId, action) {
  const row = ensureGuildRow(bot, guildId);
  const column = SOUNDBOARD_LOG_CHANNEL_COLUMNS[action];
  return normalizeGuildId(column ? row?.[column] : '');
}

function saveSoundboardLogChannelId(bot, guildId, action, channelId) {
  const column = SOUNDBOARD_LOG_CHANNEL_COLUMNS[action];
  if (!bot?.db || !guildId || !column) return '';

  ensureGuildRow(bot, guildId);
  const nextChannelId = normalizeGuildId(channelId);

  bot.db
    .prepare(`UPDATE guilds SET ${column} = ? WHERE id = ?`)
    .run(nextChannelId, guildId);

  return nextChannelId;
}

function getSoundboardLogTarget(bot, sourceGuildId, action) {
  if (!bot?.db || !sourceGuildId) return null;

  const route = bot.db
    .prepare(`
      SELECT *
      FROM guilds
      WHERE mainLogsGuildId = ?
        AND secondaryLogsGuildId IS NOT NULL
        AND TRIM(secondaryLogsGuildId) != ''
      LIMIT 1
    `)
    .get(sourceGuildId);

  if (!route) return null;

  const secondaryGuildId = normalizeGuildId(route.secondaryLogsGuildId);
  if (!secondaryGuildId) return null;

  const secondaryGuildRow = ensureGuildRow(bot, secondaryGuildId);
  const channelKey = SOUNDBOARD_LOG_CHANNEL_COLUMNS[action] || SOUNDBOARD_LOG_CHANNEL_COLUMNS.update;
  const channelId = normalizeGuildId(secondaryGuildRow?.[channelKey] || route[channelKey]);
  if (!channelId) return null;

  return {
    configGuildId: route.id,
    secondaryGuildId,
    channelId,
  };
}

module.exports = {
  getAutoModerationLogChannelId,
  getAutoModerationLogTarget,
  getChannelLogChannelId,
  getChannelLogTarget,
  getEmojiLogChannelId,
  getEmojiLogTarget,
  getGuildLogChannelId,
  getGuildLogTarget,
  getGuildScheduledEventLogChannelId,
  getGuildScheduledEventLogTarget,
  getIntegrationLogChannelId,
  getIntegrationLogTarget,
  getInviteLogChannelId,
  getInviteLogTarget,
  getLogsGuildConfig,
  getMemberLogChannelId,
  getMemberLogTarget,
  getMessageEmbedDeleteWebhookUrl,
  getMessageLogChannelId,
  getMessageLogTarget,
  getModLogChannelId,
  getModLogTarget,
  getReactionLogChannelId,
  getReactionLogTarget,
  getRoleLogChannelId,
  getRoleLogTarget,
  getServerRoleLogChannelId,
  getServerRoleLogTarget,
  getSoundboardLogChannelId,
  getSoundboardLogTarget,
  getStageLogChannelId,
  getStageLogTarget,
  getStickerLogChannelId,
  getStickerLogTarget,
  getThreadLogChannelId,
  getThreadLogTarget,
  getTypingLogChannelId,
  getTypingLogTarget,
  getWebhookLogChannelId,
  getWebhookLogTarget,
  getVoiceLogTarget,
  getVoiceJoinLogTarget,
  getVoiceJoinLogsChannelId,
  getVoiceLeaveLogsChannelId,
  getVoiceMoveLogsChannelId,
  getVoiceLogChannelId,
  normalizeGuildId,
  saveChannelLogChannelId,
  saveEmojiLogChannelId,
  saveGuildLogChannelId,
  saveGuildScheduledEventLogChannelId,
  saveIntegrationLogChannelId,
  saveInviteLogChannelId,
  saveLogsGuildConfig,
  saveMemberLogChannelId,
  saveMessageEmbedDeleteWebhookUrl,
  saveMessageLogChannelId,
  saveModLogChannelId,
  saveReactionLogChannelId,
  saveAutoModerationLogChannelId,
  saveRoleLogChannelId,
  saveServerRoleLogChannelId,
  saveSoundboardLogChannelId,
  saveStageLogChannelId,
  saveStickerLogChannelId,
  saveThreadLogChannelId,
  saveTypingLogChannelId,
  saveWebhookLogChannelId,
  saveVoiceJoinLogsChannelId,
  saveVoiceLeaveLogsChannelId,
  saveVoiceMoveLogsChannelId,
  saveVoiceLogChannelId,
};
