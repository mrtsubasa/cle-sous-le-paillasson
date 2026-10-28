const Database = require('better-sqlite3');
const path = require('path');
const fs = require('fs');
const { loadRuntimeConfig, getRuntimeDatabasePath } = require('../../../Utils/runtimeContext');

const config = loadRuntimeConfig();
const dbPath = getRuntimeDatabasePath();
fs.mkdirSync(path.dirname(dbPath), { recursive: true });
const db = new Database(dbPath, {
    timeout: 5000 
  });

db.pragma('journal_mode = WAL');


module.exports = () => {
    const defaultPrefix = typeof config.prefix === 'string' && config.prefix.trim()
        ? config.prefix.trim()
        : '$';
    const defaultBuyers = Array.isArray(config.buyers)
        ? JSON.stringify(config.buyers.map((id) => String(id)))
        : JSON.stringify([String(config.buyers || '')].filter(Boolean));

    const sqlString = (value) => `'${String(value).replace(/'/g, "''")}'`;

    function addColumnIfNotExists(tableName, columnName, columnDefinition) {
        const row = db.prepare(`PRAGMA table_info(${tableName})`).all().find(col => col.name === columnName);
        if (!row) {
            console.log(`Ajout de la colonne ${columnName} à la table ${tableName}`);
            db.prepare(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${columnDefinition}`).run();
        }
    }

    db.exec(`CREATE TABLE IF NOT EXISTS bot (id TEXT DEFAULT NULL)`);
    db.exec(`
        CREATE TABLE IF NOT EXISTS guilds (
            id TEXT NOT NULL PRIMARY KEY
        )
    `);

    addColumnIfNotExists('guilds', 'prefix', `TEXT DEFAULT ${sqlString(defaultPrefix)}`);
    addColumnIfNotExists('guilds', 'owner', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'sys', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'wl', "TEXT DEFAULT '[]'");
    addColumnIfNotExists('guilds', 'buyers', `TEXT DEFAULT ${sqlString(defaultBuyers)}`);
    addColumnIfNotExists('guilds', 'serverProfileBio', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'mainLogsGuildId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'secondaryLogsGuildId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceJoinLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceLeaveLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceMoveLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceMuteMicLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceMuteHeadsetLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceMuteBothLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceUnmuteMicLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceUnmuteHeadsetLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceUnmuteBothLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceStreamStartLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceStreamStopLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceCamOnLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'voiceCamOffLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'memberJoinLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'memberLeaveLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'memberNameLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageBulkDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageEditLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageEmbedDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageEmbedDeleteWebhookUrl', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'roleAddLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'roleRemoveLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'modToLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'modUntoLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'modKickLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'modBanLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'modUnbanLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'serverRoleCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'serverRoleDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'serverRoleUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'emojiCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'emojiDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'emojiUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'channelCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'channelDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'channelUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'stickerCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'stickerDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'stickerUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'webhookCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'webhookDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'webhookUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'inviteCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'inviteDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildUnavailableLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildScheduledEventCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildScheduledEventDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildScheduledEventUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildScheduledEventUserAddLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'guildScheduledEventUserRemoveLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'soundboardSoundCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'soundboardSoundDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'soundboardSoundUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'soundboardSoundsUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'soundboardSoundsLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'stageInstanceCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'stageInstanceDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'stageInstanceUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'threadCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'threadDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'threadUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'threadMemberUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'threadMembersUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'threadListSyncLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageReactionAddLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageReactionRemoveLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageReactionRemoveAllLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageReactionRemoveEmojiLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'autoModerationActionExecutionLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'autoModerationRuleCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'autoModerationRuleDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'autoModerationRuleUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'integrationCreateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'integrationDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'integrationUpdateLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'typingStartLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageEmbedDeleteLogsChannelId', "TEXT DEFAULT ''");
    addColumnIfNotExists('guilds', 'messageEmbedDeleteWebhookUrl', "TEXT DEFAULT ''");

    db.prepare(`
        UPDATE guilds
        SET prefix = @prefix
        WHERE prefix IS NULL OR TRIM(prefix) = ''
    `).run({ prefix: defaultPrefix });
    db.prepare(`
        UPDATE guilds
        SET buyers = @buyers
        WHERE buyers IS NULL OR TRIM(buyers) = ''
    `).run({ buyers: defaultBuyers });
    db.prepare(`
        UPDATE guilds
        SET serverProfileBio = ''
        WHERE serverProfileBio IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET mainLogsGuildId = ''
        WHERE mainLogsGuildId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET secondaryLogsGuildId = ''
        WHERE secondaryLogsGuildId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceJoinLogsChannelId = ''
        WHERE voiceJoinLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceLeaveLogsChannelId = ''
        WHERE voiceLeaveLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceMoveLogsChannelId = ''
        WHERE voiceMoveLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceMuteMicLogsChannelId = ''
        WHERE voiceMuteMicLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceMuteHeadsetLogsChannelId = ''
        WHERE voiceMuteHeadsetLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceMuteBothLogsChannelId = ''
        WHERE voiceMuteBothLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceUnmuteMicLogsChannelId = ''
        WHERE voiceUnmuteMicLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceUnmuteHeadsetLogsChannelId = ''
        WHERE voiceUnmuteHeadsetLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceUnmuteBothLogsChannelId = ''
        WHERE voiceUnmuteBothLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceStreamStartLogsChannelId = ''
        WHERE voiceStreamStartLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceStreamStopLogsChannelId = ''
        WHERE voiceStreamStopLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceCamOnLogsChannelId = ''
        WHERE voiceCamOnLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET voiceCamOffLogsChannelId = ''
        WHERE voiceCamOffLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET memberJoinLogsChannelId = ''
        WHERE memberJoinLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET memberLeaveLogsChannelId = ''
        WHERE memberLeaveLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET memberNameLogsChannelId = ''
        WHERE memberNameLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageDeleteLogsChannelId = ''
        WHERE messageDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageBulkDeleteLogsChannelId = ''
        WHERE messageBulkDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageEditLogsChannelId = ''
        WHERE messageEditLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageEmbedDeleteLogsChannelId = ''
        WHERE messageEmbedDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageEmbedDeleteWebhookUrl = ''
        WHERE messageEmbedDeleteWebhookUrl IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET roleAddLogsChannelId = ''
        WHERE roleAddLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET roleRemoveLogsChannelId = ''
        WHERE roleRemoveLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET modToLogsChannelId = ''
        WHERE modToLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET modUntoLogsChannelId = ''
        WHERE modUntoLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET modKickLogsChannelId = ''
        WHERE modKickLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET modBanLogsChannelId = ''
        WHERE modBanLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET modUnbanLogsChannelId = ''
        WHERE modUnbanLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET serverRoleCreateLogsChannelId = ''
        WHERE serverRoleCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET serverRoleDeleteLogsChannelId = ''
        WHERE serverRoleDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET serverRoleUpdateLogsChannelId = ''
        WHERE serverRoleUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET emojiCreateLogsChannelId = ''
        WHERE emojiCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET emojiDeleteLogsChannelId = ''
        WHERE emojiDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET emojiUpdateLogsChannelId = ''
        WHERE emojiUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET channelCreateLogsChannelId = ''
        WHERE channelCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET channelDeleteLogsChannelId = ''
        WHERE channelDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET channelUpdateLogsChannelId = ''
        WHERE channelUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET stickerCreateLogsChannelId = ''
        WHERE stickerCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET stickerDeleteLogsChannelId = ''
        WHERE stickerDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET stickerUpdateLogsChannelId = ''
        WHERE stickerUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET webhookCreateLogsChannelId = ''
        WHERE webhookCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET webhookDeleteLogsChannelId = ''
        WHERE webhookDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET webhookUpdateLogsChannelId = ''
        WHERE webhookUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET inviteCreateLogsChannelId = ''
        WHERE inviteCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET inviteDeleteLogsChannelId = ''
        WHERE inviteDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildUpdateLogsChannelId = ''
        WHERE guildUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildUnavailableLogsChannelId = ''
        WHERE guildUnavailableLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildScheduledEventCreateLogsChannelId = ''
        WHERE guildScheduledEventCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildScheduledEventDeleteLogsChannelId = ''
        WHERE guildScheduledEventDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildScheduledEventUpdateLogsChannelId = ''
        WHERE guildScheduledEventUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildScheduledEventUserAddLogsChannelId = ''
        WHERE guildScheduledEventUserAddLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET guildScheduledEventUserRemoveLogsChannelId = ''
        WHERE guildScheduledEventUserRemoveLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET soundboardSoundCreateLogsChannelId = ''
        WHERE soundboardSoundCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET soundboardSoundDeleteLogsChannelId = ''
        WHERE soundboardSoundDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET soundboardSoundUpdateLogsChannelId = ''
        WHERE soundboardSoundUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET soundboardSoundsUpdateLogsChannelId = ''
        WHERE soundboardSoundsUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET soundboardSoundsLogsChannelId = ''
        WHERE soundboardSoundsLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET stageInstanceCreateLogsChannelId = ''
        WHERE stageInstanceCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET stageInstanceDeleteLogsChannelId = ''
        WHERE stageInstanceDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET stageInstanceUpdateLogsChannelId = ''
        WHERE stageInstanceUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET threadCreateLogsChannelId = ''
        WHERE threadCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET threadDeleteLogsChannelId = ''
        WHERE threadDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET threadUpdateLogsChannelId = ''
        WHERE threadUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET threadMemberUpdateLogsChannelId = ''
        WHERE threadMemberUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET threadMembersUpdateLogsChannelId = ''
        WHERE threadMembersUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET threadListSyncLogsChannelId = ''
        WHERE threadListSyncLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageReactionAddLogsChannelId = ''
        WHERE messageReactionAddLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageReactionRemoveLogsChannelId = ''
        WHERE messageReactionRemoveLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageReactionRemoveAllLogsChannelId = ''
        WHERE messageReactionRemoveAllLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageReactionRemoveEmojiLogsChannelId = ''
        WHERE messageReactionRemoveEmojiLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET autoModerationActionExecutionLogsChannelId = ''
        WHERE autoModerationActionExecutionLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET autoModerationRuleCreateLogsChannelId = ''
        WHERE autoModerationRuleCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET autoModerationRuleDeleteLogsChannelId = ''
        WHERE autoModerationRuleDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET autoModerationRuleUpdateLogsChannelId = ''
        WHERE autoModerationRuleUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET integrationCreateLogsChannelId = ''
        WHERE integrationCreateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET integrationDeleteLogsChannelId = ''
        WHERE integrationDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET integrationUpdateLogsChannelId = ''
        WHERE integrationUpdateLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET typingStartLogsChannelId = ''
        WHERE typingStartLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageEmbedDeleteLogsChannelId = ''
        WHERE messageEmbedDeleteLogsChannelId IS NULL
    `).run();
    db.prepare(`
        UPDATE guilds
        SET messageEmbedDeleteWebhookUrl = ''
        WHERE messageEmbedDeleteWebhookUrl IS NULL
    `).run();
    
    const botColumns = {
        id: "TEXT DEFAULT NULL",
        sys: "TEXT DEFAULT '[]'",
        owner: "TEXT DEFAULT '[]'",
        wl: "TEXT DEFAULT '[]'",
        categories: "TEXT DEFAULT '[]'",
    };
    
    Object.entries(botColumns).forEach(([columnName, columnDefinition]) => {
        addColumnIfNotExists('bot', columnName, columnDefinition);
    });
    return db;
}
