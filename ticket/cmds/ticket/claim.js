const { claimTicket } = require('../../utils/ticket-core');

module.exports = {
    name: 'claim',
    description: 'Claim le ticket en cours',
    type: 1,
    go: async (client, db, config, interaction, args) => {
        client.info(`${interaction.user.tag} (${interaction.user.id}) => /claim`);
        await claimTicket({ interaction, client, db, config });
    },
};
