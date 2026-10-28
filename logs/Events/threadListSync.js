const { sendThreadLog } = require('../Utils/threadLogs');

module.exports = {
  name: 'threadListSync',
  async execute(threads, guild, bot) {
    if (!guild?.id) return;

    const firstThread = threads?.first?.() || [...(threads?.values?.() || [])][0] || null;
    await sendThreadLog(bot, guild.id, 'list_sync', {
      executor: null,
      threads,
      thread: firstThread,
    });
  },
};
