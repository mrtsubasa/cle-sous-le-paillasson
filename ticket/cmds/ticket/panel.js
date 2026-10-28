const { ContainerBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

module.exports = {
    name: 'ticket',
    description: "Ouvre un ticket de support.",
    category: "mod",
    usage: 'ticket',
    go: async (client, db, config, interaction, args) => {
        try {
            const privilegedIds = config.buyers || [];
            const isOwner = db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) || privilegedIds.includes(interaction.user.id) || interaction.user.id === interaction.guild.ownerId;
            if (!isOwner) {
                return interaction.reply({
                    content: `Vous n'avez pas les permissions pour exécuter cette commande.`,
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const ticketContainer = new ContainerBuilder()
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(
                        '## Ouvrir un Ticket ?!\n',
                    ),
                )
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent("```ansi\n\u001b[2;34m\u001b[2;30m\u001b[2;31m\u001b[2;32m\u001b[2;33m\u001b[2;32m\u001b[2;36m\u001b[2;37m\u001b[2;36m\u001b[2;34m\u001b[2;36m\u001b[2;34mL'assistance est disponible 24h/24 et 7j/7.\u001b[0m\u001b[2;36m\u001b[0m\u001b[2;34m\u001b[0m\u001b[2;36m\u001b[0m\u001b[2;37m\u001b[0m\u001b[2;36m\u001b[0m\u001b[2;32m\u001b[0m\u001b[2;33m\u001b[0m\u001b[2;32m\u001b[0m\u001b[2;31m\u001b[0m\u001b[2;30m\u001b[0m\u001b[2;34m\u001b[0m\n```"),
                )
                .addSeparatorComponents((separator) => separator)
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent('> - Cliquez sur le menu déroulant ci-dessous !'),
                )
                .addSeparatorComponents((separator) => separator)
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent('> - Sélectionnez la catégorie adaptée à votre demande !'),
                )
                .addSeparatorComponents((separator) => separator)
                .addActionRowComponents((actionRow) =>
                    actionRow.setComponents(
                        new StringSelectMenuBuilder()
                            .setCustomId('selectticket')
                            .setPlaceholder('Choissiez une catégorie')
                            .addOptions([ 
                                {
                                    label: 'Questions Serveur',
                                    value: 'couronne',
                                    description: 'Contactez un owner ou poser une question.',
                                    emoji: '<:couronne:1519427808965955755>',
                                },
                                {
                                    label: 'Gestion Staff',
                                    value: 'gs',
                                    description: 'Devenir staff, reclamer un rank ou recuperer des roles.',
                                    emoji: '<:gs:1519428013354123345>',
                                },
                                {
                                    label: 'Gestion Abus',
                                    value: 'gap',
                                    description: 'En cas de conflit ou problème avec un membre ou un staff.',
                                    emoji: '<:gap:1519428174499287060>',
                                },
                                {
                                    label: 'Gestion Coins',
                                    value: 'coins',
                                    description: 'Questions concernant le bot coins.',
                                    emoji: '<:coins:1519428342258995262>',
                                },
                                {
                                    label: 'Gestion Animation',
                                    value: 'animation',
                                    description: 'Devenir Animation ou proposer une idée d\'animation.',
                                    emoji: '<:animation:1519428535586918502>',
                                },
                                {
                                    label: 'Community Manager',
                                    value: 'cm',
                                    description: 'Faire une demande de partenariat.',
                                    emoji: '<:cm:1519428918031941734>',
                                }
                                ,{
                                    label: 'En cas de Bug',
                                    value: 'bug',
                                    description: 'En cas de bug pour rechoisir une categorie (aucun ticket sera cree).',
                                    emoji: '<:ddd:1519429099565613208>',
                                }
                            ])
                    ),
                );

            await interaction.channel.send({
                components: [ticketContainer],
                flags: MessageFlags.IsComponentsV2,
            });

            await interaction.deleteReply().catch(() => {});

        } catch (error) {
            client.error(error);
        }
    }
};
