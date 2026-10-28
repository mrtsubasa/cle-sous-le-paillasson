const { ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'setrole',
    description: 'Définit le rôle pour la gestion des tickets.',
    type: 1,
    options: [
        {
            name: 'type',
            description: "Type de gestion pour lequel définir le rôle",
            type: 3, 
            required: true,
            choices: [
                { name: 'Questions Serveur', value: 'couronne' },
                { name: 'Gestion Staff', value: 'gs' },
                { name: 'Gestion Abus', value: 'gap' },
                { name: 'Gestion Coins', value: 'coins' },
                { name: 'Gestion Animation', value: 'animation' },
                { name: 'Community Manager', value: 'cm' }
            ]
        },
        {
            name: 'role',
            description: "Le rôle à définir",
            type: 8,
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
            client.info(`${interaction.user.tag} (${interaction.user.id}) => /setrole`)

            const roleType = interaction.options.getString('type');
            const role = interaction.options.getRole('role');
            let dbKey;

            switch (roleType) {
                case 'couronne':
                    dbKey = `couronnerole_${interaction.guild.id}`;
                    break;
                case 'gs':
                    dbKey = `gsrole_${interaction.guild.id}`;
                    break;
                case 'gap':
                    dbKey = `gaprole_${interaction.guild.id}`;
                    break;
                case 'coins':
                    dbKey = `coinsrole_${interaction.guild.id}`;
                    break;
                case 'animation':
                    dbKey = `animationrole_${interaction.guild.id}`;
                    break;
                case 'cm':
                    dbKey = `cmrole_${interaction.guild.id}`;
                    break;
                default:
                    return interaction.reply({ components: [createContainer(`> Type de rôle invalide.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }

            db.set(dbKey, role.id);

                interaction.reply({ components: [createContainer(`> Le rôle pour ${roleType} a été défini sur ${role}.`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        } catch (error) {
            client.error(error);
                interaction.reply({ components: [createContainer(`> Une erreur est survenue lors du traitement de votre demande. Veuillez réessayer ultérieurement.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }
    }
};
