const { handleWebhooksUpdate } = require('../Utils/webhookLogs');

module.exports = {
  name: 'webhooksUpdate',
  async execute(channel, bot) {
    await handleWebhooksUpdate(bot, channel);
  },
};
