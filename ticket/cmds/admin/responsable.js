const { ContainerBuilder, MessageFlags } = require('discord.js');

module.exports = {
    name: 'responsable',
    description: 'Gère les rôles responsables (accès permanent aux tickets)',
    type: 1,
    options: [
        {
            name: 'action',
            description: "L'action à effectuer",
            type: 3,
            required: true,
            choices: [
                { name: 'add', value: 'add' },
                { name: 'remove', value: 'remove' },
                { name: 'list', value: 'list' }
            ]
        },
        {
            name: 'role',
            description: "Le rôle responsable",
            type: 8,
            required: false
        }
    ],
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

            const action = interaction.options.getString('action');
            const role = interaction.options.getRole('role');

            const responsables = db.get(`responsables_${interaction.guild.id}`) || [];

            if (action === 'list') {
                let listText = '## Liste des rôles responsables\n\n';
                
                if (responsables.length === 0) {
                    listText += 'Aucun rôle responsable configuré.\n\n';
                    listText += 'Les rôles responsables ont accès à tous les tickets,\nmême après qu\'ils soient claim par un staff.';
                } else {
                    listText += '**Rôles configurés**\n\n';
                    for (let i = 0; i < responsables.length; i++) {
                        const roleId = responsables[i];
                        const roleObj = interaction.guild.roles.cache.get(roleId);
                        if (roleObj) {
                            listText += `${i + 1}. ${roleObj}\n`;
                        }
                    }
                    listText += '\nCes rôles ont accès permanent à tous les tickets.';
                }

                const listContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent(listText),
                    );

                return interaction.reply({
                    components: [listContainer],
                    flags: MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }

            if (action === 'add') {
                if (!role) {
                    return interaction.reply({
                        content: 'Veuillez spécifier un rôle à ajouter.',
                        ephemeral: true
                    });
                }

                if (responsables.includes(role.id)) {
                    const errorContainer = new ContainerBuilder()
                        .addTextDisplayComponents((textDisplay) =>
                            textDisplay.setContent(`## Attention\n\nLe rôle ${role} est déjà dans la liste des responsables.`),
                        );

                    return interaction.reply({
                        components: [errorContainer],
                        flags: MessageFlags.IsComponentsV2,
                        ephemeral: true
                    });
                }

                responsables.push(role.id);
                db.set(`responsables_${interaction.guild.id}`, responsables);

                const successContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent(`## Rôle ajouté\n\nLe rôle ${role} a été ajouté à la liste des responsables.\n\nCe rôle aura désormais accès à tous les tickets, même claim.`),
                    );

                return interaction.reply({
                    components: [successContainer],
                    flags: MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }

            if (action === 'remove') {
                if (!role) {
                    return interaction.reply({
                        content: 'Veuillez spécifier un rôle à retirer.',
                        ephemeral: true
                    });
                }

                const index = responsables.indexOf(role.id);
                if (index === -1) {
                    const errorContainer = new ContainerBuilder()
                        .addTextDisplayComponents((textDisplay) =>
                            textDisplay.setContent(`## Erreur\n\nLe rôle ${role} n'est pas dans la liste des responsables.`),
                        );

                    return interaction.reply({
                        components: [errorContainer],
                        flags: MessageFlags.IsComponentsV2,
                        ephemeral: true
                    });
                }

                responsables.splice(index, 1);
                db.set(`responsables_${interaction.guild.id}`, responsables);

                const successContainer = new ContainerBuilder()
                    .addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent(`## Rôle retiré\n\nLe rôle ${role} a été retiré de la liste des responsables.`),
                    );

                return interaction.reply({
                    components: [successContainer],
                    flags: MessageFlags.IsComponentsV2,
                    ephemeral: true
                });
            }

        } catch (error) {
            client.error(error);
            interaction.reply({
                content: 'Une erreur est survenue lors du traitement de votre demande.',
                ephemeral: true
            });
        }
    }
};
