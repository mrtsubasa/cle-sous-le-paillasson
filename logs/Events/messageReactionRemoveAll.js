const { sendReactionLog } = require('../Utils/reactionLogs');

module.exports = {
  name: 'messageReactionRemoveAll',
  async execute(message, reactions, bot) {
    if (!message?.guild) return;

    const firstReaction = reactions?.first?.() || [...(reactions?.values?.() || [])][0] || null;
    await sendReactionLog(bot, message.guild.id, 'remove_all', {
      reaction: firstReaction,
      emoji: firstReaction?.emoji || 'Toutes',
      message,
      count: reactions?.size ?? 'inconnu',
    });
  },
};
