const Discord = require('discord.js');
const { sendStickerLog } = require('../Utils/stickerLogs');

async function getStickerAuditEntry(guild, stickerId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.StickerDelete,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === stickerId && isRecent;
  }) || null;
}

module.exports = {
  name: 'stickerDelete',
  async execute(sticker, bot) {
    if (!sticker?.guild) return;

    const auditEntry = await getStickerAuditEntry(sticker.guild, sticker.id);
    await sendStickerLog(bot, sticker.guild.id, 'delete', {
      executor: auditEntry?.executor,
      sticker,
    });
  },
};
