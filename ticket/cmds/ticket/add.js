const { ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'adduser',
    description: 'Ajoute un utilisateur au ticket',
    options: [
        {
            name: 'user',
            description: 'Utilisateur à ajouter',
            required: true,
            type: 6,
        },
    ],
    go: async (client, db, config, interaction, args) => {
        try {
            const user = interaction.options.getUser('user');
            if (!interaction.channel.topic) return interaction.reply({ components: [createContainer("> Ce n'est pas un salon de ticket.")], flags: MessageFlags.IsComponentsV2, ephemeral: true });
            client.info(`${interaction.user.tag} (${interaction.user.id}) => /adduser`)

            await interaction.channel.permissionOverwrites.create(user, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true,
                ReadMessageHistory: true
            });

            interaction.reply({ components: [createContainer(`> L'utilisateur ${user} a été ajouté au ticket.`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        } catch (error) {
            client.error(error);
            interaction.reply({ components: [createContainer(`> Une erreur s'est produite lors de l'ajout de l'utilisateur au ticket.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }
    },
};
