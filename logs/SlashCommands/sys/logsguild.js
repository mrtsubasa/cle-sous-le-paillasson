const command = require('../../Commands/sys/logsguild');

module.exports = {
  name: 'logsguild',
  description: 'Configure les logs guildUpdate',
  dm_permission: false,
  perm: 'sys',

  run: async (bot, interaction) => {
    if (!interaction.guild) return;

    const messageLike = {
      id: interaction.id,
      author: interaction.user,
      guild: interaction.guild,
      reply: async (payload) => {
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp(payload);
          return interaction.fetchReply().catch(() => null);
        }

        await interaction.reply(payload);
        return interaction.fetchReply();
      },
    };

    return command.run(bot, messageLike);
  },
};
