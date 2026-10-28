const { ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'unblticket',
    description: "Retire un utilisateur de la blacklist des tickets",
    type: 1,
    options: [
        {
            name: 'user',
            description: "L'utilisateur à retirer de la blacklist",
            type: 6,
            required: true
        }
    ],
    go: async (client, db, config, interaction, args) => {
        try {
            const privilegedIds = config.buyers || [];
            if (!db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) && 
                !privilegedIds.includes(interaction.user.id) && 
                interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ components: [createContainer(`> Vous n'avez pas les permissions pour exécuter cette commande.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }

            const user = interaction.options.getUser('user');

            if (!db.get(`blacklist_${user.id}`)) {
                return interaction.reply({ components: [createContainer(`> L'utilisateur ${user} n'est pas blacklisté.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }

            db.delete(`blacklist_${user.id}`);

            interaction.reply({ components: [createContainer(`> L'utilisateur ${user} a été retiré de la blacklist des tickets.`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        } catch (error) {
            client.error(error);
            interaction.reply({ components: [createContainer(`> Veuillez réessayer ultérieurement.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }
    }
};
