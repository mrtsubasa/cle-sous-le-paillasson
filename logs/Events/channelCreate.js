const Discord = require('discord.js');
const { sendChannelLog } = require('../Utils/channelLogs');
const { sendStageLog } = require('../Utils/stageLogs');

async function getChannelAuditEntry(guild, channelId) {
  const logs = await guild.fetchAuditLogs({
    type: Discord.AuditLogEvent.ChannelCreate,
    limit: 6,
  }).catch(() => null);

  return logs?.entries?.find((auditEntry) => {
    const targetId = auditEntry.targetId || auditEntry.target?.id;
    const isRecent = Date.now() - auditEntry.createdTimestamp < 10000;
    return targetId === channelId && isRecent;
  }) || null;
}

module.exports = {
  name: 'channelCreate',
  async execute(channel, bot) {
    if (!channel?.guild) return;

    const auditEntry = await getChannelAuditEntry(channel.guild, channel.id);

    if (channel.type === Discord.ChannelType.GuildStageVoice) {
      await sendStageLog(bot, channel.guild.id, 'create', {
        executor: auditEntry?.executor,
        stageChannel: channel,
      });
      return;
    }

    await sendChannelLog(bot, channel.guild.id, 'create', {
      executor: auditEntry?.executor,
      channel,
    });
  },
};
