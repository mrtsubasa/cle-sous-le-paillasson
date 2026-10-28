const { refreshLeaderboardMessage } = require('../../utils/leaderboard');

module.exports = {
    name: 'leaderboard',
    description: 'Affiche le leaderboard tickets (claim, close, notes)',
    dm: false,
    type: 1,
    go: async (client, db, config, interaction, args) => {
        if (!interaction.guild) {
            return interaction.reply({
                content: 'Cette commande doit être utilisée dans un serveur.',
                ephemeral: true,
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const leaderboardChannelKey = `leaderboard_channel_${interaction.guild.id}`;
        const leaderboardMessageKey = `leaderboard_message_${interaction.guild.id}`;
        const previousChannelId = db.get(leaderboardChannelKey);

        db.set(leaderboardChannelKey, interaction.channel.id);
        if (previousChannelId && previousChannelId !== interaction.channel.id) {
            db.delete(leaderboardMessageKey);
        }

        const result = await refreshLeaderboardMessage({
            client,
            db,
            guildId: interaction.guild.id,
            channelId: interaction.channel.id,
        });

        if (!result.updated) {
            return interaction.editReply({
                content: 'Impossible de mettre a jour le leaderboard dans ce salon.',
                ephemeral: true,
            }).catch(() => {});
        }

        await interaction.deleteReply().catch(() => {});
    },
};
