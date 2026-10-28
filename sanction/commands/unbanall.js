const { hasPermissionForCommand } = require('../utils/permissions');

module.exports = {
    name: 'unbanall',
    async executePrefix(message) {
        if (!hasPermissionForCommand(message.member, 'unbanall')) {
            return message.reply({ content: "Vous n'avez pas la permission d'utiliser cette commande", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        let bans;
        try {
            bans = await message.guild.bans.fetch();
        } catch {
            return message.reply({ content: 'Impossible de r\u00e9cup\u00e9rer la liste des bans', allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        if (!bans || bans.size === 0) {
            return message.reply({ content: "Aucun utilisateur n'est ban", allowedMentions: { parse: [] }, mentionRepliedUser: false });
        }

        let count = 0;
        for (const ban of bans.values()) {
            try {
                await message.guild.members.unban(ban.user.id);
                count += 1;
            } catch {
            }
        }

        return message.reply({ content: `**${count}** utilisateurs ont \u00e9t\u00e9 unban`, allowedMentions: { parse: [] }, mentionRepliedUser: false });
    }
};

