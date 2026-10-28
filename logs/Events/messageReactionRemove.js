const { sendReactionLog } = require('../Utils/reactionLogs');

async function fetchReaction(reaction) {
  if (reaction?.partial) return reaction.fetch().catch(() => reaction);
  return reaction;
}

module.exports = {
  name: 'messageReactionRemove',
  async execute(reaction, user, details, bot) {
    reaction = await fetchReaction(reaction);
    if (!reaction?.message?.guild || user?.bot) return;

    await sendReactionLog(bot, reaction.message.guild.id, 'remove', {
      reaction,
      emoji: reaction.emoji,
      message: reaction.message,
      user,
    });
  },
};
