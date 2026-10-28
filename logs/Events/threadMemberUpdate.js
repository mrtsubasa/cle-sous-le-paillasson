const { sendThreadLog } = require('../Utils/threadLogs');

module.exports = {
  name: 'threadMemberUpdate',
  async execute(oldMember, newMember, bot) {
    const thread = newMember?.thread || oldMember?.thread;
    if (!thread?.guild) return;

    await sendThreadLog(bot, thread.guild.id, 'member_update', {
      executor: null,
      oldMember,
      newMember,
      thread,
    });
  },
};
