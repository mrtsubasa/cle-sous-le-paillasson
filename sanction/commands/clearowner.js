const { data, saveOwners } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');

module.exports = {
    name: 'clearowner',
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'clearowner')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);
        const ownersList = data.owners[guildId] || [];
        if (ownersList.length === 0) {
            return message.reply({ ...noCard("Aucun owner n'\u00e9tait configur\u00e9"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const count = ownersList.length;
        data.owners[guildId] = [];
        saveOwners();
        return message.reply({ ...yesCard(`*Tous les owners ont \u00e9t\u00e9 supprim\u00e9s*`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};

