const { sendThreadLog } = require('../Utils/threadLogs');

module.exports = {
  name: 'threadMembersUpdate',
  async execute(addedMembers, removedMembers, thread, bot) {
    if (!thread?.guild) return;

    await sendThreadLog(bot, thread.guild.id, 'members_update', {
      executor: null,
      addedMembers,
      removedMembers,
      thread,
    });
  },
};
