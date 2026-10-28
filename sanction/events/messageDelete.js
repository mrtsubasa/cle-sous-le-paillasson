const { recordSnipe } = require('../utils/snipeStore');

module.exports = {
  name: 'messageDelete',
  async execute(message) {
  if (!message || !message.guild) return;
  recordSnipe(message);
  }
};
