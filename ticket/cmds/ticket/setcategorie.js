const { ChannelType, ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'setcategorie',
    description: "Définit la catégorie pour les tickets",
    type: 1,
    options: [
        {
            name: 'type',
            description: "Type de ticket à configurer",
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
            name: 'categorie',
            description: "Spécifie la nouvelle catégorie pour les tickets",
            type: 7,
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
            client.info(`${interaction.user.tag} (${interaction.user.id}) => /setcategorie`)

            const ticketType = interaction.options.getString('type');
            const newCategory = interaction.options.getChannel('categorie');
            if (!newCategory || newCategory.type !== ChannelType.GuildCategory) {
                return interaction.reply({
                    components: [createContainer(`> Le salon sélectionné doit être une vraie catégorie.`, 0xFF0000)],
                    flags: MessageFlags.IsComponentsV2,
                    ephemeral: true,
                });
            }
            let dbKey;

            switch (ticketType) {
                case 'couronne':
                    dbKey = `ticketcategorycouronne_${interaction.guild.id}`;
                    break;
                case 'gs':
                    dbKey = `ticketcategorygs_${interaction.guild.id}`;
                    break;
                case 'gap':
                    dbKey = `ticketcategorygap_${interaction.guild.id}`;
                    break;
                case 'coins':
                    dbKey = `ticketcategorycoins_${interaction.guild.id}`;
                    break;
                case 'animation':
                    dbKey = `ticketcategoryanimation_${interaction.guild.id}`;
                    break;
                case 'cm':
                    dbKey = `ticketcategorycm_${interaction.guild.id}`;
                    break;
                default:
                    return interaction.reply({ components: [createContainer(`> Type de ticket invalide.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            }

            db.set(dbKey, newCategory.id);

                interaction.reply({ components: [createContainer(`> La catégorie pour les tickets de type ${ticketType} a été définie sur ${newCategory.name}.`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        } catch (error) {
            client.error(error);
                interaction.reply({ components: [createContainer(`> Veuillez réessayer ultérieurement.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }
    }
};
