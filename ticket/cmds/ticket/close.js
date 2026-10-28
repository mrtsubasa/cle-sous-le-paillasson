const { closeTicket } = require('../../utils/ticket-core');

module.exports = {
    name: 'close',
    description: 'Ferme le ticket',
    type: 1,
    go: async (client, db, config, interaction, args) => {
        client.info(`${interaction.user.tag} (${interaction.user.id}) => /close`);
        await closeTicket({ interaction, client, db, config });
    },
};
