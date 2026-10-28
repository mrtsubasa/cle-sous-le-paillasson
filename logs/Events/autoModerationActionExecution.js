const { sendAutoModerationLog } = require('../Utils/autoModerationLogs');

module.exports = {
  name: 'autoModerationActionExecution',
  async execute(execution, bot) {
    if (!execution?.guild) return;

    await sendAutoModerationLog(bot, execution.guild.id, 'action_execution', {
      execution,
    });
  },
};
