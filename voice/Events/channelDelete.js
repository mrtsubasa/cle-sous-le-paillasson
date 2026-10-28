const { getGuildTempVocalChannelOwner, removeGuildTempVocalChannel } = require('../Utils/bot.js');

module.exports = {
  name: 'channelDelete',
  async execute(channel, bot) {
    if (!channel || !channel.guildId) return;

    const voiceOwnerId = getGuildTempVocalChannelOwner(bot, channel.guildId, channel.id);
    if (voiceOwnerId) {
      await removeGuildTempVocalChannel(bot, channel.guildId, channel.id);
    }
  },
};
