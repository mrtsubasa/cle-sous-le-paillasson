const Discord = require('discord.js');
const { sendStickerLog } = require('../Utils/stickerLogs');

async function getStickerAuditEntry(guild, stickerId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.StickerUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === stickerId && isRecent;
  }) || null;
}

function hasStickerChanges(oldSticker, newSticker) {
  return oldSticker?.name !== newSticker?.name
    || String(oldSticker?.description || '') !== String(newSticker?.description || '')
    || String(oldSticker?.tags || '') !== String(newSticker?.tags || '');
}

module.exports = {
  name: 'stickerUpdate',
  async execute(oldSticker, newSticker, bot) {
    if (!newSticker?.guild || !hasStickerChanges(oldSticker, newSticker)) return;

    const auditEntry = await getStickerAuditEntry(newSticker.guild, newSticker.id);
    await sendStickerLog(bot, newSticker.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldSticker,
      sticker: newSticker,
    });
  },
};
