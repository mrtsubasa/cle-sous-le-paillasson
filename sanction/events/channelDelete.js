const { cleanUpChannels } = require('../utils/channelCleanup');
const gwCommand = require('../commands/gw');

module.exports = {
  name: 'channelDelete',
  async execute(channel) {
  if (!channel || !channel.guild) return;
  cleanUpChannels(channel.guild);
  gwCommand.cleanupGiveawaysForChannel(channel.id);
  }
};

