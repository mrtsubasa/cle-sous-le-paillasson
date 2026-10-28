const { MessageFlags } = require('discord.js');
const { buildLogsConfigContainer, migrateLegacyLogsConfig } = require('../../utils/logs-config');

module.exports = {
    name: 'logs',
    description: 'Configure les salons de logs',
    type: 1,
    go: async (client, db, config, interaction, args) => {
        try {
            const privilegedIds = config.buyers || [];
            if (!db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) && 
                !privilegedIds.includes(interaction.user.id) && 
                interaction.user.id !== interaction.guild.ownerId) {
                return interaction.reply({ 
                    content: `Vous n'avez pas les permissions pour exécuter cette commande.`, 
                    ephemeral: true 
                });
            }

            await interaction.deferReply({ ephemeral: true });

            migrateLegacyLogsConfig(db, interaction.guild.id);

            const logsContainer = buildLogsConfigContainer(db, interaction.guild.id);

            await interaction.editReply({
                components: [logsContainer],
                flags: MessageFlags.IsComponentsV2
            });

        } catch (error) {
            client.error(error);
            interaction.reply({
                content: 'Une erreur est survenue lors du traitement de votre demande.',
                ephemeral: true
            });
        }
    }
};
