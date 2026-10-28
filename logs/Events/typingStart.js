const { sendTypingLog } = require('../Utils/typingLogs');

const recentTypingLogs = new Map();

function isRecentlyLogged(typing) {
  const key = `${typing.guild?.id || 'dm'}:${typing.channel?.id || 'unknown'}:${typing.user?.id || 'unknown'}`;
  const now = Date.now();
  const lastLogAt = recentTypingLogs.get(key) || 0;
  if (now - lastLogAt < 10000) return true;

  recentTypingLogs.set(key, now);
  setTimeout(() => recentTypingLogs.delete(key), 15000).unref?.();
  return false;
}

module.exports = {
  name: 'typingStart',
  async execute(typing, bot) {
    if (!typing?.guild || typing.user?.bot) return;
    if (isRecentlyLogged(typing)) return;

    await sendTypingLog(bot, typing.guild.id, typing);
  },
};
