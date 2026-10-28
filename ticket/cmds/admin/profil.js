const { openBotProfilePanel } = require('../../utils/bot-profile-panel');

module.exports = {
    name: 'profil',
    description: 'Ouvre le panel de gestion du bot.',
    type: 1,
    dm: false,
    go: async (client, db, config, interaction) => {
        const privilegedIds = config.buyers || [];
        const isAllowed = db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`)
            || privilegedIds.includes(interaction.user.id)
            || interaction.user.id === interaction.guild.ownerId;

        if (!isAllowed) {
            return interaction.reply({
                content: `Vous n'avez pas les permissions pour exécuter cette commande.`,
                ephemeral: true,
            });
        }

        client.info(`${interaction.user.tag} (${interaction.user.id}) => /profil`);
        return openBotProfilePanel(client, db, config, interaction);
    },
};
