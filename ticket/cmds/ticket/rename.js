const { ContainerBuilder, MessageFlags } = require('discord.js');

const createContainer = (text) => new ContainerBuilder()
    .addTextDisplayComponents((textDisplay) => textDisplay.setContent(text));

module.exports = {
    name: 'rename',
    description: 'Renomme le ticket',
    options: [
        {
            name: 'newname',
            description: 'Nouveau nom pour le ticket',
            required: true,
            type: 3,
        },
    ],
    go: async (client, db, config, interaction, args) => {
        try {
            client.info(`${interaction.user.tag} (${interaction.user.id}) => /rename`)
            const newName = interaction.options.getString('newname');
            if (!interaction.channel.topic) return interaction.reply({ components: [createContainer("> Ce n'est pas un salon de ticket.")], flags: MessageFlags.IsComponentsV2, ephemeral: true });

            await interaction.channel.setName(newName);
            interaction.reply({ components: [createContainer(`> Le ticket a été renommé en ${newName}.`)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        } catch (error) {
            client.error(error);
            interaction.reply({ components: [createContainer(`> Une erreur s'est produite lors du renommage du ticket.`, 0xFF0000)], flags: MessageFlags.IsComponentsV2, ephemeral: true });
        }
    },
};
