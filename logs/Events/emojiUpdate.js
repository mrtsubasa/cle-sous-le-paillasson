const Discord = require('discord.js');
const { sendEmojiLog } = require('../Utils/emojiLogs');

async function getEmojiAuditEntry(guild, emojiId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.EmojiUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === emojiId && isRecent;
  }) || null;
}

module.exports = {
  name: 'emojiUpdate',
  async execute(oldEmoji, newEmoji, bot) {
    if (!newEmoji?.guild || oldEmoji?.name === newEmoji.name) return;

    const auditEntry = await getEmojiAuditEntry(newEmoji.guild, newEmoji.id);
    await sendEmojiLog(bot, newEmoji.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldEmoji,
      emoji: newEmoji,
    });
  },
};
