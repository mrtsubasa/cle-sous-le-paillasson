const { ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'remove',
    description: 'Retire un utilisateur du ticket',
    options: [
        {
            name: 'user',
            description: 'Utilisateur à retirer',
            required: true,
            type: 6,
        },
    ],
    go: async (client, db, config, interaction, args) => {
        try {
            client.info(`${interaction.user.tag} (${interaction.user.id}) => /remove`)
            const user = interaction.options.getUser('user');
            if (!interaction.channel.topic) return interaction.reply({ components: [createContainer("> Ce n'est pas un salon de ticket.")], flags: MessageFlags.IsComponentsV2, ephemeral: true });

            await interaction.channel.permissionOverwrites.edit(user, { ViewChannel: false });

            interaction.reply({ components: [createContainer(`> L'utilisateur ${user} a été retiré du ticket.`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        } catch (error) {
            client.error(error);
            interaction.reply({ components: [createContainer(`> Une erreur s'est produite lors du retrait de l'utilisateur du ticket.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }
    },
};
