const { sendReactionLog } = require('../Utils/reactionLogs');

async function fetchReaction(reaction) {
  if (reaction?.partial) return reaction.fetch().catch(() => reaction);
  return reaction;
}

module.exports = {
  name: 'messageReactionRemoveEmoji',
  async execute(reaction, bot) {
    reaction = await fetchReaction(reaction);
    if (!reaction?.message?.guild) return;

    await sendReactionLog(bot, reaction.message.guild.id, 'remove_emoji', {
      reaction,
      emoji: reaction.emoji,
      message: reaction.message,
    });
  },
};
