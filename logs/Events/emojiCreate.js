const Discord = require('discord.js');
const { sendEmojiLog } = require('../Utils/emojiLogs');

async function getEmojiAuditEntry(guild, emojiId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.EmojiCreate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === emojiId && isRecent;
  }) || null;
}

module.exports = {
  name: 'emojiCreate',
  async execute(emoji, bot) {
    if (!emoji?.guild) return;

    const auditEntry = await getEmojiAuditEntry(emoji.guild, emoji.id);
    await sendEmojiLog(bot, emoji.guild.id, 'create', {
      executor: auditEntry?.executor,
      emoji,
    });
  },
};
