const { ContainerBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

module.exports = {
    name: "help",
    dm: true,
    description: "Retourne toutes les commandes",
    type: 1,
    go: async (client, db, config, interaction, args) => {
        client.info(`${interaction.user.tag} (${interaction.user.id}) => /help`);

        if (!interaction.guild) {
            return interaction.reply({
                components: [
                    new ContainerBuilder().addTextDisplayComponents((textDisplay) =>
                        textDisplay.setContent('> Cette commande doit être utilisée dans un serveur.'),
                    ),
                ],
                flags: MessageFlags.IsComponentsV2,
                ephemeral: true,
            });
        }

        const application = interaction.client.application?.owner ? interaction.client.application : await interaction.client.application?.fetch().catch(() => interaction.client.application);
        const applicationOwnerIds = new Set(config.buyers || []);

        if (application?.owner?.id) {
            applicationOwnerIds.add(application.owner.id);
        } else if (application?.owner?.members) {
            for (const member of application.owner.members.values()) {
                applicationOwnerIds.add(member.id);
            }
        }

        const isOwner = Boolean(
            db.get(`Owner_${interaction.guild.id}-${interaction.user.id}`) ||
            db.get(`Wl_${interaction.guild.id}-${interaction.user.id}`) ||
            applicationOwnerIds.has(interaction.user.id) ||
            interaction.user.id === interaction.guild.ownerId,
        );
        const isTicketChannel = Boolean(interaction.channel?.topic);
        const ownerOnlyCommands = new Set(['owner', 'profil', 'logs', 'responsable', 'setrole', 'setcategorie', 'blticket', 'unblticket', 'ticket']);
        const ticketOnlyCommands = new Set(['adduser', 'remove', 'rename', 'close', 'claim']);
        const alwaysAvailableCommands = new Set(['help', 'leaderboard']);

        const canUseCommand = (command) => {
            if (alwaysAvailableCommands.has(command.name)) return true;
            if (ownerOnlyCommands.has(command.name)) return isOwner;
            if (ticketOnlyCommands.has(command.name)) return isTicketChannel;
            return true;
        };

        const accessibleCommands = [...client.cmds.values()]
            .filter((command) => isOwner || canUseCommand(command))
            .sort((a, b) => a.name.localeCompare(b.name));

        const categories = [...new Set(accessibleCommands.map((command) => command.class))];
        const categoryLabels = {
            admin: 'Commandes Admin',
            ticket: 'Commandes Ticket',
        };

        const appCommands = await interaction.client.application.commands.fetch().catch(() => interaction.client.application.commands.cache);
        const guildCommands = await interaction.guild.commands.fetch().catch(() => interaction.guild.commands.cache);
        const commandIds = new Map(
            [...appCommands.values(), ...guildCommands.values()].map((command) => [command.name, command.id]),
        );

        const getCommandMention = (command) => {
            const commandId = commandIds.get(command.name);
            return commandId ? `</${command.name}:${commandId}>` : `/${command.name}`;
        };

        let currentPage = 0;

        const buildPage = (catIndex, disabledButtons = false) => {
            const categoryKey = categories[catIndex];
            const categoryName = categoryLabels[categoryKey?.toLowerCase()] || categoryKey || 'Commandes';
            const commandsInCategory = accessibleCommands.filter((command) => command.class === categoryKey);
            const commandList = commandsInCategory.length
                ? commandsInCategory.map((command) => `> ${getCommandMention(command)} - ${command.description || 'Aucune description.'}`).join('\n')
                : '> Aucune commande disponible.';

            return new ContainerBuilder()
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(`## ${categoryName}`),
                )
                .addSeparatorComponents((separator) => separator)
                .addTextDisplayComponents((textDisplay) =>
                    textDisplay.setContent(commandList),
                )
                .addSeparatorComponents((separator) => separator)
                .addActionRowComponents((actionRow) =>
                    actionRow.setComponents(
                        new ButtonBuilder()
                            .setCustomId('prev')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('<:icons8arrow30:1519427124430114946>')
                            .setDisabled(disabledButtons),
                        new ButtonBuilder()
                            .setCustomId('next')
                            .setStyle(ButtonStyle.Secondary)
                            .setEmoji('<:icons8arrow24:1519427238372577442>')
                            .setDisabled(disabledButtons),
                    ),
                );
        };

        await interaction.deferReply();

        const message = await interaction.editReply({
            components: [buildPage(currentPage)],
            flags: MessageFlags.IsComponentsV2,
        });

        const filter = (buttonInteraction) => buttonInteraction.customId === 'prev' || buttonInteraction.customId === 'next';
        const collector = message.createMessageComponentCollector({ filter, time: 99999999 });

        collector.on('collect', async (buttonInteraction) => {
            if (buttonInteraction.customId === 'prev') {
                currentPage = currentPage === 0 ? categories.length - 1 : currentPage - 1;
            } else if (buttonInteraction.customId === 'next') {
                currentPage = (currentPage + 1) % categories.length;
            }

            await buttonInteraction.deferUpdate();
            await message.edit({
                components: [buildPage(currentPage)],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        });

        collector.on('end', async () => {
            await message.edit({
                components: [buildPage(currentPage, true)],
                flags: MessageFlags.IsComponentsV2,
            }).catch(() => {});
        });
    }
};
