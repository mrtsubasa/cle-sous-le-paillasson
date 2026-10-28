const { data, saveProtected } = require('../utils/state');
const { hasPermissionForCommand } = require('../utils/permissions');
const { yesCard, noCard, permissionCard } = require('../utils/cards');

module.exports = {
    name: 'clearprotect',
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'clearprotect')) {
            return message.reply({ ...permissionCard(), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const guildId = String(message.guild.id);
        const list = data.protected[guildId] || [];
        if (list.length === 0) {
            return message.reply({ ...noCard("Aucun protect n'\u00e9tait configur\u00e9"), allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        const count = list.length;
        data.protected[guildId] = [];
        saveProtected();
        return message.reply({ ...yesCard(`*Tous les protect ont \u00e9t\u00e9 supprim\u00e9s*`), allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};

