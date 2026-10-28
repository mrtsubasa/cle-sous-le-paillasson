const { data, saveSystems } = require('../utils/state');
const { isBotOwner } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');

module.exports = {
    name: 'clearsys',
    async executePrefix(message) {
        if (!isBotOwner(message.author.id)) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);
        const list = data.systems[guildId] || [];
        if (list.length === 0) {
            return message.reply({ ...noCard("Aucun syst\u00e8me n'\u00e9tait configur\u00e9"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const count = list.length;
        data.systems[guildId] = [];
        saveSystems();
        return message.reply({ ...yesCard(`*Tous les systemes ont \u00e9t\u00e9 supprim\u00e9s*`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};
