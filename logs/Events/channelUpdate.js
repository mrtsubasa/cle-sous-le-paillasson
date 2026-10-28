const Discord = require('discord.js');
const { sendChannelLog } = require('../Utils/channelLogs');
const { sendStageLog } = require('../Utils/stageLogs');

const recentChannelUpdateLogs = new Map();

async function getChannelAuditEntry(guild, channelId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.ChannelUpdate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === channelId && isRecent;
  }) || null;
}

function slowmode(channel) {
  return Number(channel?.rateLimitPerUser || 0);
}

function nsfw(channel) {
  return Boolean(channel?.nsfw);
}

function topic(channel) {
  return String(channel?.topic || '');
}

function hasUsefulChange(oldChannel, newChannel) {
  return oldChannel.name !== newChannel.name
    || oldChannel.parentId !== newChannel.parentId
    || topic(oldChannel) !== topic(newChannel)
    || slowmode(oldChannel) !== slowmode(newChannel)
    || nsfw(oldChannel) !== nsfw(newChannel)
    || oldChannel.bitrate !== newChannel.bitrate
    || oldChannel.userLimit !== newChannel.userLimit;
}

function isRecentlyLogged(channelId) {
  const now = Date.now();
  const lastLogAt = recentChannelUpdateLogs.get(channelId) || 0;
  if (now - lastLogAt < 2500) return true;

  recentChannelUpdateLogs.set(channelId, now);
  setTimeout(() => recentChannelUpdateLogs.delete(channelId), 5000).unref?.();
  return false;
}

module.exports = {
  name: 'channelUpdate',
  async execute(oldChannel, newChannel, bot) {
    if (!newChannel?.guild || !hasUsefulChange(oldChannel, newChannel)) return;
    if (isRecentlyLogged(`${newChannel.guild.id}:${newChannel.id}`)) return;

    const auditEntry = await getChannelAuditEntry(newChannel.guild, newChannel.id);

    if (oldChannel.type === Discord.ChannelType.GuildStageVoice || newChannel.type === Discord.ChannelType.GuildStageVoice) {
      await sendStageLog(bot, newChannel.guild.id, 'update', {
        executor: auditEntry?.executor,
        oldStageChannel: oldChannel,
        stageChannel: newChannel,
      });
      return;
    }

    await sendChannelLog(bot, newChannel.guild.id, 'update', {
      executor: auditEntry?.executor,
      oldChannel,
      channel: newChannel,
    });
  },
};
